const { descendantIds } = require('./foodGroupTree');

// Filtro de recetas por las condiciones del paciente (RF-28): las condiciones
// directas sobre un alimento o un grupo, y las reglas prohibitivas de sus patologías
// (clinical_rule, T35) que le pase quien llama. Una preferencia no excluye nada. El
// motor de reglas (RF-43) usa el mismo criterio por condición (DA-23):
// conditionScopes y scopeCoversFood; y para las reglas por patología, ruleScopes con
// el mismo scopeCoversFood.
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

// Lo que alcanza cada regla clínica, con el mismo criterio que una condición: su
// alimento, o su grupo con todos sus subgrupos.
function ruleScopes(rules, groups) {
  return rules.map((rule) => ({
    rule,
    foodId: rule.foodId || null,
    groupIds: new Set(rule.foodGroupId ? descendantIds(groups, rule.foodGroupId) : []),
  }));
}

// true si el alimento ({ id, foodGroupId }) está comprendido en la condición o la
// regla.
function scopeCoversFood(scope, food) {
  return food.id === scope.foodId || scope.groupIds.has(food.foodGroupId);
}

// Función pura: recibe las recetas con sus ingredientes ({ food: { id,
// foodGroupId } }), las condiciones del paciente, la lista plana de grupos y las
// reglas que excluyen. Devuelve las recetas sin ningún ingrediente comprendido en
// una condición o en una de esas reglas.
function excludeRecipesForConditions(recipes, conditions, groups, prohibitedRules = []) {
  const scopes = [...conditionScopes(conditions, groups), ...ruleScopes(prohibitedRules, groups)];
  if (scopes.length === 0) return recipes;

  return recipes.filter((recipe) =>
    recipe.ingredients.every(({ food }) => !scopes.some((scope) => scopeCoversFood(scope, food))),
  );
}

module.exports = { excludeRecipesForConditions, conditionScopes, ruleScopes, scopeCoversFood, RESTRICTIVE_CONDITION_TYPES };
