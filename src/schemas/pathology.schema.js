const { z } = require('zod');
const { optionalField, catalogName } = require('./common.schema');

// Patología del catálogo común (RF-04). createdById no se acepta: sale del token.
const pathologySchema = z.strictObject({
  name: catalogName('El nombre de la patología'),
  description: optionalField(z.string().max(1000, 'La descripción no puede superar los 1000 caracteres')),
});

module.exports = { createPathologySchema: pathologySchema, updatePathologySchema: pathologySchema };
