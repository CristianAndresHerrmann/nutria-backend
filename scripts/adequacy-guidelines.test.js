const { indexCatalog } = require('../src/domain/reglas/catalogIndex');
const { GUIDELINE_IDS, createGuidelineEvaluator, sumGuidelines, goalCategoryFor } = require('./adequacy-guidelines');
const { FOOD_GROUPS, FOODS } = require('./seed-data/catalogs');

// El catálogo real del seed, con los nombres como ids (como
// clinical-cases.rules.test.js), más unas recetas de prueba con ingredientes reales.
const GROUPS = FOOD_GROUPS.map(({ name, parent }) => ({ id: name, name, parentId: parent ?? null }));
const SEED_FOODS = FOODS.map(({ name, group, categories }) => ({
  id: name,
  name,
  foodGroupId: group,
  active: true,
  categories: categories.map((category) => ({ category })),
}));
const testRecipe = (name, ingredients) => ({ id: name, name, ingredients: ingredients.map((id) => ({ food: { id } })) });
const RECIPES = [
  testRecipe('Ensalada de atún con limón', ['Lechuga', 'Atún al natural', 'Limón']),
  testRecipe('Fideos con ajo', ['Fideos secos', 'Ajo', 'Queso rallado']),
  testRecipe('Tostadas con dulce de leche', ['Pan francés', 'Dulce de leche']),
];
const CATALOG = indexCatalog({ foods: SEED_FOODS, groups: GROUPS, recipes: RECIPES });
const evaluator = createGuidelineEvaluator(CATALOG);

const food = (name) => ({
  id: `item ${name}`,
  type: 'food',
  foodId: name,
  foodName: name,
  foodCategories: CATALOG.food(name).categories.map(({ category }) => category),
});
const group = (name) => ({ id: `grupo ${name}`, type: 'food_group', foodGroupId: name, foodGroupName: name });
const recipe = (name) => ({ id: `receta ${name}`, type: 'recipe', recipeId: name, recipe: { name } });
const plan = (meals) => ({
  meals: Object.entries(meals).map(([mealType, options]) => ({ mealType, options: options.map((items) => ({ items })) })),
});

// Un plan que cumple las pautas generales.
const GOOD_PLAN = plan({
  breakfast: [[food('Leche descremada'), food('Pan integral'), food('Manzana')]],
  lunch: [[food('Merluza'), food('Lechuga'), food('Arroz integral'), food('Aceite de oliva'), food('Naranja')]],
  afternoon_snack: [[food('Yogur descremado'), food('Nueces'), food('Avena arrollada')]],
  dinner: [[food('Lentejas'), food('Zapallo'), food('Huevo'), food('Aceite de girasol'), food('Pera')]],
});

const share = (num, den) => ({ num, den });
const yes = share(1, 1);
const no = share(0, 1);

describe('adequacy-guidelines — pautas de adecuación de T57 (T58)', () => {
  it('resuelve contra el catálogo real del seed todos los grupos y alimentos que nombran las pautas', () => {
    expect(() => createGuidelineEvaluator(CATALOG)).not.toThrow();
  });

  it('falla si una pauta nombra algo que no está en el catálogo, en vez de medir 0 % sin avisar', () => {
    const catalog = indexCatalog({ foods: SEED_FOODS.filter(({ name }) => name !== 'Limón'), groups: GROUPS, recipes: [] });
    expect(() => createGuidelineEvaluator(catalog)).toThrow(/alimento Limón/);
  });

  it('aplica las GEN a todos, las de patología por la condición (CM-07) y las OBE por "bajar de peso" (CM-08)', () => {
    const ids = (context) => Object.keys(evaluator.evaluate(GOOD_PLAN, context));
    const gen = GUIDELINE_IDS.filter((id) => id.startsWith('PA-GEN'));
    expect(ids({ goal: 'Comer más ordenado' })).toEqual(gen);
    expect(ids({ pathologies: ['Diabetes'] })).toEqual([...gen, ...GUIDELINE_IDS.filter((id) => id.startsWith('PA-DM2'))]);
    expect(ids({ pathologies: ['Celiaquía', 'Hipertensión'] })).toEqual(expect.arrayContaining(['PA-HTA-02', 'PA-CEL-02']));
    expect(ids({ goal: 'Quiere BAJAR DE PESO' })).toEqual([...gen, ...GUIDELINE_IDS.filter((id) => id.startsWith('PA-OBE'))]);
  });

  it('con categoría de objetivo (T61), las OBE siguen a la categoría y no al texto', () => {
    const ids = (context) => Object.keys(evaluator.evaluate(GOOD_PLAN, context));
    expect(ids({ goal: 'Llegar a su peso', goalCategory: 'lose_weight' })).toContain('PA-OBE-01');
    expect(ids({ goal: 'Bajar de peso', goalCategory: 'other' })).not.toContain('PA-OBE-01');
    expect(goalCategoryFor('Quiere bajar de peso')).toBe('lose_weight');
    expect(goalCategoryFor('Comer más ordenado')).toBe('other');
    expect(goalCategoryFor(null)).toBe('other');
  });

  it('mide las pautas generales sobre un plan que las cumple', () => {
    const results = evaluator.evaluate(GOOD_PLAN);
    expect(results['PA-GEN-01'].main).toEqual(yes);
    expect(results['PA-GEN-02']).toEqual({ level: 'plan', main: yes, indicators: { grupos: share(8, 8) } });
    expect(results['PA-GEN-03'].main).toEqual(share(2, 2));
    expect(results['PA-GEN-04']).toMatchObject({ main: yes, indicators: { comidas: share(3, 4) } });
    expect(results['PA-GEN-05'].indicators.descremados).toEqual(share(2, 2));
    expect(results['PA-GEN-06'].indicators).toEqual({ pescado: yes, huevo: yes });
    expect(results['PA-GEN-07'].indicators).toEqual({ legumbres: yes, integrales: share(3, 3) });
    expect(results['PA-GEN-08'].main).toEqual(yes);
    expect(results['PA-GEN-09'].main).toEqual(share(2, 2));
    // La cena no tiene cereal: no entra en el denominador.
    expect(results['PA-GEN-10'].main).toEqual(share(1, 1));
    expect(results['PA-GEN-11'].indicators).toMatchObject({ 'desayuno: fruta': share(1, 1), 'merienda: frutos secos': share(1, 1) });
    expect(results['PA-GEN-11'].main).toBeUndefined();
  });

  it('no cuenta como porción el ajo, el limón ni el queso rallado (CM-10), ni un grupo más amplio que el de la pauta (CM-02)', () => {
    const results = evaluator.evaluate(
      plan({
        lunch: [[food('Ajo'), food('Pechuga de pollo')], [group('Verduras')], [group('Verduras de hoja')], [recipe('Fideos con ajo')]],
        dinner: [[food('Limón'), food('Queso rallado'), group('Carnes, pescados y huevos')]],
      }),
    );
    expect(results['PA-GEN-03'].main).toEqual(share(1, 5));
    expect(results['PA-GEN-04'].main).toEqual(no);
    expect(results['PA-GEN-05'].main).toEqual(no);
    expect(results['PA-GEN-06'].indicators.pescado).toEqual(no);
  });

  it('cuenta los ingredientes de una receta para el grupo de la pauta', () => {
    const results = evaluator.evaluate(plan({ lunch: [[recipe('Ensalada de atún con limón')]] }), {
      pathologies: ['Diabetes', 'Hipertensión'],
    });
    expect(results['PA-GEN-03'].main).toEqual(share(1, 1));
    expect(results['PA-GEN-06'].indicators.pescado).toEqual(yes);
    expect(results['PA-DM2-05'].indicators['pescado graso']).toEqual(yes);
    // El limón no es fruta (CM-10), pero sí reemplaza a la sal (PA-HTA-02).
    expect(results['PA-GEN-04'].main).toEqual(no);
    expect(results['PA-HTA-02']).toMatchObject({ main: yes, indicators: { 'almuerzo y cena': share(1, 1) } });
    expect(results['PA-HTA-01']).toEqual({ level: 'plan', sameAs: expect.arrayContaining(['PA-GEN-02', 'PA-GEN-08']) });
  });

  it('no cuenta los ítems con hallazgo bloqueante (CM-03)', () => {
    const bread = food('Pan francés');
    const proposal = plan({ breakfast: [[bread, food('Leche')]] });
    expect(evaluator.evaluate(proposal)['PA-GEN-02'].indicators.grupos).toEqual(share(2, 8));
    expect(evaluator.evaluate(proposal, { blockingItemIds: new Set([bread.id]) })['PA-GEN-02'].indicators.grupos).toEqual(
      share(1, 8),
    );
  });

  it('mide el método del plato, el hidrato con proteína y el edulcorante en diabetes', () => {
    const results = evaluator.evaluate(
      plan({
        breakfast: [[food('Pan integral'), food('Queso untable descremado'), food('Edulcorante')], [food('Pan francés'), food('Azúcar')]],
        lunch: [
          [food('Brócoli'), food('Pechuga de pollo'), food('Papa'), food('Manzana'), food('Aceite de oliva')],
          [food('Brócoli'), food('Jamón cocido'), food('Papa')],
        ],
      }),
      { pathologies: ['Diabetes'] },
    );
    expect(results['PA-DM2-01'].main).toEqual(share(1, 2));
    // Los fiambres no cuentan como la proteína del plato.
    expect(results['PA-DM2-01'].indicators.proteína).toEqual(share(1, 2));
    expect(results['PA-DM2-02'].indicators).toMatchObject({ desayuno: share(2, 2), almuerzo: share(2, 2) });
    expect(results['PA-DM2-03'].main).toEqual(share(1, 2));
    expect(results['PA-DM2-06'].main).toEqual(share(1, 2));
  });

  it('en celiaquía cuenta solo el cereal sin gluten (PA-CEL-01) y mide los hidratos sin gluten por opción', () => {
    const results = evaluator.evaluate(
      plan({
        breakfast: [[food('Pan francés'), food('Leche')], [food('Tostadas de arroz'), food('Leche')]],
        lunch: [[food('Papa'), food('Merluza')], [food('Lentejas')], [food('Avena sin TACC')]],
      }),
      { pathologies: ['Celiaquía'] },
    );
    expect(results['PA-GEN-02'].indicators.grupos.num - results['PA-CEL-01'].indicators.grupos.num).toBe(0);
    expect(results['PA-CEL-02'].main).toEqual(share(3, 5));
    const onlyGluten = evaluator.evaluate(plan({ breakfast: [[food('Pan francés')]] }), { pathologies: ['Celiaquía'] });
    expect(onlyGluten['PA-GEN-02'].indicators.grupos).toEqual(share(1, 8));
    expect(onlyGluten['PA-CEL-01'].indicators.grupos).toEqual(share(0, 8));
  });

  it('mide las pautas de bajar de peso: carnes rojas magras, plato, desayuno y consumo opcional', () => {
    const toast = recipe('Tostadas con dulce de leche');
    const results = evaluator.evaluate(
      plan({
        breakfast: [[food('Leche'), food('Banana'), food('Copos de maíz sin TACC')], [toast]],
        lunch: [
          [food('Carne vacuna magra'), food('Lechuga'), food('Arroz blanco'), food('Pera'), food('Aceite de oliva')],
          [food('Asado'), food('Lechuga')],
          [food('Merluza'), food('Tomate')],
        ],
        dinner: [[food('Salame'), food('Pan francés')]],
      }),
      { goal: 'Bajar de peso', blockingItemIds: new Set([toast.id]) },
    );
    expect(results['PA-OBE-02'].indicators).toEqual({ 'con carnes rojas': share(2, 4), 'cortes magros': share(1, 2) });
    expect(results['PA-OBE-02'].main).toEqual(no);
    expect(results['PA-OBE-04'].main).toEqual(share(3, 4));
    expect(results['PA-OBE-05'].main).toEqual(share(1, 4));
    expect(results['PA-OBE-05'].indicators.aceite).toEqual(share(1, 4));
    expect(results['PA-OBE-06'].main).toEqual(share(1, 2));
    expect(results['PA-OBE-06'].indicators['integrales o copos sin azúcar']).toEqual(share(1, 1));
    // La receta bloqueada y el fiambre están en el plan: cuentan para el consumo opcional.
    expect(results['PA-OBE-07']).toMatchObject({ main: no, indicators: { 'con consumo opcional': share(2, 6) } });
    expect(results['PA-OBE-03']).toEqual({ level: 'plan', sameAs: ['PA-GEN-01'] });
  });

  it('suma los resultados de varias propuestas por pauta e indicador', () => {
    const first = evaluator.evaluate(GOOD_PLAN);
    const second = evaluator.evaluate(plan({ lunch: [[food('Pechuga de pollo')]] }));
    const totals = sumGuidelines([first, second]);
    expect(totals['PA-GEN-01']).toMatchObject({ level: 'plan', plans: 2, main: share(1, 2) });
    expect(totals['PA-GEN-03'].main).toEqual(share(2, 3));
    expect(totals['PA-GEN-02'].indicators.grupos).toEqual(share(9, 16));
    expect(sumGuidelines([evaluator.evaluate(GOOD_PLAN, { pathologies: ['Hipertensión'] })])['PA-HTA-01'].sameAs).toHaveLength(6);
  });
});
