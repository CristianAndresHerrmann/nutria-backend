const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  // Dos URLs distintas para el mismo servicio, y no se pueden unificar: iaServiceUrl
  // es por donde lo alcanza el backend (red interna de Docker) y iaPublicUrl es por
  // donde lo alcanza el navegador (a traves del proxy). La primera se usa para pedir
  // el spec de IA, la segunda para el `servers` que se le inyecta a ese spec.
  iaServiceUrl: process.env.IA_SERVICE_URL || 'http://ia:8000',
  iaPublicUrl: process.env.IA_PUBLIC_URL || 'http://ia.local.nutria.com',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://local.nutria.com,http://localhost:5173,http://swagger.local.nutria.com')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

module.exports = config;
