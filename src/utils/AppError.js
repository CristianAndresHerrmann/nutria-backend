// Código por defecto según el status, para no tener que repetirlo en cada
// `new AppError(404, ...)`. Los casos que necesitan distinguirse dentro de un
// mismo status (VALIDATION_ERROR vs. INVALID_JSON, IA_UNAVAILABLE vs. base
// caída) pasan `code` explícito.
const DEFAULT_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

class AppError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code || DEFAULT_CODES[status] || 'ERROR';
    if (details) this.details = details;
  }
}

// Primer mensaje por campo. undefined cuando ningún issue apunta a un campo
// puntual (ej. una clave no reconocida por el .strictObject), así no se adjunta
// un `fields: {}` vacío que no aporta nada sobre el error.
function fieldsFromZodError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key !== undefined && !(key in fields)) fields[key] = issue.message;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

function fromZodError(error) {
  const fields = fieldsFromZodError(error);
  return new AppError(400, error.issues[0]?.message || 'Datos inválidos', {
    code: 'VALIDATION_ERROR',
    details: fields ? { fields } : undefined,
  });
}

module.exports = AppError;
module.exports.fromZodError = fromZodError;
