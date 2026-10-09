/**
 * Utilidades de zona horaria (IANA) sin dependencias externas.
 * Los DATETIME de MySQL usan la hora del sistema del servidor, así que para
 * agendar recordatorios "a la hora del usuario" hay que convertir la hora
 * local del usuario a un instante y expresarlo en hora local del servidor.
 */
const pad = (n) => String(n).padStart(2, '0');

/** Devuelve el huso horario indicado, o `undefined` (zona del sistema) si es inválido. */
function safeTz(tz) {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** Minutos que hay que sumar a una fecha UTC para obtener la hora local de `tz`. */
function tzOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(date)) p[type] = value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Instante (Date) de "año-mes-día hora:minuto" interpretado en la zona indicada. */
function wallTimeToInstant(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffsetMinutes(tz, new Date(guess)) * 60000;
  utc = guess - tzOffsetMinutes(tz, new Date(utc)) * 60000; // segundo pase por si cambió el DST
  return new Date(utc);
}

/** Fecha (y día de la semana) actuales en la zona indicada. 0 = domingo. */
function datePartsInTz(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(date)) p[type] = value;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: +p.year, m: +p.month, d: +p.day, weekday: weekdays[p.weekday] ?? 0 };
}

/** Formatea un instante como 'YYYY-MM-DD HH:MM:SS' en la hora LOCAL del servidor. */
function serverLocalString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Fecha local del servidor como 'YYYY-MM-DD'. */
function serverLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = {
  pad,
  safeTz,
  tzOffsetMinutes,
  wallTimeToInstant,
  datePartsInTz,
  serverLocalString,
  serverLocalDate,
};