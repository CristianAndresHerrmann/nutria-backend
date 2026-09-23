const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  // Hostname interno de Docker: el navegador nunca lo usa. Todo lo que la
  // documentación necesita del servicio de IA pasa por el backend.
  iaServiceUrl: process.env.IA_SERVICE_URL || 'http://ia:8000',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://local.nutria.com,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

module.exports = config;
