// Nombres de los tipos de comida para los mensajes del motor y del servicio de
// planes. Están aparte para que las reglas los usen sin importar validatePlan.js.

// "Opción 1 del almuerzo".
const MEAL_LABELS = {
  breakfast: 'del desayuno',
  lunch: 'del almuerzo',
  afternoon_snack: 'de la merienda',
  dinner: 'de la cena',
};

// "no está indicada para la cena".
const MEAL_WITH_ARTICLE = {
  breakfast: 'el desayuno',
  lunch: 'el almuerzo',
  afternoon_snack: 'la merienda',
  dinner: 'la cena',
};

// "se indica para desayuno y merienda".
const MEAL_NAMES = {
  breakfast: 'desayuno',
  lunch: 'almuerzo',
  afternoon_snack: 'merienda',
  dinner: 'cena',
};

function joinLabels(labels) {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}

module.exports = { MEAL_LABELS, MEAL_WITH_ARTICLE, MEAL_NAMES, joinLabels };
