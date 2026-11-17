const { itemCategories } = require('../src/domain/reglas/itemCategories');
const { EQUIPMENT_BY_COOKING_METHOD } = require('../src/utils/recipeConditionFilter');

// Métricas de una propuesta generada para measure-generation (T58; Plan, Inc. 4:
// evaluadores). Funciones puras sobre el plan de la respuesta 201 y el catálogo
// del motor indexado (indexCatalog), sin base ni red. Fundamento en
// docs/decisiones/evaluadores-de-validez-de-la-generacion.md (repo raíz).

const MEAL_TYPES = ['breakfast', 'lunch', 'afternoon_snack', 'dinner'];
// Las categorías que se comparan entre objetivos. complementary e infusion no
// hacen a la composición (DA-32).
const COMPARED_CATEGORIES = ['protein', 'carbohydrate', 'vegetable', 'fiber', 'healthy_fat'];

const isRecipe = ({ type }) => type === 'recipe';

// Tipo de opción por comida: "receta" si tiene algún ítem de receta (y aparte,
// cuántas de esas suman otros ítems, como una fruta de postre); "armada" si se
// arma solo con alimentos, grupos o texto libre. Una opción vacía no cuenta.
// incompleteOptionIds: las opciones con un hallazgo de composición (R-03, R-04);
// "armadas incompletas" es el criterio de cierre de T60.
function optionKinds(plan, incompleteOptionIds = new Set()) {
  const byMeal = {};
  for (const { mealType, options } of plan.meals) {
    const counts = (byMeal[mealType] ??= {
      options: 0,
      recipe: 0,
      recipeWithExtras: 0,
      recipeIncomplete: 0,
      assembled: 0,
      assembledIncomplete: 0,
    });
    for (const { id, items } of options) {
      if (items.length === 0) continue;
      counts.options += 1;
      const incomplete = incompleteOptionIds.has(id);
      if (items.some(isRecipe)) {
        counts.recipe += 1;
        if (items.some((item) => !isRecipe(item))) counts.recipeWithExtras += 1;
        if (incomplete) counts.recipeIncomplete += 1;
      } else {
        counts.assembled += 1;
        if (incomplete) counts.assembledIncomplete += 1;
      }
    }
  }
  return byMeal;
}

// Las opciones con un hallazgo de composición, por el optionId del hallazgo.
function incompleteOptions(findings = []) {
  return new Set(findings.filter(({ type, optionId }) => type === 'composition' && optionId).map(({ optionId }) => optionId));
}

// Recetas que aparecen en más de una opción de la misma propuesta. Entre comidas:
// en dos o más tipos de comida distintos. En la misma comida: dos veces en las
// opciones de una comida. Una receta puede contar en las dos.
function recipeRepeats(plan) {
  const seen = new Map();
  for (const { mealType, options } of plan.meals) {
    for (const { items } of options) {
      for (const item of items.filter(isRecipe)) {
        const entry = seen.get(item.recipeId) ?? { name: item.recipe?.name ?? item.recipeId, meals: [] };
        entry.meals.push(mealType);
        seen.set(item.recipeId, entry);
      }
    }
  }
  const repeated = [...seen.values()].filter(({ meals }) => meals.length > 1);
  return {
    distinct: seen.size,
    repeated: repeated.length,
    betweenMeals: repeated.filter(({ meals }) => new Set(meals).size > 1).length,
    withinMeal: repeated.filter(({ meals }) => new Set(meals).size < meals.length).length,
    recipes: repeated,
  };
}

// El perfil de factibilidad de un paciente, desde sus datos estructurados (T62):
// los métodos de cocción que puede usar (solo sin cocción si no cocina; sin el
// método de un equipo que marcó que no tiene) y sus minutos por día para cocinar.
// Con el mismo criterio que el filtro de la generación (fitsEquipment): un dato
// faltante no excluye.
function feasibilityProfile(patient) {
  const cookingMethods =
    patient.cooks === false
      ? ['no_cooking']
      : [
          ...Object.entries(EQUIPMENT_BY_COOKING_METHOD)
            .filter(([, equipment]) => patient[equipment] !== false)
            .map(([method]) => method),
          'no_cooking',
        ];
  return { cookingMethods, maxMinutes: patient.cookingMinutesPerDay ?? null };
}

// Cada ítem de receta contra el perfil del caso ({ cookingMethods, maxMinutes }).
// No se puede hacer (equipment, infeasible) solo si su método de cocción necesita
// un equipo que el paciente no tiene. El tiempo de la receta es una referencia de
// la receta, no un límite del paciente, porque puede cocinarla otra persona
// (DA-50): time cuenta, solo como dato, las que tardan más que sus minutos por día.
// Sin método de cocción cargado, queda como unknown. Sin perfil, no se evalúa (null).
function feasibility(plan, catalog, profile) {
  if (!profile) return null;
  const result = { recipeItems: 0, equipment: 0, time: 0, unknown: 0, infeasible: 0, details: [] };
  for (const { mealType, options } of plan.meals) {
    for (const { items } of options) {
      for (const item of items.filter(isRecipe)) {
        const { name, cookingMethod, timeMinutes } = catalog.recipe(item.recipeId);
        result.recipeItems += 1;
        if (cookingMethod == null) {
          result.unknown += 1;
        } else if (!profile.cookingMethods.includes(cookingMethod)) {
          result.equipment += 1;
          result.infeasible += 1;
          result.details.push({ mealType, name, cookingMethod });
        }
        if (profile.maxMinutes != null && timeMinutes != null && timeMinutes > profile.maxMinutes) result.time += 1;
      }
    }
  }
  return result;
}

// Por comida, cuántas opciones aportan cada categoría: la unión de las de sus
// ítems, con el mismo criterio que el motor (itemCategories, DA-30).
function categoryShares(plan, catalog) {
  const byMeal = {};
  for (const { mealType, options } of plan.meals) {
    const counts = (byMeal[mealType] ??= { options: 0, categories: {} });
    for (const { items } of options) {
      if (items.length === 0) continue;
      counts.options += 1;
      const categories = new Set(items.flatMap((item) => itemCategories(item, catalog)));
      for (const category of categories) counts.categories[category] = (counts.categories[category] ?? 0) + 1;
    }
  }
  return byMeal;
}

// Hallazgos del motor por tipo y severidad: las exclusiones (condición directa,
// regla prohibited) y las advertencias de composición, que antes se contaban a
// mano desde el JSON.
function findingsByType(findings) {
  const byType = {};
  for (const { type, severity } of findings) {
    const counts = (byType[type] ??= { blocking: 0, warning: 0 });
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return byType;
}

module.exports = {
  MEAL_TYPES,
  COMPARED_CATEGORIES,
  optionKinds,
  incompleteOptions,
  recipeRepeats,
  feasibility,
  feasibilityProfile,
  categoryShares,
  findingsByType,
};
