const { FindingSeverity, FindingType, MealType, OptionItemType } = require('@prisma/client');
const { MEAL_NAMES, MEAL_WITH_ARTICLE, joinLabels } = require('./mealLabels');

// Receta fuera de su tipo de comida (R-06, T54; DA-40): advierte cuando un ítem de
// receta está en una comida que no figura entre los tipos de comida de la receta
// (receta_tipo_comida, RF-27). Vale igual para la propuesta de la IA y para la
// edición manual. Es una advertencia, como la composición: no es un riesgo
// clínico y el profesional puede decidir usarla en otra comida.

const MEAL_ORDER = Object.values(MealType);

// item: ítem del plan; mealType: la comida que lo contiene; catalog: el índice de
// catalogIndex.js. Devuelve el hallazgo o null.
function recipeMealTypeFinding(item, mealType, catalog) {
  if (item.type !== OptionItemType.recipe) return null;

  const recipe = catalog.recipe(item.recipeId);
  const recipeMealTypes = recipe.mealTypes.map(({ mealType: value }) => value);
  if (recipeMealTypes.includes(mealType)) return null;

  const indicated = MEAL_ORDER.filter((value) => recipeMealTypes.includes(value)).map((value) => MEAL_NAMES[value]);
  const suffix = indicated.length > 0 ? ` (se indica para ${joinLabels(indicated)})` : '';
  return {
    type: FindingType.meal_type_mismatch,
    severity: FindingSeverity.warning,
    optionId: null,
    optionItemId: item.id,
    patientConditionId: null,
    message: `Receta ${recipe.name}: no está indicada para ${MEAL_WITH_ARTICLE[mealType]}${suffix}`,
  };
}

module.exports = { recipeMealTypeFinding };
