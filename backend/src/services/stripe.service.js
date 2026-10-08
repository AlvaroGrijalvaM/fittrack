/**
 * Integración con Stripe: PaymentSheet (formulario de pago dentro de la app),
 * modo de prueba. Si STRIPE_SECRET_KEY está vacío, la API opera en modo simulado.
 */
const Stripe = require('stripe');

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/**
 * Crea un PaymentIntent + cliente efímero para el PaymentSheet de la app.
 * Cobro único del plan premium; habilita Premium 30 días al confirmarse.
 */
async function createPaymentSheet(user, plan) {
  const stripe = getStripe();

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { user_id: String(user.userId) },
  });

  // stripe-node exige apiVersion en un hash de opciones separado para claves efímeras
  const apiVersion = stripe.getApiField('version');
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customer.id },
    { apiVersion }
  );

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(Number(plan.price_mxn) * 100),
    currency: 'mxn',
    customer: customer.id,
    automatic_payment_methods: { enabled: true },
    metadata: { user_id: String(user.userId), plan_id: String(plan.id) },
  });

  return {
    paymentIntent: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    ephemeralKey: ephemeralKey.secret,
    customer: customer.id,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  };
}

/** Devuelve el PaymentIntent (lanza error si el id no existe). */
async function retrievePaymentIntent(paymentIntentId) {
  return getStripe().paymentIntents.retrieve(paymentIntentId);
}

/** Verifica la firma de un webhook de Stripe (req.body debe ser Buffer crudo). */
function constructWebhookEvent(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET no configurado');
  return getStripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
}

module.exports = { isStripeConfigured, createPaymentSheet, retrievePaymentIntent, constructWebhookEvent };