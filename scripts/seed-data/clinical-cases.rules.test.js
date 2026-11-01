const { validatePlan } = require('../../src/domain/reglas/validatePlan');
const { FOOD_GROUPS, FOODS } = require('./catalogs');
const { CLINICAL_CASES } = require('./clinical-cases');
const { CLINICAL_RULES } = require('./clinical-rules');
const { COMMON_RECIPES } = require('./recipes');

// Criterio de cierre de T35: los casos clínicos de T41 producen los hallazgos que
// espera la matriz de reglas (docs/reglas-clinicas.md, R-05). Corre el motor real
// con los datos reales del seed, sin base: los nombres hacen de ids.

const GROUPS = FOOD_GROUPS.map(({ name, parent }) => ({ id: name, name, parentId: parent ?? null }));

const CATALOG_FOODS = FOODS.map(({ name, group, categories }) => ({
  id: name,
  name,
  foodGroupId: group,
  active: true,
  nutritionistId: null,
  categories: categories.map((category) => ({ category })),
}));
const foodByName = new Map(CATALOG_FOODS.map((food) => [food.name, food]));

const RECIPES = COMMON_RECIPES.map(({ name, ingredients }) => ({
  id: name,
  name,
  ingredients: ingredients.map(({ food }) => ({ food: foodByName.get(food) })),
}));

const CATALOG = { foods: CATALOG_FOODS, groups: GROUPS, recipes: RECIPES };

const RULES = CLINICAL_RULES.map(({ pathology, food, foodGroup, severity, source }) => ({
  id: `${pathology} → ${food ?? foodGroup}`,
  pathologyId: pathology,
  foodId: food ?? null,
  foodGroupId: foodGroup ?? null,
  severity,
  source,
}));

const conditionsOf = (code) =>
  CLINICAL_CASES.find((clinicalCase) => clinicalCase.code === code).patient.conditions.map(
    ({ type, pathology, food, foodGroup }, index) => ({
      id: `${code}-${index}`,
      type,
      pathologyId: pathology ?? null,
      foodId: food ?? null,
      foodGroupId: foodGroup ?? null,
      pathology: pathology ? { name: pathology } : null,
      food: food ? { name: food } : null,
      foodGroup: foodGroup ? { name: foodGroup } : null,
    }),
  );

// Un plan de prueba con lo que alcanza cada regla de la matriz, sus alternativas
// del catálogo y lo que alcanza cada condición directa de los casos. El ítem se
// identifica por su nombre.
const foodItem = (name) => {
  const { categories } = foodByName.get(name);
  return { id: name, type: 'food', foodId: name, foodName: name, foodCategories: categories.map(({ category }) => category) };
};
const groupItem = (name) => ({ id: `Grupo ${name}`, type: 'food_group', foodGroupId: name, foodGroupName: name });
const recipeItem = (name) => ({ id: `Receta ${name}`, type: 'recipe', recipeId: name });

const ITEMS = [
  foodItem('Pan francés'),
  foodItem('Pan sin TACC'),
  foodItem('Avena sin TACC'),
  groupItem('Cereales y derivados'),
  recipeItem('Milanesa de carne al horno con ensalada'),
  foodItem('Azúcar'),
  foodItem('Edulcorante'),
  foodItem('Caldo en cubo'),
  foodItem('Sal con bajo contenido de sodio'),
  foodItem('Jamón cocido'),
  groupItem('Fiambres y embutidos'),
  foodItem('Huevo'),
  foodItem('Leche'),
  foodItem('Lentejas'),
];

const PLAN = {
  id: 'plan-t41',
  meals: [{ mealType: 'lunch', options: [{ id: 'o-1', order: 1, items: ITEMS.map((item, index) => ({ ...item, order: index + 1 })) }] }],
};

const findingsOf = (code) =>
  validatePlan({ plan: PLAN, conditions: conditionsOf(code), rules: RULES, catalog: CATALOG }).map(
    ({ type, severity, optionItemId }) => [optionItemId, type, severity],
  );

// La tabla de la ficha R-05 ("Casos de T41").
const EXPECTED = {
  C1: [
    ['Pan francés', 'pathology_rule', 'blocking'],
    ['Avena sin TACC', 'pathology_rule', 'warning'],
    ['Receta Milanesa de carne al horno con ensalada', 'pathology_rule', 'blocking'],
  ],
  C2: [['Azúcar', 'pathology_rule', 'warning']],
  C3: [
    ['Caldo en cubo', 'pathology_rule', 'blocking'],
    ['Jamón cocido', 'pathology_rule', 'warning'],
    ['Grupo Fiambres y embutidos', 'pathology_rule', 'warning'],
  ],
  C4: [
    ['Receta Milanesa de carne al horno con ensalada', 'direct_condition', 'blocking'],
    ['Huevo', 'direct_condition', 'blocking'],
  ],
  C5: [['Leche', 'direct_condition', 'blocking']],
  C6: [],
  C7: [['Lentejas', 'direct_condition', 'blocking']],
};

describe('casos clínicos de T41 contra la matriz de reglas (T35)', () => {
  it('hay un resultado esperado para cada caso', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(CLINICAL_CASES.map(({ code }) => code).sort());
  });

  it.each(Object.entries(EXPECTED))('%s produce los hallazgos esperados', (code, expected) => {
    expect(findingsOf(code)).toEqual(expected);
  });

  it('el mensaje nombra la patología y la fuente de la regla', () => {
    const findings = validatePlan({ plan: PLAN, conditions: conditionsOf('C1'), rules: RULES, catalog: CATALOG });

    expect(findings[0].message).toBe('Pan francés: excluido por Celiaquía (MSAL, GPC enfermedad celíaca (2016), pp. 35 y 43)');
  });
});
