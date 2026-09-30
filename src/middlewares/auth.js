const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AppError = require('../utils/AppError');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'No autenticado'));
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return next(new AppError(401, 'Token inválido o expirado'));
  }

  // Un token bien firmado pero sin sub dejaría req.nutricionistaId vacío, y
  // todo el aislamiento depende de ese valor.
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return next(new AppError(401, 'Token inválido o expirado'));
  }

  req.nutricionistaId = payload.sub;
  next();
}

module.exports = requireAuth;
