const { FoodCategoryType, MealType } = require('@prisma/client');

// Composición esperada de cada tipo de comida (RF-26), sobre las categorías
// nutricionales de los alimentos (RF-25). Es configuración, no una regla clínica:
// el motor de reglas la usa para advertir una opción incompleta (RF-44), sin
// bloquear la aprobación. Se edita acá, versionada: no hay tabla ni pantalla.
// Fundamento: docs/decisiones/composicion-esperada-por-tipo-de-comida.md en el
// repo raíz (DA-29).

// RF-26: verdura, proteína e hidrato.
const LUNCH_AND_DINNER = Object.freeze([
  FoodCategoryType.vegetable,
  FoodCategoryType.protein,
  FoodCategoryType.carbohydrate,
]);

// Supuesto hasta la entrevista de validación. Lo común al desayuno y la merienda
// del Manual para la aplicación de las Guías Alimentarias para la Población
// Argentina (Ministerio de Salud, pp. 20-22): un lácteo (protein en el catálogo)
// y pan o cereales (carbohydrate). La fruta y las frutas secas no se exigen.
const BREAKFAST_AND_SNACK = Object.freeze([FoodCategoryType.protein, FoodCategoryType.carbohydrate]);

// null: composición sin definir, no genera advertencias.
const MEAL_COMPOSITION = Object.freeze({
  [MealType.breakfast]: BREAKFAST_AND_SNACK,
  [MealType.lunch]: LUNCH_AND_DINNER,
  [MealType.afternoon_snack]: BREAKFAST_AND_SNACK,
  [MealType.dinner]: LUNCH_AND_DINNER,
});

// Categorías esperadas que ningún ítem de la opción cubre, en el orden de la
// configuración. Cada ítem trae sus categorías: en un alimento, la copia
// foodCategories; cómo se derivan las de una receta se define con el motor.
function missingCategories(mealType, items, composition = MEAL_COMPOSITION) {
  const expected = composition[mealType];
  if (!expected) return [];

  const present = new Set(items.flatMap((item) => item.categories));
  return expected.filter((category) => !present.has(category));
}

module.exports = { MEAL_COMPOSITION, missingCategories };
