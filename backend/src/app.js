/**
 * Configuración de la aplicación Express (middlewares y rutas).
 */
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const routineRoutes = require('./routes/routine.routes');
const workoutRoutes = require('./routes/workout.routes');
const sensorRoutes = require('./routes/sensor.routes');
const gpsRoutes = require('./routes/gps.routes');
const goalRoutes = require('./routes/goal.routes');
const statsRoutes = require('./routes/stats.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

app.use(cors({ origin: true }));

// Webhook de Stripe: necesita el cuerpo crudo para verificar la firma,
// por eso se monta antes del parser JSON.
app.post(
  '/api/subscriptions/webhook',
  express.raw({ type: 'application/json' }),
  subscriptionRoutes.webhookRawHandler
);

app.use(express.json());

// Verificación de salud
app.get('/api/health', (req, res) =>
  res.json({ ok: true, service: 'fittrack-api', time: new Date().toISOString() })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api', gpsRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// Manejador central de errores
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (!err.status) console.error(err);
  res.status(status).json({ error: err.status ? err.message : 'Error interno del servidor' });
});

module.exports = app;