const AppError = require('../utils/AppError');

// Traduce cualquier error a { error: { code, message, details? } }. Lo que no se
// reconoce sale como 500 con un mensaje fijo: err.message de un error inesperado
// puede traer SQL, rutas del servidor o datos de la request, y nunca se reenvía.
// El stack solo va al log del servidor.
function toAppError(err) {
  if (err instanceof AppError) return err;

  // Errores de express.json() (body-parser): traen `type` y un message del
  // parser que no es para el cliente.
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'El cuerpo de la solicitud no es JSON válido', { code: 'INVALID_JSON' });
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'El cuerpo de la solicitud es demasiado grande');
  }

  // Prisma se detecta por nombre y código, sin requerir @prisma/client acá.
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target : [];
      const fields = Object.fromEntries(target.map((field) => [field, 'Ya existe un registro con este valor']));
      return new AppError(409, 'Ya existe un registro con esos datos', {
        details: target.length > 0 ? { fields } : undefined,
      });
    }
    if (err.code === 'P2025') {
      return new AppError(404, 'Recurso no encontrado');
    }
  }
  if (err.name === 'PrismaClientInitializationError') {
    return new AppError(503, 'Base de datos no disponible');
  }

  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Si la respuesta ya empezó a salir no se puede mandar otra: Express corta la
  // conexión en vez de dejarla colgada.
  if (res.headersSent) return next(err);

  const appError = toAppError(err) || new AppError(500, 'Error interno del servidor');

  if (appError.status >= 500) {
    console.error(`${req.method} ${req.originalUrl} -> ${appError.status} ${appError.code}`, err);
  } else {
    console.warn(`${req.method} ${req.originalUrl} -> ${appError.status} ${appError.code}`);
  }

  const body = { code: appError.code, message: appError.message };
  if (appError.details) body.details = appError.details;

  res.status(appError.status).json({ error: body });
}

module.exports = errorHandler;
