const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AppError = require('../utils/AppError');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'No autenticado'));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.nutricionistaId = payload.sub;
    next();
  } catch (error) {
    next(new AppError(401, 'Token inválido o expirado'));
  }
}

module.exports = requireAuth;
