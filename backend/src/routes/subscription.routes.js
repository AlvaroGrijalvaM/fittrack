/**
 * Suscripción Premium: pago con Stripe PaymentSheet (formulario dentro de la
 * app, modo de prueba) y respaldo simulado cuando no hay credenciales.
 */
const crypto = require('crypto');
const express = require('express');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { authRequired } = require('../middleware/auth');
const stripeService = require('../services/stripe.service');

const router = express.Router();
router.use(authRequired);

function parseJson(value) {
  if (value == null) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return value;
  }
}

/** Plan premium activo + verificación de que el usuario no tenga uno vigente. */
async function getPremiumPlanFor(userId) {
  const [planRows] = await pool.query(
    "SELECT * FROM plans WHERE name = 'premium' AND active = 1 LIMIT 1"
  );
  if (!planRows.length) throw new HttpError(404, 'Plan premium no configurado');

  const [active] = await pool.query(
    `SELECT id FROM subscriptions
      WHERE user_id = ? AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [userId]
  );
  if (active.length) throw new HttpError(409, 'Ya tienes una suscripción Premium activa');
  return planRows[0];
}

// GET /api/subscriptions/config — modo de pago activo
router.get('/config', (req, res) => {
  res.json({ mode: stripeService.isStripeConfigured() ? 'stripe' : 'simulado' });
});

// GET /api/subscriptions/plan — información del plan premium
router.get(
  '/plan',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id, name, price_mxn, billing_interval, features FROM plans WHERE name = 'premium' AND active = 1 LIMIT 1"
    );
    if (!rows.length) throw new HttpError(404, 'Plan premium no configurado');
    const plan = rows[0];
    res.json({ plan: { ...plan, features: parseJson(plan.features) } });
  })
);

// GET /api/subscriptions/history — pagos y suscripciones del usuario
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.userId]
    );
    const [subscriptions] = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.userId]
    );
    res.json({ payments, subscriptions });
  })
);

// POST /api/subscriptions — compra simulada (solo sin credenciales de Stripe)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (stripeService.isStripeConfigured()) {
      throw new HttpError(400, 'Stripe está configurado: usa POST /api/subscriptions/payment-sheet');
    }
    const plan = await getPremiumPlanFor(req.user.userId);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const providerReference = crypto.randomUUID();

      // 1) Pago (modo simulado, imitando una pasarela real)
      const [payIns] = await conn.query(
        `INSERT INTO payments
          (user_id, amount_mxn, currency, method, status, provider, provider_reference, idempotency_key, completed_at)
         VALUES (?, ?, 'MXN', 'simulado', 'completed', 'simulado', ?, ?, NOW())`,
        [req.user.userId, plan.price_mxn, providerReference, providerReference]
      );

      // 2) Suscripción activa por 30 días (el trigger marca users.premium = 1)
      const starts = new Date();
      const expires = new Date(starts.getTime() + 30 * 24 * 3600 * 1000);
      const [subIns] = await conn.query(
        `INSERT INTO subscriptions (user_id, plan_id, status, price_mxn, started_at, expires_at)
         VALUES (?, ?, 'active', ?, ?, ?)`,
        [req.user.userId, plan.id, plan.price_mxn, starts, expires]
      );
      await conn.query('UPDATE payments SET subscription_id = ? WHERE id = ?', [
        subIns.insertId,
        payIns.insertId,
      ]);

      await conn.commit();
      const [payments] = await conn.query('SELECT * FROM payments WHERE id = ?', [payIns.insertId]);
      const [subs] = await conn.query('SELECT * FROM subscriptions WHERE id = ?', [subIns.insertId]);
      res.status(201).json({ premium: true, payment: payments[0], subscription: subs[0] });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);
// POST /api/subscriptions/payment-sheet — datos para el PaymentSheet de la app
router.post(
  '/payment-sheet',
  asyncHandler(async (req, res) => {
    if (!stripeService.isStripeConfigured()) {
      throw new HttpError(503, 'Stripe no está configurado (STRIPE_SECRET_KEY vacío)');
    }
    const plan = await getPremiumPlanFor(req.user.userId);

    const [users] = await pool.query('SELECT id, email FROM users WHERE id = ? LIMIT 1', [
      req.user.userId,
    ]);
    if (!users.length) throw new HttpError(404, 'Usuario no encontrado');

    const sheet = await stripeService.createPaymentSheet(
      { userId: users[0].id, email: users[0].email },
      plan
    );
    res.status(201).json({ mode: 'stripe', ...sheet });
  })
);

/**
 * Da de alta el pago y la suscripción tras confirmar un pago de Stripe.
 * Idempotente: si el pago ya se cumplimentó, no repite nada.
 */
async function fulfillPaidPayment({ id, amountMxn, userId, planId }) {
  if (!userId || !planId) throw new HttpError(400, 'El pago no trae usuario/plan');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [done] = await conn.query(
      "SELECT id FROM payments WHERE provider = 'stripe' AND provider_reference = ? LIMIT 1",
      [id]
    );
    if (done.length) {
      await conn.rollback();
      return { userId, alreadyFulfilled: true };
    }

    const starts = new Date();
    const expires = new Date(starts.getTime() + 30 * 24 * 3600 * 1000);

    // 1) Suscripción activa por 30 días (el trigger marca users.premium = 1)
    const [subIns] = await conn.query(
      `INSERT INTO subscriptions (user_id, plan_id, status, price_mxn, started_at, expires_at)
       VALUES (?, ?, 'active', ?, ?, ?)`,
      [userId, planId, amountMxn, starts, expires]
    );

    // 2) Pago registrado contra Stripe (idempotencia por provider_reference)
    const [payIns] = await conn.query(
      `INSERT INTO payments
        (user_id, subscription_id, amount_mxn, currency, method, status, provider,
         provider_reference, idempotency_key, gateway_response, completed_at)
       VALUES (?, ?, ?, 'MXN', 'stripe', 'completed', 'stripe', ?, ?, ?, NOW())`,
      [
        userId,
        subIns.insertId,
        amountMxn,
        id,
        id,
        JSON.stringify({ id, amount_mxn: amountMxn }),
      ]
    );

    await conn.commit();
    return {
      userId,
      alreadyFulfilled: false,
      paymentId: payIns.insertId,
      subscriptionId: subIns.insertId,
      starts,
      expires,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// POST /api/subscriptions/verify — confirma el PaymentIntent y activa Premium
router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    if (!stripeService.isStripeConfigured()) {
      throw new HttpError(503, 'Stripe no está configurado (STRIPE_SECRET_KEY vacío)');
    }
    const paymentIntentId =
      typeof req.body?.payment_intent_id === 'string' ? req.body.payment_intent_id : '';
    if (!paymentIntentId.startsWith('pi_')) {
      throw new HttpError(400, 'payment_intent_id no válido');
    }

    let intent;
    try {
      intent = await stripeService.retrievePaymentIntent(paymentIntentId);
    } catch (err) {
      if (err?.type === 'StripeInvalidRequestError') {
        throw new HttpError(404, 'Pago no encontrado en Stripe');
      }
      throw err;
    }

    const owner = Number(intent.metadata?.user_id);
    if (owner !== req.user.userId) {
      throw new HttpError(403, 'El pago no pertenece a este usuario');
    }
    if (intent.status !== 'succeeded') {
      throw new HttpError(402, 'El pago aún no se ha confirmado en Stripe');
    }

    const result = await fulfillPaidPayment({
      id: intent.id,
      amountMxn: intent.amount / 100,
      userId: owner,
      planId: Number(intent.metadata?.plan_id),
    });
    res.json({
      premium: true,
      already_fulfilled: result.alreadyFulfilled,
      subscription: result.alreadyFulfilled
        ? null
        : {
            id: result.subscriptionId,
            starts: result.starts,
            expires: result.expires,
            status: 'active',
          },
    });
  })
);

// POST /api/subscriptions/webhook — respaldo si la app se cierra antes de verificar.
// Se monta en app.js con express.raw (cuerpo sin procesar para la firma).
async function webhookRawHandler(req, res) {
  let event;
  try {
    event = stripeService.constructWebhookEvent(req);
  } catch (err) {
    return res.status(400).json({ error: `Webhook: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    try {
      await fulfillPaidPayment({
        id: intent.id,
        amountMxn: intent.amount / 100,
        userId: Number(intent.metadata?.user_id),
        planId: Number(intent.metadata?.plan_id),
      });
    } catch (err) {
      console.error('Webhook: error al cumplimentar el pago', err.message);
      return res.status(500).json({ error: 'Error al procesar el pago' });
    }
  }
  return res.json({ received: true });
}

// POST /api/subscriptions/cancel — cancelar la suscripción activa
router.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    const [active] = await pool.query(
      "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' LIMIT 1",
      [req.user.userId]
    );
    if (!active.length) throw new HttpError(404, 'No tienes una suscripción activa');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE subscriptions SET status = 'canceled', expires_at = NOW() WHERE id = ?", [
        active[0].id,
      ]);
      await conn.query('UPDATE users SET premium = 0 WHERE id = ?', [req.user.userId]);
      await conn.commit();
      res.json({ ok: true, premium: false });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

module.exports = router;
module.exports.webhookRawHandler = webhookRawHandler;