const { indexCatalog } = require('../src/domain/reglas/catalogIndex');
const { optionKinds, incompleteOptions, recipeRepeats, feasibility, feasibilityProfile, categoryShares, findingsByType } = require('./proposal-metrics');
const { CLINICAL_CASES } = require('./seed-data/clinical-cases');

// Catálogo mínimo, con los nombres como ids.
const food = (name, foodGroupId, categories) => ({
  id: name,
  name,
  foodGroupId,
  active: true,
  categories: categories.map((category) => ({ category })),
});
const recipe = (name, cookingMethod, timeMinutes, ingredients) => ({
  id: name,
  name,
  cookingMethod,
  timeMinutes,
  ingredients: ingredients.map((id) => ({ food: { id } })),
});
const CATALOG = indexCatalog({
  foods: [
    food('Pollo', 'Aves', ['protein']),
    food('Arroz', 'Arroz y granos', ['carbohydrate']),
    food('Tomate', 'Hortalizas de fruto', ['vegetable']),
    food('Manzana', 'Frutas frescas', ['fiber']),
    food('Leche', 'Leches y yogures', ['protein']),
  ],
  groups: [{ id: 'Frutas frescas', parentId: null }],
  recipes: [
    recipe('Pollo al horno con arroz', 'oven', 50, ['Pollo', 'Arroz']),
    recipe('Ensalada de tomate', 'no_cooking', 5, ['Tomate']),
    recipe('Arroz salteado', 'stovetop', 15, ['Arroz', 'Tomate']),
    recipe('Sin datos', null, null, ['Arroz']),
  ],
});

const recipeItem = (name) => ({ type: 'recipe', recipeId: name, recipe: { name } });
const foodItem = (name) => ({ type: 'food', foodId: name, foodName: name, foodCategories: CATALOG.food(name).categories.map(({ category }) => category) });
const option = (...items) => ({ items });

const PLAN = {
  meals: [
    { mealType: 'breakfast', options: [option(foodItem('Leche'), foodItem('Manzana')), option(recipeItem('Ensalada de tomate'))] },
    {
      mealType: 'lunch',
      options: [
        option(recipeItem('Pollo al horno con arroz'), foodItem('Manzana')),
        option(recipeItem('Ensalada de tomate')),
        option(recipeItem('Ensalada de tomate'), foodItem('Pollo')),
        option(),
      ],
    },
    { mealType: 'dinner', options: [option(recipeItem('Arroz salteado')), option(recipeItem('Sin datos'))] },
  ],
};

describe('proposal-metrics — validez de la propuesta (T58)', () => {
  it('clasifica cada opción en receta (con o sin otros ítems) o armada, por comida, sin contar las vacías', () => {
    expect(optionKinds(PLAN)).toEqual({
      breakfast: { options: 2, recipe: 1, recipeWithExtras: 0, recipeIncomplete: 0, assembled: 1, assembledIncomplete: 0 },
      lunch: { options: 3, recipe: 3, recipeWithExtras: 2, recipeIncomplete: 0, assembled: 0, assembledIncomplete: 0 },
      dinner: { options: 2, recipe: 2, recipeWithExtras: 0, recipeIncomplete: 0, assembled: 0, assembledIncomplete: 0 },
    });
  });

  it('cuenta las opciones incompletas por los hallazgos de composición de cada opción (criterio de T60)', () => {
    const incomplete = incompleteOptions([
      { type: 'composition', optionId: 'armada' },
      { type: 'composition', optionId: 'receta' },
      { type: 'pathology_rule', optionId: 'otra' },
      { type: 'composition', optionItemId: 'sin opción' },
    ]);
    expect([...incomplete]).toEqual(['armada', 'receta']);
    const plan = {
      meals: [
        {
          mealType: 'lunch',
          options: [
            { id: 'armada', items: [foodItem('Tomate')] },
            { id: 'receta', items: [recipeItem('Ensalada de tomate')] },
            { id: 'completa', items: [foodItem('Pollo'), foodItem('Arroz'), foodItem('Tomate')] },
          ],
        },
      ],
    };
    expect(optionKinds(plan, incomplete).lunch).toMatchObject({ assembled: 2, assembledIncomplete: 1, recipe: 1, recipeIncomplete: 1 });
  });

  it('cuenta las recetas repetidas entre comidas y dentro de la misma comida', () => {
    const repeats = recipeRepeats(PLAN);
    expect(repeats).toMatchObject({ distinct: 4, repeated: 1, betweenMeals: 1, withinMeal: 1 });
    expect(repeats.recipes).toEqual([{ name: 'Ensalada de tomate', meals: ['breakfast', 'lunch', 'lunch'] }]);
    expect(recipeRepeats({ meals: [{ mealType: 'lunch', options: [option(recipeItem('Arroz salteado'))] }]})).toMatchObject({
      repeated: 0,
      betweenMeals: 0,
      withinMeal: 0,
    });
  });

  it('marca las recetas que no se pueden hacer sin horno (C1); las que superan su tiempo solo se cuentan', () => {
    const c1 = feasibilityProfile(CLINICAL_CASES.find(({ code }) => code === 'C1').patient.data);
    const result = feasibility(PLAN, CATALOG, c1);
    expect(result).toMatchObject({ recipeItems: 6, equipment: 1, time: 1, unknown: 1, infeasible: 1 });
    expect(result.details).toEqual([{ mealType: 'lunch', name: 'Pollo al horno con arroz', cookingMethod: 'oven' }]);
  });

  it('una receta que solo supera el tiempo del paciente se puede hacer: el tiempo es referencia de la receta (DA-50)', () => {
    const result = feasibility(PLAN, CATALOG, { cookingMethods: ['oven', 'stovetop', 'microwave', 'no_cooking'], maxMinutes: 10 });
    expect(result).toMatchObject({ equipment: 0, time: 2, unknown: 1, infeasible: 0, details: [] });
  });

  it('arma el perfil desde el equipamiento y los minutos del paciente (T62); un dato faltante no excluye', () => {
    expect(feasibilityProfile({ cooks: true, hasOven: false, hasStovetop: true, hasMicrowave: null, cookingMinutesPerDay: 20 })).toEqual({
      cookingMethods: ['stovetop', 'microwave', 'no_cooking'],
      maxMinutes: 20,
    });
    expect(feasibilityProfile({ cooks: false, hasOven: true })).toEqual({ cookingMethods: ['no_cooking'], maxMinutes: null });
    expect(feasibilityProfile({})).toEqual({ cookingMethods: ['oven', 'stovetop', 'microwave', 'no_cooking'], maxMinutes: null });
  });

  it('sin tope de tiempo no controla el tiempo, y sin perfil no evalúa', () => {
    const noCooking = feasibility(PLAN, CATALOG, { cookingMethods: ['no_cooking'], maxMinutes: null });
    expect(noCooking).toMatchObject({ equipment: 2, time: 0, unknown: 1, infeasible: 2 });
    expect(feasibility(PLAN, CATALOG, null)).toBeNull();
  });

  it('cuenta, por comida, las opciones que aportan cada categoría con el criterio del motor', () => {
    expect(categoryShares(PLAN, CATALOG)).toEqual({
      breakfast: { options: 2, categories: { protein: 1, fiber: 1, vegetable: 1 } },
      lunch: { options: 3, categories: { protein: 2, carbohydrate: 1, fiber: 1, vegetable: 2 } },
      dinner: { options: 2, categories: { carbohydrate: 2, vegetable: 1 } },
    });
  });

  it('agrupa los hallazgos por tipo y severidad', () => {
    expect(
      findingsByType([
        { type: 'pathology_rule', severity: 'blocking' },
        { type: 'pathology_rule', severity: 'warning' },
        { type: 'meal_composition', severity: 'warning' },
        { type: 'meal_composition', severity: 'warning' },
      ]),
    ).toEqual({ pathology_rule: { blocking: 1, warning: 1 }, meal_composition: { blocking: 0, warning: 2 } });
  });
});
