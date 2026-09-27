const AppError = require('../utils/AppError');
const { fromZodError } = require('../utils/AppError');

const PARTS = ['params', 'query', 'body'];

// Valida con Zod las partes de la request que la ruta declare y deja los datos
// ya parseados en req.validated. No se pisan req.body/req.query: en Express 5
// req.query es un getter, y mezclar datos crudos y parseados en el mismo lugar
// hace que un controlador no pueda saber cuál está leyendo.
//
// `notFoundOnInvalidParams` cubre /patients/:id: un id que no es UUID responde
// 404, indistinguible de un paciente inexistente o de otro nutricionista.
function validate(schemas, { notFoundOnInvalidParams } = {}) {
  return function validateRequest(req, res, next) {
    const validated = {};

    for (const part of PARTS) {
      if (!schemas[part]) continue;

      const parsed = schemas[part].safeParse(req[part] ?? {});

      if (!parsed.success) {
        if (part === 'params' && notFoundOnInvalidParams) {
          return next(new AppError(404, notFoundOnInvalidParams));
        }
        return next(fromZodError(parsed.error));
      }

      validated[part] = parsed.data;
    }

    req.validated = validated;
    next();
  };
}

module.exports = validate;
