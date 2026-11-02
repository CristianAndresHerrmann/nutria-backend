const { z } = require('zod');
const { optionalField, catalogName } = require('./common.schema');

// Alta y edición de un grupo desde el panel del administrador (T25). El PUT es
// un reemplazo completo: parentId omitido o null lo deja como grupo raíz. Que
// el padre no sea el grupo ni uno de sus subgrupos lo controla el servicio.
const foodGroupSchema = z.strictObject({
  name: catalogName('El nombre del grupo'),
  description: optionalField(z.string().max(1000, 'No puede superar los 1000 caracteres')),
  parentId: optionalField(z.guid('El grupo padre no es válido')),
});

module.exports = { foodGroupSchema };
