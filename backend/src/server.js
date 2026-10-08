/**
 * Punto de entrada: inicia el servidor HTTP y los trabajos agendados.
 */
require('dotenv').config();
const app = require('./app');
const cronService = require('./services/cron.service');

const PORT = Number(process.env.PORT || 3000);

cronService.start();

app.listen(PORT, () => {
  console.log(`✅ FitTrack API escuchando en http://localhost:${PORT}`);
  console.log(`   Base de datos: ${process.env.DB_NAME || 'fittrack'} @ ${process.env.DB_HOST || 'localhost'}`);
});