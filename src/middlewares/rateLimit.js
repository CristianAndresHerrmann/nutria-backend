const { rateLimit } = require('express-rate-limit');
const AppError = require('../utils/AppError');

const TOO_MANY_LOGIN_ATTEMPTS_MESSAGE = 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.';

// Límite de intentos fallidos de login por IP: un login exitoso no cuenta, así
// que solo frena a quien prueba contraseñas. El contador vive en memoria del
// proceso; alcanza con la única instancia de staging, y se reinicia con cada
// deploy. La IP real llega por X-Forwarded-For porque app.js confía en Traefik
// (trust proxy); sin eso todas las requests compartirían la IP del proxy.
function createLoginRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Pasa por errorHandler para que el 429 tenga el formato uniforme.
    handler(req, res, next) {
      next(new AppError(429, TOO_MANY_LOGIN_ATTEMPTS_MESSAGE));
    },
  });
}

module.exports = { createLoginRateLimiter, TOO_MANY_LOGIN_ATTEMPTS_MESSAGE };
