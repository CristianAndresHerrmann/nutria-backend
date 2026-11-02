const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET;

if (nodeEnv !== 'test' && (!jwtSecret || jwtSecret.trim().length === 0)) {
  throw new Error('Configuración inválida: JWT_SECRET es obligatorio y no puede estar vacío');
}

const config = {
  port: process.env.PORT || 3000,
  nodeEnv,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  // Intentos de login fallidos que se aceptan por IP dentro de la ventana; el
  // siguiente responde 429.
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  loginRateLimitWindowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  // Hostname interno de Docker: el navegador nunca lo usa. Todo lo que la
  // documentación necesita del servicio de IA pasa por el backend.
  iaServiceUrl: process.env.IA_SERVICE_URL || 'http://ia:8000',
  // Tope de espera por llamada al servicio de IA: pasado este tiempo el backend
  // responde 503 en vez de dejar la request colgada.
  iaTimeoutMs: Number(process.env.IA_TIMEOUT_MS) || 3000,
  // Tope propio de la generación del plan (T37): tiene que superar el
  // AI_PROVIDER_TIMEOUT_SECONDS de nutria-ia (25 s), así el timeout del proveedor
  // llega como error controlado con su traza en vez de cortarse acá.
  iaGenerationTimeoutMs: Number(process.env.IA_GENERATION_TIMEOUT_MS) || 30000,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://local.nutria.com,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

module.exports = config;
