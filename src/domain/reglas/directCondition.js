const { FindingSeverity, FindingType, OptionItemType } = require('@prisma/client');
const { scopeCoversFood } = require('../../utils/recipeConditionFilter');

// Condición directa (RF-37, RF-43): bloquea un ítem comprendido en una alergia,
// intolerancia o rechazo del paciente, por alimento o por grupo con sus
// subgrupos. Mismo criterio que el filtro de recetas (RF-28, DA-23): los
// alcances vienen de conditionScopes, así que preferencias y patologías no
// llegan acá (las patologías son reglas clínicas, T35).
//
// Un ítem de grupo dispara solo si su grupo está dentro del de la condición. Un
// grupo más amplio que la condición ("una fruta" con alergia a la banana) no:
// el profesional elige el alimento concreto (DA-30).

const CONDITION_LABELS = {
  allergy: 'alergia',
  intolerance: 'intolerancia',
  rejection: 'rechazo',
};

function conditionText(condition) {
  const target = condition.food?.name ?? condition.foodGroup?.name;
  return `${CONDITION_LABELS[condition.type]} del paciente (${target})`;
}

// Texto del ítem alcanzado por el alcance, o null si no lo alcanza.
function reachedItemText(item, scope, catalog) {
  switch (item.type) {
    case OptionItemType.food:
      return scopeCoversFood(scope, catalog.food(item.foodId)) ? item.foodName : null;
    case OptionItemType.food_group:
      return scope.groupIds.has(item.foodGroupId) ? `Grupo ${item.foodGroupName}` : null;
    case OptionItemType.recipe: {
      const recipe = catalog.recipe(item.recipeId);
      const reached = recipe.ingredients.filter(({ food }) => scopeCoversFood(scope, food));
      if (reached.length === 0) return null;
      const label = reached.length === 1 ? 'ingrediente' : 'ingredientes';
      return `Receta ${recipe.name}, ${label} ${reached.map(({ food }) => food.name).join(', ')}`;
    }
    default:
      return null;
  }
}

// Un hallazgo por cada condición que alcanza al ítem, en el orden de las
// condiciones.
function directConditionFindings(item, scopes, catalog) {
  const findings = [];
  for (const scope of scopes) {
    const itemText = reachedItemText(item, scope, catalog);
    if (itemText === null) continue;
    findings.push({
      type: FindingType.direct_condition,
      severity: FindingSeverity.blocking,
      optionId: null,
      optionItemId: item.id,
      patientConditionId: scope.condition.id,
      message: `${itemText}: ${conditionText(scope.condition)}`,
    });
  }
  return findings;
}

module.exports = { directConditionFindings };
