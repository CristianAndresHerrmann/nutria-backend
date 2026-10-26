const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
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
  corsOrigins: (process.env.CORS_ORIGIN || 'http://local.nutria.com,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

module.exports = config;
