const { z } = require('zod');
const { optionalField, catalogName } = require('./common.schema');

// Alta y edición comparten schema: PUT es reemplazo completo, como en pacientes.
// Un parentId omitido deja al grupo en la raíz. Que el padre exista y que no se
// cierre un ciclo lo valida el servicio, porque necesita la base.
// createdById no se acepta: el autor sale del token.
const foodGroupSchema = z.strictObject({
  name: catalogName('El nombre del grupo'),
  description: optionalField(z.string().max(500, 'La descripción no puede superar los 500 caracteres')),
  parentId: optionalField(z.guid('El grupo padre no es válido')),
});

module.exports = { createFoodGroupSchema: foodGroupSchema, updateFoodGroupSchema: foodGroupSchema };
