/**
 * Smoke test de la API de FitTrack (prueba el flujo completo).
 *
 * Requisitos:
 *   1. MySQL con el esquema importado (backend/database/fittrack.sql)
 *   2. Servidor corriendo:  npm start  (en backend/)
 *
 * El bloque de Premium se adapta al modo de pago (GET /subscriptions/config):
 *   - simulado: compra directa con POST /subscriptions
 *   - stripe: crea un PaymentIntent real en el sandbox y comprueba que
 *     verify rechaza pagos no confirmados
 *
 * Uso:
 *   node scripts/smoke-test.js
 *   (opcional) API_URL=http://localhost:3000/api node scripts/smoke-test.js
 */
const BASE = process.env.API_URL || 'http://localhost:3000/api';

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = data && data.error ? data.error : text || `HTTP ${res.status}`;
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
  return data;
}

function assert(cond, message) {
  console.log(`${cond ? '✅' : '❌'} ${message}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const email = `smoke_${Date.now()}@fittrack.test`;
  console.log('▶ Smoke test de FitTrack API\n');

  const health = await req('GET', '/health');
  assert(health.ok === true, 'GET /api/health');

  // 1) Registro + /auth/me
  const reg = await req('POST', '/auth/register', {
    name: 'Usuario Smoke',
    email,
    password: 'smoke123',
    age: 22,
    weight_kg: 70,
    height_cm: 175,
    goal: 'muscle_gain',
    level: 'beginner',
    workouts_per_week: 4,
  });
  assert(reg.token && reg.user.id > 0, 'POST /auth/register');
  const token = reg.token;

  const me = await req('GET', '/auth/me', null, token);
  assert(me.user.email === email, 'GET /auth/me');

  // 2) Rutinas (seed: 8 plantillas; premium ocultas)
  const routines = await req('GET', '/routines', null, token);
  assert(routines.routines.length >= 5, `GET /routines (${routines.routines.length} rutinas)`);
  assert(!routines.routines.some((r) => r.is_premium), 'Rutinas premium ocultas sin suscripción');
  const defaultRoutine = routines.routines.find((r) => !r.is_premium);

  // 3) Entrenamiento: iniciar, series (una sensada), sensores, finalizar
  const wo = await req('POST', '/workouts', { routine_id: defaultRoutine.id, name: defaultRoutine.name }, token);
  assert(wo.id > 0, 'POST /workouts (iniciar)');

  const detail = await req('GET', `/workouts/${wo.id}`, null, token);
  assert(detail.exercises.length >= 3, 'GET /workouts/:id (ejercicios)');
  const ex = detail.exercises[0];

  await req('POST', `/workouts/${wo.id}/exercises/${ex.workout_exercise_id}/sets`, { repetitions: 12, completed: true }, token);
  const sensado = await req('POST', `/workouts/${wo.id}/exercises/${ex.workout_exercise_id}/sets`, { sensor_reps: 12, completed: true }, token);
  assert(sensado.set_number === 2, 'POST sets (serie con sensor_reps)');

  const sensor = await req(
    'POST',
    `/sensors/workouts/${wo.id}/sensor-data`,
    {
      measurements: [
        { workout_exercise_id: ex.workout_exercise_id, sensor: 'gyroscope', metric: 'calibration_pass', value: 1, unit: 'bool' },
        { workout_exercise_id: ex.workout_exercise_id, sensor: 'magnetometer', metric: 'avg_bearing_deg', value: 45, unit: 'deg' },
      ],
    },
    token
  );
  assert(sensor.inserted === 2, 'POST /sensors/workouts/:id/sensor-data');

  const done = await req('PATCH', `/workouts/${wo.id}`, { status: 'completed' }, token);
  assert(done.workout.status === 'completed', 'PATCH /workouts/:id (completar → daily_activity)');

  // 4) Historial + estadísticas
  const history = await req('GET', '/workouts/history', null, token);
  assert(history.total >= 1, 'GET /workouts/history');
  assert(history.workouts.length <= 5, 'Historial free limitado a 5 entradas');

  const overview = await req('GET', '/stats/overview', null, token);
  assert(overview.week.workouts >= 1, 'GET /stats/overview (semana)');
  assert(overview.premium === false && overview.month === null, 'Stats avanzados bloqueados en plan free');
  const weekly = await req('GET', '/stats/weekly', null, token);
  assert(weekly.week.length === 7, 'GET /stats/weekly (7 días)');

  // 5) Objetivo
  const goal = await req('POST', '/goals', { type: 'weekly_workouts', title: 'Entrenar 4 veces', target: 4, unit: 'sesiones', period: 'week' }, token);
  assert(goal.goal.id > 0, 'POST /goals');

  // 6) GPS outdoor + rumbo del magnetómetro
  const run = await req('POST', '/workouts', { name: 'Carrera', activity_type: 'run' }, token);
  const gps = await req(
    'PUT',
    `/workouts/${run.id}/gps`,
    {
      distance_meters: 4210,
      duration_seconds: 1950,
      avg_speed_kmh: 7.7,
      max_speed_kmh: 9.1,
      avg_bearing_deg: 45,
      bearing_point: 'NE',
    },
    token
  );
  await req('POST', `/workouts/${run.id}/gps/points`, { points: [{ latitude: 25.77, longitude: -100.23, recorded_at: new Date().toISOString() }] }, token);
  assert(gps.gps && gps.gps.bearing_point === 'NE', 'PUT /workouts/:id/gps (brújula magnetómetro)');

  // 7) Notificaciones
  const prefs = await req('PUT', '/notifications/preferences', {
    workout_reminder_time: '18:00:00',
    workout_reminders_enabled: true,
    goal_completed_enabled: true,
    streak_enabled: true,
    weekly_summary_enabled: true,
    timezone: 'America/Mexico_City',
  }, token);
  assert(prefs.preferences.workout_reminder_time === '18:00:00', 'PUT /notifications/preferences (hora)');
  assert(prefs.preferences.weekly_summary_enabled === 1, 'PUT /notifications/preferences (flags nuevos)');
  assert(prefs.preferences.timezone === 'America/Mexico_City', 'PUT /notifications/preferences (timezone)');

  const hist = await req('GET', '/notifications/history', null, token);
  assert(Array.isArray(hist.notifications), 'GET /notifications/history');
  assert(typeof hist.unread === 'number', 'GET /notifications/history (contador unread)');

  if (hist.notifications.length) {
    const nid = hist.notifications[0].id;
    const readOne = await req('PATCH', `/notifications/${nid}/read`, null, token);
    assert(Boolean(readOne.notification && readOne.notification.read_at), 'PATCH /notifications/:id/read');
    const readAll = await req('POST', '/notifications/history/read-all', null, token);
    assert(Number.isInteger(readAll.updated), 'POST /notifications/history/read-all');
    const hist2 = await req('GET', '/notifications/history', null, token);
    assert(hist2.unread === 0, 'Historial queda sin no-leídas');
  } else {
    assert(true, 'PATCH /notifications/:id/read (sin historial, omitido)');
    assert(true, 'POST /notifications/history/read-all (sin historial, omitido)');
    assert(true, 'Historial queda sin no-leídas (sin historial, omitido)');
  }

  // 27) Gate de notificaciones: con goal_completed apagado no se genera
  await req('PUT', '/notifications/preferences', { goal_completed_enabled: false }, token);
  const gateGoal = await req('POST', '/goals', { type: 'weekly_workouts', title: 'Meta gated', target: 1, unit: 'sesiones', period: 'week' }, token);
  const woGate = await req('POST', '/workouts', { name: 'Entrenamiento gate' }, token);
  const doneGate = await req('PATCH', `/workouts/${woGate.id}`, { status: 'completed' }, token);
  const histGate = await req('GET', '/notifications/history?limit=100', null, token);
  const notifForGate = histGate.notifications.find((n) => n.type === 'goal_completed' && n.metadata && n.metadata.goal_id === gateGoal.goal.id);
  assert(!notifForGate, 'goal_completed_enabled=0 bloquea notificación de meta');
  assert(doneGate.workout.status === 'completed', 'Entrenamiento completado con gate de notificaciones');
  assert(Array.isArray(doneGate.completedGoals) && doneGate.completedGoals.length >= 1, 'La meta se completó igual (solo cambia la notificación)');
  await req('PUT', '/notifications/preferences', { goal_completed_enabled: true }, token);

  // 8) Premium
  const plan = await req('GET', '/subscriptions/plan', null, token);
  assert(plan.plan.price_mxn === 79, 'GET /subscriptions/plan');

  const cfg = await req('GET', '/subscriptions/config', null, token);
  assert(cfg.mode === 'stripe' || cfg.mode === 'simulado', `GET /subscriptions/config (modo ${cfg.mode})`);

  if (cfg.mode === 'stripe') {
    // Modo Stripe: PaymentIntent real en el sandbox
    const sheet = await req('POST', '/subscriptions/payment-sheet', null, token);
    assert(
      Boolean(sheet.paymentIntent && sheet.paymentIntentId && sheet.customer && sheet.ephemeralKey),
      'POST /subscriptions/payment-sheet (PaymentIntent Stripe)'
    );

    // Verify con un id inexistente debe rechazarse
    let rejected = false;
    try {
      await req('POST', '/subscriptions/verify', { payment_intent_id: 'pi_test_no_existe' }, token);
    } catch {
      rejected = true;
    }
    assert(rejected, 'POST /subscriptions/verify rechaza pago inválido');

    // Verify con el PaymentIntent real (sin pagar) → 402
    let unpaid = false;
    try {
      await req('POST', '/subscriptions/verify', { payment_intent_id: sheet.paymentIntentId }, token);
    } catch {
      unpaid = true;
    }
    assert(unpaid, 'POST /subscriptions/verify rechaza pago sin confirmar');

    const meStripe = await req('GET', '/auth/me', null, token);
    assert(!meStripe.user.premium, 'Premium inactivo sin pago confirmado');

    let legacyBlocked = false;
    try {
      await req('POST', '/subscriptions', null, token);
    } catch {
      legacyBlocked = true;
    }
    assert(legacyBlocked, 'POST /subscriptions (simulado) bloqueado con Stripe activo');
  } else {
    // Modo simulado: compra directa
    const sub = await req('POST', '/subscriptions', null, token);
    assert(sub.premium === true && sub.payment.status === 'completed', 'POST /subscriptions (pago simulado)');

    const me2 = await req('GET', '/auth/me', null, token);
    assert(Boolean(me2.user.premium), 'users.premium activado (trigger)');

    const routines2 = await req('GET', '/routines', null, token);
    assert(routines2.routines.some((r) => r.is_premium), 'Rutinas premium ahora visibles');
  }

  console.log(`\n▶ Resultado: ${process.exitCode ? 'CON FALLOS' : 'TODO OK 🎉'}`);
}

main().catch((err) => {
  console.error('❌ Smoke test falló:', err.message);
  process.exitCode = 1;
});