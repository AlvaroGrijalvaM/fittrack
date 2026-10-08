/**
 * Autenticación con JWT.
 * - signToken: crea el token del usuario.
 * - authRequired: exige token Bearer válido.
 * - requirePremium: verifica el estado Premium actual en la base de datos.
 */
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const SECRET = process.env.JWT_SECRET || 'fittrack-dev-secret';

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      premium: !!user.premium,
    },
    SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Se requiere autenticación' });
  }
  try {
    req.user = jwt.verify(token, SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Función exclusiva para usuarios Premium (consulta el estado actual en DB). */
async function requirePremium(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT premium FROM users WHERE id = ? LIMIT 1',
      [req.user.userId]
    );
    if (!rows.length || !rows[0].premium) {
      return res.status(403).json({ error: 'Función exclusiva para usuarios Premium' });
    }
    req.user.premium = true;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { signToken, authRequired, requirePremium };