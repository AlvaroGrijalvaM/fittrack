-- ============================================================================
--  FITTRACK — Base de datos MySQL
--  Esquema (tablas/columnas): inglés | Datos y textos visibles: español
--
--  Módulos: usuarios y autenticación, planes/suscripciones/pagos (el pago se
--  simula en la API; provider/idempotency_key/gateway_response soportan una
--  pasarela real), rutinas y ejercicios, entrenamientos con resúmenes de
--  sensores (workout_sets.sensor_reps, exercise_sensor_data), actividades GPS,
--  objetivos/estadísticas (daily_activity) y notificaciones push.
--
--  Requisitos: MySQL 8.0+ (JSON, CHECK, JSON_ARRAY). En MariaDB 10.4+
--  sustituir JSON por TEXT y JSON_ARRAY() por texto plano.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS fittrack
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fittrack;

-- ---------------------------------------------------------------
-- LIMPIEZA idempotente (comentar en producción si ya hay datos)
-- ---------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS gps_route_points;
DROP TABLE IF EXISTS outdoor_activities;
DROP TABLE IF EXISTS exercise_sensor_data;
DROP TABLE IF EXISTS workout_sets;
DROP TABLE IF EXISTS workout_exercises;
DROP TABLE IF EXISTS workouts;
DROP TABLE IF EXISTS user_routines;
DROP TABLE IF EXISTS routine_exercises;
DROP TABLE IF EXISTS routines;
DROP TABLE IF EXISTS exercises;
DROP TABLE IF EXISTS goals;
DROP TABLE IF EXISTS daily_activity;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS user_push_tokens;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================ 1. USERS =====================================
CREATE TABLE users (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(120)   NOT NULL,
  email             VARCHAR(255)   NOT NULL,
  password_hash     VARCHAR(255)   NOT NULL,          -- bcrypt/argon2; NUNCA texto plano
  age               TINYINT UNSIGNED NULL,
  weight_kg         DECIMAL(5,2)   NULL,
  height_cm         DECIMAL(5,2)   NULL,
  goal              ENUM('muscle_gain','weight_loss','endurance','general_health','flexibility') NULL,
  level             ENUM('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
  workouts_per_week TINYINT UNSIGNED NOT NULL DEFAULT 3,
  premium           BOOLEAN NOT NULL DEFAULT FALSE,   -- espejo de `subscriptions` (trigger)
  avatar_url        VARCHAR(500)  NULL,
  timezone          VARCHAR(64)   NOT NULL DEFAULT 'America/Mexico_City',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),                  -- colación ci -> login sin distinguir mayúsculas
  CONSTRAINT chk_users_age     CHECK (age BETWEEN 12 AND 100),
  CONSTRAINT chk_users_weight  CHECK (weight_kg > 0),
  CONSTRAINT chk_users_height  CHECK (height_cm > 0),
  CONSTRAINT chk_users_wpw     CHECK (workouts_per_week BETWEEN 1 AND 7)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================ 2. PLANS =====================================
CREATE TABLE plans (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(30)  NOT NULL,             -- 'free' | 'premium'
  price_mxn        DECIMAL(8,2) NOT NULL DEFAULT 0,
  billing_interval ENUM('month','year') NOT NULL DEFAULT 'month',
  features         JSON NULL,                         -- lista de beneficios (texto en español)
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_name (name),
  CONSTRAINT chk_plans_price CHECK (price_mxn >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ======================== 3. SUBSCRIPTIONS =================================
CREATE TABLE subscriptions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  plan_id    BIGINT UNSIGNED NOT NULL,
  status     ENUM('active','pending','canceled','expired') NOT NULL DEFAULT 'active',
  price_mxn  DECIMAL(8,2) NOT NULL,                   -- precio al contratar (snapshot)
  currency   CHAR(3) NOT NULL DEFAULT 'MXN',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_subs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  CONSTRAINT chk_subs_price CHECK (price_mxn >= 0),
  KEY idx_subs_user (user_id),
  KEY idx_subs_status (status)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================ 4. PAYMENTS ==================================
CREATE TABLE payments (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  subscription_id    BIGINT UNSIGNED NULL,
  amount_mxn         DECIMAL(8,2) NOT NULL,
  currency           CHAR(3) NOT NULL DEFAULT 'MXN',
  method             VARCHAR(30) NOT NULL DEFAULT 'simulado',  -- 'simulado' | futuro: 'stripe_card','paypal',...
  status             ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  provider           VARCHAR(30) NULL,                -- 'simulado' | futuro: 'stripe','paypal'
  provider_reference VARCHAR(100) NULL,               -- folio/id de la transacción en el proveedor
  idempotency_key    VARCHAR(100) NULL,               -- evita doble cobro en la integración real
  gateway_response   JSON NULL,                       -- respuesta cruda del proveedor (auditoría)
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at       DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_sub  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  CONSTRAINT chk_pay_amount CHECK (amount_mxn > 0),
  KEY idx_pay_user (user_id),
  KEY idx_pay_sub (subscription_id),
  KEY idx_pay_provider_ref (provider, provider_reference)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================ 5. EXERCISES =================================
CREATE TABLE exercises (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                      VARCHAR(120) NOT NULL,     -- texto en español
  description               VARCHAR(500) NULL,
  muscle_group              ENUM('legs','chest','back','core','arms','cardio','full_body') NOT NULL,
  difficulty                ENUM('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
  default_sets              TINYINT UNSIGNED NULL,
  default_repetitions       TINYINT UNSIGNED NULL,
  is_time_based             BOOLEAN NOT NULL DEFAULT FALSE,  -- plancha / sentadilla isométrica
  default_duration_seconds  SMALLINT UNSIGNED NULL,
  sensor_type               ENUM('none','accelerometer','gps') NOT NULL DEFAULT 'none',
  icon                      VARCHAR(255) NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_ex_sets        CHECK (default_sets > 0),
  CONSTRAINT chk_ex_reps        CHECK (default_repetitions > 0),
  CONSTRAINT chk_ex_duration    CHECK (default_duration_seconds > 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================ 6. ROUTINES ==================================
-- user_id NULL  -> plantilla del sistema | user_id SET -> rutina personalizada (Premium)
CREATE TABLE routines (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NULL,
  name              VARCHAR(120) NOT NULL,             -- texto en español
  description       VARCHAR(500) NULL,
  level             ENUM('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
  is_premium        BOOLEAN NOT NULL DEFAULT FALSE,    -- rutina exclusiva Premium
  is_template       BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_minutes SMALLINT UNSIGNED NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_routines_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_routines_user (user_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 7. ROUTINE_EXERCISES =================================
CREATE TABLE routine_exercises (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  routine_id       BIGINT UNSIGNED NOT NULL,
  exercise_id      BIGINT UNSIGNED NOT NULL,
  position         TINYINT UNSIGNED NOT NULL DEFAULT 1,  -- orden dentro de la rutina
  sets             TINYINT UNSIGNED NOT NULL DEFAULT 3,
  repetitions      TINYINT UNSIGNED NULL,
  duration_seconds SMALLINT UNSIGNED NULL,               -- ejercicios por tiempo
  rest_seconds     SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  weight_kg        DECIMAL(5,2) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_re_routine  FOREIGN KEY (routine_id)  REFERENCES routines(id)  ON DELETE CASCADE,
  CONSTRAINT fk_re_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  UNIQUE KEY uq_re_position (routine_id, position),
  CONSTRAINT chk_re_sets CHECK (sets > 0),
  CONSTRAINT chk_re_reps CHECK (repetitions > 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 8. USER_ROUTINES (favoritas) =========================
CREATE TABLE user_routines (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  routine_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_ur_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ur_routine FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
  UNIQUE KEY uq_ur_user_routine (user_id, routine_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================ 9. WORKOUTS ==================================
CREATE TABLE workouts (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  routine_id       BIGINT UNSIGNED NULL,
  name             VARCHAR(120) NOT NULL,
  activity_type    ENUM('gym','run','cycling','walk') NOT NULL DEFAULT 'gym',
  status           ENUM('in_progress','completed','canceled') NOT NULL DEFAULT 'in_progress',
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at         DATETIME NULL,
  duration_seconds INT UNSIGNED NULL,
  calories         INT UNSIGNED NULL,
  notes            TEXT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_wo_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_wo_routine FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE SET NULL,
  KEY idx_wo_user_started (user_id, started_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 10. WORKOUT_EXERCISES ================================
CREATE TABLE workout_exercises (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workout_id               BIGINT UNSIGNED NOT NULL,
  exercise_id              BIGINT UNSIGNED NOT NULL,
  position                 TINYINT UNSIGNED NOT NULL DEFAULT 1,
  planned_sets             TINYINT UNSIGNED NOT NULL DEFAULT 3,
  planned_repetitions      TINYINT UNSIGNED NULL,
  planned_duration_seconds SMALLINT UNSIGNED NULL,
  completed                BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at             DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_we_workout  FOREIGN KEY (workout_id)  REFERENCES workouts(id)  ON DELETE CASCADE,
  CONSTRAINT fk_we_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  KEY idx_we_workout (workout_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================ 11. WORKOUT_SETS =============================
CREATE TABLE workout_sets (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workout_exercise_id BIGINT UNSIGNED NOT NULL,
  set_number          TINYINT UNSIGNED NOT NULL DEFAULT 1,
  repetitions         SMALLINT UNSIGNED NULL,          -- reps registradas manualmente
  sensor_reps         SMALLINT UNSIGNED NULL,          -- RESUMEN acelerómetro: reps detectadas
  weight_kg           DECIMAL(5,2) NULL,
  duration_seconds    SMALLINT UNSIGNED NULL,
  completed           BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at        DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_ws_we FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE,
  UNIQUE KEY uq_ws_set (workout_exercise_id, set_number)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 12. OUTDOOR_ACTIVITIES (GPS) =========================
CREATE TABLE outdoor_activities (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workout_id       BIGINT UNSIGNED NOT NULL,
  user_id          BIGINT UNSIGNED NOT NULL,
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at         DATETIME NULL,
  distance_meters  DECIMAL(10,2) NULL,
  duration_seconds INT UNSIGNED NULL,
  avg_speed_kmh    DECIMAL(6,2) NULL,
  max_speed_kmh    DECIMAL(6,2) NULL,
  elevation_gain_m DECIMAL(8,2) NULL,
  avg_bearing_deg  DECIMAL(5,2) NULL,   -- Magnetómetro: rumbo medio en grados (0-360)
  bearing_point    VARCHAR(5) NULL,     -- Magnetómetro: punto cardinal (NE, NNW...)
  route_geojson    JSON NULL,                          -- opción A: ruta completa (respuesta de API)
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_oa_workout FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  UNIQUE KEY uq_oa_workout (workout_id),
  KEY idx_oa_user (user_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 13. GPS_ROUTE_POINTS (opción B) ======================
-- Ruta guardada punto por punto. Se puede usar con o sin route_geojson.
CREATE TABLE gps_route_points (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id BIGINT UNSIGNED NOT NULL,
  latitude    DECIMAL(9,6) NOT NULL,
  longitude   DECIMAL(9,6) NOT NULL,
  altitude_m  DECIMAL(8,2) NULL,
  speed_kmh   DECIMAL(6,2) NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_grp_activity FOREIGN KEY (activity_id) REFERENCES outdoor_activities(id) ON DELETE CASCADE,
  KEY idx_grp_activity (activity_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================ 14. GOALS ====================================
CREATE TABLE goals (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  type         ENUM('weekly_workouts','weekly_minutes','weekly_distance','weight','streak_days','custom') NOT NULL,
  title        VARCHAR(120) NOT NULL,                  -- texto en español (lo escribe el usuario)
  target       DECIMAL(10,2) NOT NULL,
  current      DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit         VARCHAR(20) NOT NULL DEFAULT 'sessions', -- sessions, minutes, km, days, kg
  period       ENUM('day','week','month','custom') NOT NULL DEFAULT 'week',
  starts_on    DATE NOT NULL,
  target_date  DATE NULL,
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_goals_target CHECK (target > 0),
  KEY idx_goals_user (user_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 15. DAILY_ACTIVITY (rachas/estadísticas) =============
CREATE TABLE daily_activity (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  activity_date    DATE NOT NULL,
  workouts_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  total_minutes    INT UNSIGNED NOT NULL DEFAULT 0,
  total_distance_m DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_calories   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_da_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_da_user_date (user_id, activity_date)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 16. NOTIFICATION_PREFERENCES =========================
CREATE TABLE notification_preferences (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                   BIGINT UNSIGNED NOT NULL,
  push_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  workout_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  workout_reminder_time     TIME NOT NULL DEFAULT '18:00:00',  -- 6:00 PM (ejemplo de la propuesta)
  goal_completed_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  streak_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_summary_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  timezone                  VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City',
  updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_np_user (user_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 17. NOTIFICATIONS =====================================
CREATE TABLE notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  type          ENUM('workout_reminder','goal_completed','streak','system') NOT NULL,
  title         VARCHAR(150) NOT NULL,
  body          VARCHAR(500) NOT NULL,
  scheduled_for DATETIME NULL,      -- cuándo debe enviarse
  sent_at       DATETIME NULL,      -- cuándo se envió realmente
  read_at       DATETIME NULL,
  metadata      JSON NULL,          -- p. ej. { goal_id: 14, workout_id: 7 }
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_nt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_nt_user_sent (user_id, sent_at),
  KEY idx_nt_scheduled (scheduled_for)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ================== 18. EXERCISE_SENSOR_DATA (resumen de sensores) =========
-- Acelerómetro/giroscopio/magnetómetro: solo resúmenes, sin muestras crudas.
CREATE TABLE exercise_sensor_data (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workout_exercise_id BIGINT UNSIGNED NOT NULL,
  sensor              ENUM('accelerometer','gyroscope','magnetometer') NOT NULL,
  metric              VARCHAR(30) NOT NULL,   -- 'repetitions' | 'calibration_pass'
                                              -- | 'avg_rotation_speed' | 'avg_bearing_deg' ...
  value               DECIMAL(12,4) NOT NULL,
  unit                VARCHAR(15) NULL,
  measured_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_esd_we FOREIGN KEY (workout_exercise_id)
    REFERENCES workout_exercises(id) ON DELETE CASCADE,
  KEY idx_esd_we (workout_exercise_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==================== 19. USER_PUSH_TOKENS (push Expo) =====================
CREATE TABLE user_push_tokens (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  expo_push_token VARCHAR(200) NOT NULL,
  platform        VARCHAR(10) NULL,          -- 'android' | 'ios'
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_upt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_upt_token (expo_push_token),
  KEY idx_upt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================== TRIGGER ====================================
-- Mantiene users.premium = true cuando nace una suscripción activa.
-- (MySQL no permite leer `subscriptions` dentro de un trigger sobre ella misma;
--  por eso al CANCELAR/EXPIRAR la actualiza el backend con el mismo UPDATE.)
DELIMITER $$
DROP TRIGGER IF EXISTS trg_subscriptions_sync_premium$$
CREATE TRIGGER trg_subscriptions_sync_premium
AFTER INSERT ON subscriptions
FOR EACH ROW
BEGIN
  IF NEW.status = 'active' AND (NEW.expires_at IS NULL OR NEW.expires_at > NOW()) THEN
    UPDATE users SET premium = TRUE WHERE id = NEW.user_id;
  END IF;
END$$
DELIMITER ;

-- =====================================================================
--  DATOS INICIALES (seed) — comentar si no se quieren cargar datos demo
--  Textos en español (datos); esquema en inglés.
-- =====================================================================

-- 2.1) Planes de suscripción (premium = $79 MXN/mes)
INSERT INTO plans (id, name, price_mxn, billing_interval, features) VALUES
(1, 'free',    0.00,  'month', JSON_ARRAY('Registro e inicio de sesión','Rutinas básicas',
            'Registro de entrenamientos','Historial','Notificaciones','Uso básico de sensores')),
(2, 'premium', 79.00, 'month', JSON_ARRAY('Rutinas personalizadas','Rutinas avanzadas',
            'Estadísticas avanzadas','Historial completo','Insignia Premium'));

-- 5.1) Ejercicios
INSERT INTO exercises
  (id, name, description, muscle_group, difficulty, default_sets, default_repetitions,
   is_time_based, default_duration_seconds, sensor_type) VALUES
(1,  'Sentadillas',           'Con peso corporal o barra.',                'legs',  'intermediate', 4, 12,  FALSE, NULL, 'accelerometer'),
(2,  'Zancadas',              'Alternando piernas.',                       'legs',  'intermediate', 3, 10,  FALSE, NULL, 'none'),
(3,  'Sentadilla isométrica', 'Mantener la posición 30 segundos.',         'legs',  'beginner',     3, NULL, TRUE,  30,   'none'),
(4,  'Abdominales',           'Crunches clásicos.',                        'core',  'beginner',     3, 15,  FALSE, NULL, 'none'),
(5,  'Plancha',               'Antebrazos al suelo, cuerpo recto.',        'core',  'beginner',     3, NULL, TRUE,  30,   'none'),
(6,  'Flexiones',             NULL,                                        'chest', 'intermediate', 3, 10,  FALSE, NULL, 'none'),
(7,  'Press de banca',        'Con barra o mancuernas.',                   'chest', 'advanced',     4, 8,   FALSE, NULL, 'none'),
(8,  'Remo con mancuerna',    NULL,                                        'back',  'intermediate', 3, 10,  FALSE, NULL, 'none'),
(9,  'Curl de bíceps',        NULL,                                        'arms',  'intermediate', 3, 10,  FALSE, NULL, 'none'),
(10, 'Fondos',                'Tríceps y pecho.',                          'chest', 'advanced',     3, 8,   FALSE, NULL, 'none'),
(11, 'Sentadilla búlgara',    'Una pierna elevada detrás.',                'legs',  'advanced',     3, 10,  FALSE, NULL, 'none'),
(12, 'Jumping jacks',         'Salto abriendo y cerrando piernas.',        'cardio','beginner',     3, NULL, TRUE,  60,   'accelerometer');

-- 6.1) Rutinas (8 plantillas; las dos avanzadas son Premium)
INSERT INTO routines (id, user_id, name, description, level, is_premium, is_template, estimated_minutes) VALUES
(1, NULL, 'Piernas y abdomen',          'Rutina clásica de pierna y core.',        'beginner',     FALSE, TRUE, 35),
(2, NULL, 'Cuerpo completo principiante','Entrenamiento completo para empezar.',    'beginner',     FALSE, TRUE, 40),
(3, NULL, 'Tren superior',              'Pecho, espalda y brazos.',                'intermediate', FALSE, TRUE, 45),
(4, NULL, 'Cardio HIIT',                'Quema calorías con intervalos; usa GPS o acelerómetro.', 'intermediate', FALSE, TRUE, 25),
(5, NULL, 'Core fuerte',                'Abdominales y planchas.',                 'beginner',     FALSE, TRUE, 20),
(6, NULL, 'Piernas intenso',            'Rutina avanzada de pierna.',              'advanced',     TRUE,  TRUE, 50),
(7, NULL, 'Tren superior avanzado',     'Volumen para pecho, espalda y brazos.',   'advanced',     TRUE,  TRUE, 55),
(8, NULL, 'Cuerpo completo intermedio', 'Fuerza y acondicionamiento.',             'intermediate', FALSE, TRUE, 40);

-- 7.1) Contenido de cada rutina (ejercicio, orden, series, reps/tiempo, descanso)
INSERT INTO routine_exercises (routine_id, exercise_id, position, sets, repetitions, duration_seconds, rest_seconds) VALUES
-- Rutina 1: Piernas y abdomen
(1, 1,  1, 4, 12, NULL, 60),
(1, 2,  2, 3, 10, NULL, 60),
(1, 3,  3, 3, NULL, 30, 45),
(1, 4,  4, 3, 15, NULL, 45),
(1, 5,  5, 3, NULL, 30, 45),
-- Rutina 2: Cuerpo completo principiante
(2, 6,  1, 3, 10, NULL, 60),
(2, 2,  2, 3, 10, NULL, 60),
(2, 8,  3, 3, 10, NULL, 60),
(2, 5,  4, 3, NULL, 30, 45),
(2, 4,  5, 3, 15, NULL, 45),
-- Rutina 3: Tren superior
(3, 7,  1, 4, 8,  NULL, 90),
(3, 10, 2, 3, 8,  NULL, 60),
(3, 8,  3, 3, 10, NULL, 60),
(3, 9,  4, 3, 10, NULL, 60),
-- Rutina 4: Cardio HIIT
(4, 1,  1, 4, 15, NULL, 45),
(4, 12, 2, 3, NULL, 60, 30),
(4, 6,  3, 3, 12, NULL, 45),
-- Rutina 5: Core fuerte
(5, 4,  1, 3, 15, NULL, 45),
(5, 5,  2, 3, NULL, 30, 45),
(5, 3,  3, 3, NULL, 30, 45),
-- Rutina 6: Piernas intenso (Premium)
(6, 1,  1, 4, 15, NULL, 60),
(6, 11, 2, 3, 10, NULL, 60),
(6, 2,  3, 3, 12, NULL, 60),
(6, 3,  4, 3, NULL, 45, 45),
-- Rutina 7: Tren superior avanzado (Premium)
(7, 7,  1, 5, 6,  NULL, 90),
(7, 10, 2, 4, 10, NULL, 60),
(7, 8,  3, 4, 10, NULL, 60),
(7, 9,  4, 4, 12, NULL, 60),
-- Rutina 8: Cuerpo completo intermedio
(8, 6,  1, 4, 12, NULL, 60),
(8, 2,  2, 3, 12, NULL, 60),
(8, 8,  3, 3, 10, NULL, 60),
(8, 5,  4, 3, NULL, 40, 45),
(8, 9,  5, 3, 12, NULL, 60);