// nutritionistId no viaja: la única privada que un nutricionista puede ver es
// suya. En su lugar va `own`, que el frontend usa para ofrecer la edición solo
// en las propias (las básicas comunes son de solo lectura, T30). Las filas de
// recipe_meal_type se aplanan a la lista de valores del enum, como las
// categorías de un alimento.
function serializeRecipe(recipe) {
  const { nutritionistId, mealTypes, ...rest } = recipe;
  return { ...rest, own: nutritionistId !== null, mealTypes: mealTypes.map(({ mealType }) => mealType) };
}

function serializeRecipes(recipes) {
  return recipes.map(serializeRecipe);
}

module.exports = { serializeRecipe, serializeRecipes };
