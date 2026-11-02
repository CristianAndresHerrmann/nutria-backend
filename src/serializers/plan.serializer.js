const { FindingType, MealType } = require('@prisma/client');

const MEAL_ORDER = Object.values(MealType);

// Los hallazgos de un mismo guardado comparten detected_at, así que la base no
// los devuelve en un orden útil. Se ordenan como los produce el motor de reglas
// (validatePlan.js): por comida, opción e ítem; dentro de un ítem, el no
// reconocido primero; la composición al final de su opción. Un hallazgo que no
// se puede ubicar en el plan va al final.
function findingSortKey(plan) {
  const optionPositions = new Map();
  const itemPositions = new Map();
  for (const meal of plan.meals ?? []) {
    const mealIndex = MEAL_ORDER.indexOf(meal.mealType);
    for (const option of meal.options) {
      optionPositions.set(option.id, [mealIndex, option.order]);
      for (const item of option.items) itemPositions.set(item.id, [mealIndex, option.order, item.order]);
    }
  }

  return (finding) => {
    if (finding.optionItemId && itemPositions.has(finding.optionItemId)) {
      const typeRank = finding.type === FindingType.unrecognized_item ? 0 : 1;
      return [...itemPositions.get(finding.optionItemId), typeRank];
    }
    if (finding.optionId && optionPositions.has(finding.optionId)) {
      return [...optionPositions.get(finding.optionId), Infinity, 0];
    }
    return [Infinity, Infinity, Infinity, Infinity];
  };
}

function compareKeys(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function sortFindings(plan) {
  const keyOf = findingSortKey(plan);
  return (plan.findings ?? [])
    .map((finding) => ({ finding, key: keyOf(finding) }))
    .sort((a, b) => compareKeys(a.key, b.key) || a.finding.message.localeCompare(b.finding.message, 'es'))
    .map(({ finding }) => finding);
}

// nutritionistId no viaja: el único dueño posible de un plan que el
// nutricionista ve es él mismo. De las generaciones, el resumen de la última
// queda en `generation` (null si el plan no salió de una generación): el
// editor la muestra como propuesta de la IA, editable (RNF-12).
function serializePlan(plan) {
  const { nutritionistId: _nutritionistId, aiGenerations = [], ...rest } = plan;
  return { ...rest, findings: sortFindings(plan), generation: aiGenerations[0] ?? null };
}

module.exports = { serializePlan };
