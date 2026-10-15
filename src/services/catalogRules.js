const AppError = require('../utils/AppError');

// Reglas compartidas por los tres catálogos comunes (grupos, alimentos y
// patologías). Ver docs/decisiones/abm-de-catalogos-comunes.md en el repo raíz.

const NOT_AUTHOR_MESSAGE = 'Solo quien cargó este ítem puede modificarlo';

// Todos leen el catálogo completo, pero solo el autor modifica un ítem. Los del
// seed (createdById null) no tienen autor: no los modifica nadie por la API.
// 403 y no 404: el ítem es visible para todos, ocultarlo no tendría sentido.
function assertAuthor(item, nutritionistId) {
  if (!item.createdById || item.createdById !== nutritionistId) {
    throw new AppError(403, NOT_AUTHOR_MESSAGE);
  }
}

// El nombre es único sin distinguir mayúsculas (citext en la base). Se chequea
// antes de escribir para responder 409 con el campo puntual; el índice único de
// la base queda como respaldo ante dos altas simultáneas. `excludeId` es el
// propio ítem en una edición: conservar su nombre no es un conflicto.
async function assertNameAvailable(repository, name, { excludeId, message }) {
  const existing = await repository.findByName(name);
  if (existing && existing.id !== excludeId) {
    throw new AppError(409, message, { details: { fields: { name: message } } });
  }
}

// Una referencia a otro registro que no existe es un error del dato enviado:
// 400 con el campo, igual que un error de Zod.
function invalidField(field, message) {
  return new AppError(400, message, { code: 'VALIDATION_ERROR', details: { fields: { [field]: message } } });
}

module.exports = { assertAuthor, assertNameAvailable, invalidField, NOT_AUTHOR_MESSAGE };
