const { z } = require('zod');

// Para rutas que no aceptan parámetros de query: un parámetro desconocido da
// 400, igual que una clave desconocida en el body de un .strictObject.
const emptyQuerySchema = z.strictObject({});

module.exports = { emptyQuerySchema };
