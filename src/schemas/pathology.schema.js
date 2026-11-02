const { z } = require('zod');
const { optionalField, catalogName } = require('./common.schema');

// Alta y edición de una patología desde el panel del administrador (T25; RF-04).
// El PUT es un reemplazo completo.
const pathologySchema = z.strictObject({
  name: catalogName('El nombre de la patología'),
  description: optionalField(z.string().max(1000, 'No puede superar los 1000 caracteres')),
});

module.exports = { pathologySchema };
