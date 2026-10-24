// nutritionistId no viaja: el único dueño posible de una receta que el
// nutricionista ve es él mismo. Las filas de recipe_meal_type se aplanan a la
// lista de valores del enum, como las categorías de un alimento.
function serializeRecipe(recipe) {
  const { nutritionistId: _nutritionistId, mealTypes, ...rest } = recipe;
  return { ...rest, mealTypes: mealTypes.map(({ mealType }) => mealType) };
}

function serializeRecipes(recipes) {
  return recipes.map(serializeRecipe);
}

module.exports = { serializeRecipe, serializeRecipes };
