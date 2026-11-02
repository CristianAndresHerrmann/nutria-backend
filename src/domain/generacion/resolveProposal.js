const { randomUUID } = require('node:crypto');
const { OptionItemType } = require('@prisma/client');
const { categoriesOf } = require('../reglas/catalogIndex');

// Traduce la propuesta de nutria-ia (códigos cortos) al plan del backend
// (DA-27): comidas → opciones → ítems, con las columnas de PlanMeal, MealOption
// y OptionItem. Función pura salvo por los ids, que se generan acá para que el
// motor de reglas valide el plan en memoria y los hallazgos ya referencien
// opciones e ítems antes de guardar todo en una sola transacción.
//
// Un código válido da un ítem del catálogo con la copia del nombre y las
// categorías (DA-16). El texto libre da un ítem no reconocido con el texto
// original (DA-26). Un código que no se envió no debería llegar (el servicio
// rechaza esa salida, DA-28); si llega, tampoco se descarta: queda como no
// reconocido, y el motor lo bloquea hasta que el profesional lo reemplace.

function resolveItem(item, codes, order) {
  const base = { id: randomUUID(), order };

  if (item.type === 'free_text') return { ...base, type: OptionItemType.unrecognized, originalText: item.text };

  if (item.type === 'food') {
    const food = codes.foods.get(item.code);
    if (food) {
      return { ...base, type: OptionItemType.food, foodId: food.id, foodName: food.name, foodCategories: categoriesOf(food) };
    }
  }
  if (item.type === 'food_group') {
    const group = codes.groups.get(item.code);
    if (group) return { ...base, type: OptionItemType.food_group, foodGroupId: group.id, foodGroupName: group.name };
  }
  if (item.type === 'recipe') {
    const recipe = codes.recipes.get(item.code);
    if (recipe) return { ...base, type: OptionItemType.recipe, recipeId: recipe.id };
  }

  return { ...base, type: OptionItemType.unrecognized, originalText: `Código desconocido: ${item.code}` };
}

// Las comidas de la propuesta son exactamente las pedidas, sin repetir. El
// servicio ya lo controla; acá se repite porque una comida repetida chocaría
// con el único (plan_id, meal_type) y una no pedida no corresponde.
function proposalMatchesMealTypes(proposal, mealTypes) {
  const proposed = proposal.meals.map(({ meal_type: mealType }) => mealType);
  return (
    proposed.length === mealTypes.length &&
    new Set(proposed).size === proposed.length &&
    proposed.every((mealType) => mealTypes.includes(mealType))
  );
}

// proposal: la propuesta ya validada contra el contrato (iaProposal.schema).
// Devuelve los textos del plan y sus comidas. Las recomendaciones clínicas no
// las redacta la IA (DA-28): quedan vacías para que el profesional las elija del
// catálogo.
function resolveProposal(proposal, codes) {
  const fields = {
    situationalDiagnosis: proposal.situational_diagnosis,
    introduction: proposal.introduction,
    objectives: proposal.objectives,
    generalRecommendations: proposal.general_recommendations,
    contextualRecommendations: proposal.contextual_recommendations,
    clinicalRecommendations: null,
    thematicRecommendations: proposal.thematic_recommendations,
  };

  const meals = proposal.meals.map((meal) => ({
    id: randomUUID(),
    mealType: meal.meal_type,
    instructions: meal.instructions ?? null,
    options: meal.options.map((option, optionIndex) => ({
      id: randomUUID(),
      order: optionIndex + 1,
      description: option.description ?? null,
      items: option.items.map((item, itemIndex) => resolveItem(item, codes, itemIndex + 1)),
    })),
  }));

  return { fields, meals };
}

module.exports = { resolveProposal, proposalMatchesMealTypes };
