# 🏋️ FitTrack

**FitTrack** es una aplicación móvil (Expo SDK 57 / React Native / TypeScript) con API REST
(Node.js + Express + MySQL) para planificar, realizar y registrar entrenamientos: rutinas y
ejercicios, objetivos y estadísticas, sensores del teléfono (acelerómetro, giroscopio,
magnetómetro y GPS), notificaciones push y suscripción Premium con **pagos de Stripe en modo
de prueba** (sin credenciales, la API opera en modo simulado).

| Módulo | Uso |
| --- | --- |
| expo-sensors | Acelerómetro (conteo de repeticiones), giroscopio (calibración), magnetómetro (brújula) |
| expo-location | GPS: distancia (haversine), velocidad y ruta de la actividad outdoor |
| expo-notifications / expo-server-sdk | Push desde la app y desde el backend (cron de recordatorios) |
| expo-router / expo-secure-store | Navegación por rutas y token de sesión seguro |
| express / mysql2 / jsonwebtoken | API REST, pool de MySQL y autenticación JWT |
| @stripe/stripe-react-native | PaymentSheet: formulario de pago dentro de la app (modo test) |
| node-cron | Envío diario de recordatorios y notificaciones pendientes |
| gifted-charts | Gráficas de la pestaña Stats |

## Pantallas

1. **Login / Registro** (`/login`, `/register`) — sesión con JWT y perfil (edad, peso, altura, objetivo).
2. **Inicio** (`/`) — saludo, progreso semanal, racha, entrenamiento del día y acceso a *Comenzar*.
3. **Rutinas** (`/routines`) — listado de plantillas (premium bloqueadas sin suscripción) y favoritas.
4. **Entrenamiento** (`/workout/[id]`) — ejercicios, series, descanso, cronómetro y contador de
   repeticiones con acelerómetro cuando el ejercicio lo usa.
5. **Sensores** (`/sensor`) — demo en vivo de acelerómetro, giroscopio y magnetómetro.
6. **Outdoor** (`/outdoor`) — carrera con GPS (tiempo, distancia, velocidad, ruta) y brújula.
7. **Historial** (`/history`) — entrenamientos anteriores y su detalle.
8. **Stats** (`/stats`) — gráfica semanal (L M X J V S D) y resumen de progreso.
9. **Perfil** (`/profile`) — datos, preferencias de notificación y accesos.
10. **Premium** (`/premium`) — plan, pago con Stripe y cancelación de la suscripción.

## Flujo

```
Registro → Inicio (resumen de la semana) → Elegir rutina → Iniciar entrenamiento
→ registrar series (manual o con acelerómetro) → finalizar
→ daily_activity (minutos, distancia, racha) → metas → estadísticas
→ recordatorio del próximo entrenamiento
```

- **Acelerómetro**: picos de magnitud √(x²+y²+z²) sobre línea base adaptativa → contador de
  repeticiones en vivo (sentadillas, jumping jacks); solo se guarda el resumen
  (`workout_sets.sensor_reps`, `exercise_sensor_data`), sin muestras crudas.
- **Giroscopio**: verificación de colocación (teléfono quieto 1.5 s) antes de contar.
- **Magnetómetro**: rumbo `atan2(y, x)` en grados y punto cardinal (N, NE…) para la ruta outdoor.
- **GPS**: distancia, velocidad y ruta punto por punto (`outdoor_activities`, `gps_route_points`).
- **Racha**: días consecutivos con entrenamiento, calculados sobre `daily_activity`.

## Base de datos

- MySQL 8.0+, esquema completo (19 tablas + trigger de Premium + seeds) en `backend/database/fittrack.sql`.
- El alta de una suscripción activa dispara `trg_subscriptions_sync_premium` → `users.premium = 1`.

## API REST

| Grupo | Endpoints principales |
| --- | --- |
| Auth / usuario | `POST /api/auth/register` · `/login` · `GET /auth/me` · `GET /users/me/dashboard` |
| Rutinas | `GET /api/routines` · `/:id` · `POST` (Premium) · favoritas |
| Entrenamientos | `POST /api/workouts` · `/:id` (completar) · series · historial |
| Sensores / GPS | `POST /api/sensors/workouts/:id/sensor-data` · `PUT /api/workouts/:id/gps` · `/points` |
| Metas / stats | CRUD `/api/goals` · `GET /api/stats/weekly` · `/overview` · `/streak` |
| Pagos | `GET /api/subscriptions/plan` · `/config` · `POST /payment-sheet` · `/verify` · `/cancel` · `/webhook` |
| Notificaciones | `GET/PUT /api/notifications/preferences` · `POST /token` · `/test` · historial |


## Pagos con Stripe (modo de prueba)

1. Credenciales test: `backend/.env` → `STRIPE_SECRET_KEY` y `STRIPE_PUBLISHABLE_KEY`;
   `frontend/.env` → `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   ([dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys));
   sin clave secret, la API opera en modo simulado.
2. Flujo de cobro con **formulario dentro de la app** (Stripe PaymentSheet):

```
App                               Backend                        Stripe (test)
 │ POST /subscriptions/payment-sheet ─► customers + ephemeralKeys ─►
 │                                   ◄─ customer, ephemeralKey,      │
 │                                       paymentIntent (secret)      │
 │ initPaymentSheet() + presentPaymentSheet() ─► formulario de tarjeta
 │ POST /subscriptions/verify { payment_intent_id } ─► paymentIntents.retrieve
 │                                   → status succeeded → alta idempotente
 │                                   → payments + subscriptions → trigger premium
 │ ◄─ { premium: true }
```

3. Tarjetas de prueba: `4242 4242 4242 4242` (fecha futura, cualquier CVC) ·
   `4000 0000 0000 9995` → rechazada (para probar errores).
4. Webhook opcional (respaldo `payment_intent.succeeded`):
   `stripe listen --forward-to localhost:3000/api/subscriptions/webhook` y guarda el
   secreto en `STRIPE_WEBHOOK_SECRET`.
## Notificaciones push

- La app registra su token Expo (`user_push_tokens`) y el usuario configura hora y tipos en Perfil.
- `node-cron` crea el recordatorio diario y envía lo pendiente con **expo-server-sdk**.
- Sin `EXPO_ACCESS_TOKEN`, las entregas se marcan como simuladas (el flujo completo es igual).

## Requisitos

- Node.js ≥ 22 y MySQL 8.0+ en ejecución (puerto 3306)
- **Development build** de la app: Expo Go no incluye `expo-notifications` ni
  `@stripe/stripe-react-native`, así que las pruebas se hacen con el dev client
  (`npx expo run:android` o un build EAS de desarrollo)
- **Dispositivo físico** para sensores/GPS (no existen en el simulador)
- Cuenta de Stripe en modo test (opcional; sin credenciales opera el pago simulado)
## Ejecutar

```bash
# 1) Base de datos
mysql -u root -p --default-character-set=utf8mb4 < backend/database/fittrack.sql

# 2) Backend
cd backend
copy .env.example .env      # ajusta DB_PASSWORD, JWT_SECRET y claves de Stripe
npm install
npm start                   # API en http://localhost:3000/api/health

# 3) Frontend (development build)
cd frontend
npm install
copy .env.example .env      # EXPO_PUBLIC_API_URL y EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
npx expo prebuild --platform android   # genera android/ (solo la primera vez)
npx expo run:android                   # compila e instala el dev client
```

- **Iterar en desarrollo**: con el dev client instalado, `npx expo start --dev-client`
  y presiona `r` en la terminal para recargar tras cada cambio.
- **Teléfono físico**: define `EXPO_PUBLIC_API_URL=http://192.168.1.x:3000/api` en
  `frontend/.env` (misma red Wi-Fi que la PC).
- **Prueba end-to-end**: con el backend corriendo, `node backend/scripts/smoke-test.js`.
- **"Cannot connect to Expo CLI"**: el dev client no alcanza a Metro — reinicia con
  `npx expo start --dev-client -c`, cierra instancias previas de Metro (`Ctrl+C`),
  verifica que teléfono y PC estén en la misma red y, si persiste, usa `--tunnel`.
## Development build con EAS (Android)

La IP del backend y la clave de Stripe se configuran en `frontend/.env` (local, ignorado
por git). Los builds de EAS toman esas variables de la **nube EAS**: `eas.json` solo
declara el `environment` de cada perfil. Al cambiar un valor en `.env`, sincronízalo:

```bash
cd frontend
eas env:push development --path .env --force   # y preview, si usas ese perfil
```

```bash
cd frontend
npx eas-cli build --profile development --platform android
# cuando termine: descarga e instala el APK desde el link/QR de la terminal
npx expo start --dev-client        # Metro: la app se conecta a tu PC
```

- El dev client reemplaza a Expo Go: incluye `expo-notifications`, Stripe y los sensores nativos.
- Si cambias de Wi-Fi: actualiza la IP en `frontend/.env`, ejecuta `eas env:push`, haz commit y vuelve a compilar.
- Perfil `preview`: genera un APK sin development client (para compartir la interfaz sin Metro).
- Push real en Android: sube las credenciales FCM de tu proyecto Firebase en
  [expo.dev](https://expo.dev) → Credentials → Android (los builds funcionan sin ellas).
## Construir el APK (Android)

Identificadores configurados: `android.package` = `com.utslrc.fittrack`.

**Opción A — EAS Build (nube, recomendada)**
```bash
npm i -g eas-cli           # o usa npx eas-cli
npx eas-cli init           # vincula el proyecto a EAS (una sola vez)
npx eas-cli login
npx eas-cli build --platform android --profile preview   # genera .apk instalable
```
EAS genera y administra el **keystore de firma** automáticamente.

**Opción B — Local (requiere JDK 17 + Android Studio)**
```bash
npx expo prebuild --platform android
npx expo run:android       # APK de debug
```
Release: cd android && ./gradlew assembleRelease (requiere keystore de firma)

## Construir el IPA (iOS)

Identificadores configurados: `ios.bundleIdentifier` = `com.utslrc.fittrack`.
Requisitos: cuenta de **Apple Developer** y, o bien macOS + Xcode, o EAS Build (nube).

```bash
npx eas-cli build --platform ios --profile production   # nube: entrega el .ipa
```
Local en Mac: `npx expo prebuild --platform ios` → abrir `ios/*.xcworkspace` en Xcode →
*Signing & Capabilities* con tu Team → *Product → Archive → Distribute App*.