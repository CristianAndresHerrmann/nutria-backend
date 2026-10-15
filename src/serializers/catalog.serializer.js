// createdById no viaja: al cliente le alcanza con saber si puede editar el ítem,
// y así no se expone qué nutricionista cargó cada cosa. Un ítem del seed
// (createdById null) no es editable para nadie.
function withEditable(item, nutritionistId) {
  const { createdById, ...rest } = item;
  return { ...rest, editable: Boolean(createdById) && createdById === nutritionistId };
}

function serializeFoodGroup(group, nutritionistId) {
  return withEditable(group, nutritionistId);
}

function serializePathology(pathology, nutritionistId) {
  return withEditable(pathology, nutritionistId);
}

// Las filas de food_category se aplanan a la lista de valores del enum.
function serializeFood(food, nutritionistId) {
  const { categories, ...rest } = withEditable(food, nutritionistId);
  return { ...rest, categories: categories.map(({ category }) => category) };
}

module.exports = { serializeFoodGroup, serializePathology, serializeFood };
