const jwt = require('jsonwebtoken');
const config = require('../config/env');
const nutritionistRepository = require('../repositories/nutritionist.repository');
const AppError = require('../utils/AppError');

const INVALID_TOKEN_MESSAGE = 'Token inválido o expirado';
const FORBIDDEN_ROLE_MESSAGE = 'No tenés permiso para acceder a este recurso';

// Además de verificar la firma, lee la cuenta en cada request: una cuenta
// desactivada (o borrada) deja de operar en la siguiente request, sin esperar a
// que venza su token. El rol que autoriza también sale de la base y no del
// token, así que no depende de cuándo se emitió.
function createRequireAuth({ nutritionistRepository: repository, jwtSecret }) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return next(new AppError(401, 'No autenticado'));
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (error) {
      return next(new AppError(401, INVALID_TOKEN_MESSAGE));
    }

    // Un token bien firmado pero sin sub dejaría req.nutricionistaId vacío, y
    // todo el aislamiento depende de ese valor.
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return next(new AppError(401, INVALID_TOKEN_MESSAGE));
    }

    let account;
    try {
      account = await repository.findAuthState(payload.sub);
    } catch (error) {
      return next(error);
    }

    if (!account || !account.active) {
      return next(new AppError(401, INVALID_TOKEN_MESSAGE));
    }

    req.nutricionistaId = payload.sub;
    req.role = account.role;
    next();
  };
}

// Va después de requireAuth. El admin no entra a las rutas clínicas (RNF-05) y
// el nutricionista no entra a /admin.
function requireRole(role) {
  return function checkRole(req, res, next) {
    if (req.role !== role) {
      return next(new AppError(403, FORBIDDEN_ROLE_MESSAGE));
    }
    next();
  };
}

const requireAuth = createRequireAuth({ nutritionistRepository, jwtSecret: config.jwtSecret });

// Toda ruta protegida usa una de estas dos, nunca requireAuth suelto: así una
// ruta nueva no queda abierta a los dos roles por olvido.
const requireNutritionist = [requireAuth, requireRole('nutritionist')];
const requireAdmin = [requireAuth, requireRole('admin')];

module.exports = {
  requireAuth,
  requireRole,
  requireNutritionist,
  requireAdmin,
  createRequireAuth,
  FORBIDDEN_ROLE_MESSAGE,
};
