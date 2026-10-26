const { descendantIds } = require('./foodGroupTree');

// Filtro de recetas por las condiciones del paciente (RF-28). Solo las
// condiciones directas sobre un alimento o un grupo: una preferencia no excluye
// nada, y lo que se deriva de una patología son reglas clínicas del Incremento 3
// (REGLA_CLINICA), no de este filtro. El motor de reglas (RF-43) usa el mismo
// criterio por condición (DA-23): conditionScopes y scopeCoversFood.
const RESTRICTIVE_CONDITION_TYPES = ['allergy', 'intolerance', 'rejection'];

// Lo que alcanza cada condición restrictiva: su alimento, o su grupo con todos
// sus subgrupos (rechazar "Carnes, pescados y huevos" alcanza también a
// "Pescados"). Las demás condiciones no alcanzan nada y no aparecen.
function conditionScopes(conditions, groups) {
  return conditions
    .filter((condition) => RESTRICTIVE_CONDITION_TYPES.includes(condition.type))
    .map((condition) => ({
      condition,
      foodId: condition.foodId || null,
      groupIds: new Set(condition.foodGroupId ? descendantIds(groups, condition.foodGroupId) : []),
    }));
}

// true si el alimento ({ id, foodGroupId }) está comprendido en la condición.
function scopeCoversFood(scope, food) {
  return food.id === scope.foodId || scope.groupIds.has(food.foodGroupId);
}

// Función pura: recibe las recetas con sus ingredientes ({ food: { id,
// foodGroupId } }), las condiciones del paciente y la lista plana de grupos.
// Devuelve las recetas sin ningún ingrediente comprendido en una condición.
function excludeRecipesForConditions(recipes, conditions, groups) {
  const scopes = conditionScopes(conditions, groups);
  if (scopes.length === 0) return recipes;

  return recipes.filter((recipe) =>
    recipe.ingredients.every(({ food }) => !scopes.some((scope) => scopeCoversFood(scope, food))),
  );
}

module.exports = { excludeRecipesForConditions, conditionScopes, scopeCoversFood, RESTRICTIVE_CONDITION_TYPES };
