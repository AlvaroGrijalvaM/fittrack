/**
 * Autenticación: registro, inicio de sesión y usuario actual.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

const PUBLIC_COLUMNS =
  'id, name, email, age, weight_kg, height_cm, goal, level, workouts_per_week, premium, avatar_url, timezone, created_at';

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  age: z.number().int().min(12).max(100).nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  height_cm: z.number().positive().nullable().optional(),
  goal: z.enum(['muscle_gain', 'weight_loss', 'endurance', 'general_health', 'flexibility']).nullable().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner'),
  workouts_per_week: z.number().int().min(1).max(7).optional().default(3),
});

const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    }
    const data = parsed.data;
    const email = data.email.toLowerCase().trim();

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) {
      throw new HttpError(409, 'Ya existe una cuenta con ese correo');
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    const [result] = await pool.query(
      `INSERT INTO users
        (name, email, password_hash, age, weight_kg, height_cm, goal, level, workouts_per_week)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        email,
        password_hash,
        data.age ?? null,
        data.weight_kg ?? null,
        data.height_cm ?? null,
        data.goal ?? null,
        data.level,
        data.workouts_per_week,
      ]
    );

    // Preferencias de notificación por defecto
    await pool.query('INSERT IGNORE INTO notification_preferences (user_id) VALUES (?)', [result.insertId]);

    const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [result.insertId]);
    const user = rows[0];
    res.status(201).json({ token: signToken(user), user });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos de inicio de sesión inválidos');
    const email = parsed.data.email.toLowerCase().trim();

    const [rows] = await pool.query(
      'SELECT id, password_hash FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const found = rows[0];
    if (!found) throw new HttpError(401, 'Correo o contraseña incorrectos');

    const ok = await bcrypt.compare(parsed.data.password, found.password_hash);
    if (!ok) throw new HttpError(401, 'Correo o contraseña incorrectos');

    const [fresh] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [found.id]);
    res.json({ token: signToken(fresh[0]), user: fresh[0] });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [req.user.userId]);
    if (!rows.length) throw new HttpError(404, 'Usuario no encontrado');
    res.json({ user: rows[0] });
  })
);

module.exports = router;