const { descendantIds } = require('./foodGroupTree');

// Filtro de recetas por las condiciones del paciente (RF-28). Solo las
// condiciones directas sobre un alimento o un grupo: una preferencia no excluye
// nada, y lo que se deriva de una patología son reglas clínicas del Incremento 3
// (REGLA_CLINICA), no de este filtro.
const RESTRICTIVE_CONDITION_TYPES = ['allergy', 'intolerance', 'rejection'];

// Alimentos y grupos que el paciente no puede recibir. Una condición sobre un
// grupo alcanza a todos sus subgrupos: rechazar "Carnes, pescados y huevos"
// excluye también lo de "Pescados".
function restrictedTargets(conditions, groups) {
  const foodIds = new Set();
  const groupIds = new Set();

  for (const condition of conditions) {
    if (!RESTRICTIVE_CONDITION_TYPES.includes(condition.type)) continue;
    if (condition.foodId) foodIds.add(condition.foodId);
    if (condition.foodGroupId) {
      for (const id of descendantIds(groups, condition.foodGroupId)) groupIds.add(id);
    }
  }

  return { foodIds, groupIds };
}

// Función pura: recibe las recetas con sus ingredientes ({ food: { id,
// foodGroupId } }), las condiciones del paciente y la lista plana de grupos.
// Devuelve las recetas sin ningún ingrediente comprendido en una condición.
function excludeRecipesForConditions(recipes, conditions, groups) {
  const { foodIds, groupIds } = restrictedTargets(conditions, groups);
  if (foodIds.size === 0 && groupIds.size === 0) return recipes;

  return recipes.filter((recipe) =>
    recipe.ingredients.every(({ food }) => !foodIds.has(food.id) && !groupIds.has(food.foodGroupId)),
  );
}

module.exports = { excludeRecipesForConditions, RESTRICTIVE_CONDITION_TYPES };
