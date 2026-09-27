const AppError = require('../utils/AppError');

// Pasa por el errorHandler como cualquier otro error: una ruta inexistente
// responde con el mismo formato que el resto de la API.
function notFound(req, res, next) {
  next(new AppError(404, 'Ruta no encontrada'));
}

module.exports = notFound;
