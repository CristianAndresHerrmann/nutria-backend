// nutritionistId no viaja: identifica al dueño de un alimento privado, y el único
// privado que un nutricionista puede ver es suyo. Las filas de food_category se
// aplanan a la lista de valores del enum.
function serializeFood(food) {
  const { nutritionistId: _nutritionistId, categories, ...rest } = food;
  return { ...rest, categories: categories.map(({ category }) => category) };
}

function serializeFoods(foods) {
  return foods.map(serializeFood);
}

module.exports = { serializeFood, serializeFoods };
