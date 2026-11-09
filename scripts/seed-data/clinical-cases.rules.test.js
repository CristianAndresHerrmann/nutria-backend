const { validatePlan } = require('../../src/domain/reglas/validatePlan');
const { allowedCatalog, CONTRACT_LIMITS } = require('../../src/domain/generacion/allowedCatalog');
const { recipesForPatient } = require('../../src/utils/recipeConditionFilter');
const { descendantIds } = require('../../src/utils/foodGroupTree');
const { buildGenerationContext } = require('../../src/domain/generacion/buildContext');
const { FOOD_GROUPS, FOODS } = require('./catalogs');
const { CLINICAL_CASES } = require('./clinical-cases');
const { CLINICAL_RULES } = require('./clinical-rules');
const { COMMON_RECIPES } = require('./recipes');
const { PRIVATE_RECIPES, CONTROL_RECIPES } = require('./private-recipes');

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

const toRecipe = ({ name, ingredients, cookingMethod, mealTypes }) => ({
  id: name,
  name,
  cookingMethod,
  availableInCatalog: true,
  ingredients: ingredients.map(({ food }) => ({ food: foodByName.get(food) })),
  mealTypes: mealTypes.map((mealType) => ({ mealType })),
});

// Lo que ve cada cuenta del seed: las comunes, y la primera además sus propias.
const SECOND_ACCOUNT_RECIPES = COMMON_RECIPES.map(toRecipe);
const RECIPES = [...COMMON_RECIPES, ...PRIVATE_RECIPES, ...CONTROL_RECIPES].map(toRecipe);

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

// El filtro real (RF-37, RF-38) con las recetas reales del seed: lo que se le ofrece
// a la IA en cada caso. Lo que se espera se expresa con los datos de cada caso, sin
// pasar por el filtro que se prueba.
describe('candidatas de la generación con el catálogo real del seed', () => {
  const ACCOUNTS = [
    ['nutricionista@', RECIPES],
    ['nutricionista2@', SECOND_ACCOUNT_RECIPES],
  ];
  const ALL_MEALS = ['breakfast', 'lunch', 'afternoon_snack', 'dinner'];
  const MIN_CANDIDATES_PER_MEAL = 5;

  const prohibitedRulesOf = (code) => {
    const pathologyIds = conditionsOf(code).map(({ pathologyId }) => pathologyId);
    return RULES.filter(({ pathologyId, severity }) => severity === 'prohibited' && pathologyIds.includes(pathologyId));
  };
  const cooksOf = (code) => CLINICAL_CASES.find((clinicalCase) => clinicalCase.code === code).patient.data.cooks;

  const allowedOf = (code, recipes = RECIPES, cooks = cooksOf(code)) =>
    allowedCatalog({
      foods: CATALOG_FOODS,
      groups: GROUPS,
      recipes,
      conditions: conditionsOf(code),
      prohibitedRules: prohibitedRulesOf(code),
      mealTypes: ALL_MEALS,
      cooks,
    });
  const candidatesOf = (code, recipes, cooks) => allowedOf(code, recipes, cooks).recipes;
  const namesOf = (recipes) => recipes.map(({ name }) => name);
  const usesFood = ({ ingredients }, predicate) => ingredients.some(({ food }) => predicate(food));

  // Hallazgos de una receta dentro de un plan, en el caso dado, en la primera de
  // sus comidas (así no aparece R-06).
  const recipeFindings = (code, name) =>
    validatePlan({
      plan: {
        id: 'plan-candidatas',
        meals: [
          {
            mealType: RECIPES.find((recipe) => recipe.name === name).mealTypes[0].mealType,
            options: [{ id: 'o-1', order: 1, items: [{ ...recipeItem(name), order: 1 }] }],
          },
        ],
      },
      conditions: conditionsOf(code),
      rules: RULES,
      catalog: CATALOG,
    }).filter(({ type }) => type !== 'composition').map(({ type, severity }) => [type, severity]);

  describe.each(ACCOUNTS)('cuenta %s', (_account, recipes) => {
    it('C1 no recibe ninguna receta con un alimento prohibido por celiaquía', () => {
      const prohibited = new Set(
        CLINICAL_RULES.filter(({ pathology, severity }) => pathology === 'Celiaquía' && severity === 'prohibited').map(({ food }) => food),
      );
      expect(prohibited.size).toBeGreaterThan(0);
      const offending = candidatesOf('C1', recipes).filter((recipe) => usesFood(recipe, ({ name }) => prohibited.has(name)));
      expect(namesOf(offending)).toEqual([]);
    });

    it('C3, que no cocina, recibe solo recetas sin cocción', () => {
      const candidates = candidatesOf('C3', recipes);
      expect(candidates.length).toBeGreaterThan(0);
      expect(namesOf(candidates.filter(({ cookingMethod }) => cookingMethod !== 'no_cooking'))).toEqual([]);
    });

    it('C4, C5 y C7 no reciben recetas con lo que alcanza su condición', () => {
      const legumeGroups = new Set(FOOD_GROUPS.filter(({ parent }) => parent === 'Legumbres').map(({ name }) => name));

      expect(namesOf(candidatesOf('C4', recipes).filter((recipe) => usesFood(recipe, ({ foodGroupId }) => foodGroupId === 'Huevos')))).toEqual([]);
      expect(namesOf(candidatesOf('C5', recipes).filter((recipe) => usesFood(recipe, ({ name }) => name === 'Leche')))).toEqual([]);
      expect(namesOf(candidatesOf('C7', recipes).filter((recipe) => usesFood(recipe, ({ foodGroupId }) => legumeGroups.has(foodGroupId))))).toEqual([]);
    });

    it.each(CLINICAL_CASES.map(({ code }) => code))('%s conserva opciones en cada comida, dentro del tope del contrato', (code) => {
      const candidates = candidatesOf(code, recipes);
      expect(candidates.length).toBeLessThanOrEqual(CONTRACT_LIMITS.recipes);
      for (const mealType of ALL_MEALS) {
        const forMeal = candidates.filter(({ mealTypes }) => mealTypes.includes(mealType));
        expect(forMeal.length, mealType).toBeGreaterThanOrEqual(MIN_CANDIDATES_PER_MEAL);
      }
    });

    it.each(CLINICAL_CASES.map(({ code }) => code))('%s: el selector manual ofrece lo mismo que la generación si el paciente cocina', (code) => {
      const fromSelector = recipesForPatient(recipes, conditionsOf(code), GROUPS, prohibitedRulesOf(code));
      expect(namesOf(fromSelector)).toEqual(namesOf(candidatesOf(code, recipes, true)));
    });
  });

  // DA-30: un ítem de grupo amplio ("un cereal") no avisa por celiaquía, porque las
  // reglas son por alimento. Desde T54 (DA-40) ese grupo no se le ofrece a la IA.
  describe('C1: grupos amplios en celiaquía (T54)', () => {
    const prohibitedForCeliac = new Set(prohibitedRulesOf('C1').map(({ foodId }) => foodId));
    const groupsWithProhibited = new Set(
      CATALOG_FOODS.filter(({ id }) => prohibitedForCeliac.has(id)).map(({ foodGroupId }) => foodGroupId),
    );

    it('ningún grupo ofrecido tiene en su subárbol un alimento prohibido por celiaquía', () => {
      const offered = allowedOf('C1').groups;

      expect(offered.length).toBeGreaterThan(0);
      const offending = offered.filter(({ id }) => descendantIds(GROUPS, id).some((groupId) => groupsWithProhibited.has(groupId)));
      expect(offending.map(({ name }) => name)).toEqual([]);
      expect(offered.map(({ name }) => name)).not.toContain('Cereales y derivados');
    });

    it('los alimentos aptos de esos grupos se siguen ofreciendo, sin grupo en el contexto', () => {
      const allowed = allowedOf('C1');
      const { context } = buildGenerationContext({
        patient: { cooks: true },
        conditions: [],
        catalog: allowed,
        mealTypes: ALL_MEALS,
      });

      const arroz = context.catalog.foods.find(({ name }) => name === 'Arroz blanco');
      expect(arroz).toBeDefined();
      expect(arroz).not.toHaveProperty('group_code');
      expect(context.catalog.food_groups.map(({ name }) => name)).not.toContain('Cereales y derivados');
    });

    it('sin celiaquía, "Cereales y derivados" se ofrece', () => {
      expect(allowedOf('C6').groups.map(({ name }) => name)).toContain('Cereales y derivados');
    });
  });

  it('la cuenta 2 no ve ninguna receta propia de la cuenta 1', () => {
    const second = new Set(namesOf(SECOND_ACCOUNT_RECIPES));
    expect([...PRIVATE_RECIPES, ...CONTROL_RECIPES].filter(({ name }) => second.has(name))).toEqual([]);
  });

  describe('recetas de control', () => {
    it('la prohibitiva se excluye para hipertensión aunque el paciente cocine, y se ofrece sin esa patología', () => {
      const name = 'Arroz con pollo al caldo';
      expect(namesOf(candidatesOf('C3', RECIPES, true))).not.toContain(name);
      expect(namesOf(candidatesOf('C6'))).toContain(name);
      expect(recipeFindings('C3', name)).toEqual([['pathology_rule', 'blocking']]);
    });

    it.each([
      ['C2', 'Tostadas con mermelada y queso untable'],
      ['C2', 'Merienda casera de pan con leche'],
      ['C3', 'Sándwich de jamón cocido y tomate'],
      ['C3', 'Ensalada de lentejas y tomate con pan'],
    ])('%s: "%s" se sigue ofreciendo y advierte al guardar', (code, name) => {
      expect(namesOf(candidatesOf(code))).toContain(name);
      expect(recipeFindings(code, name)).toEqual([['pathology_rule', 'warning']]);
    });

    it('sin la patología, las de control no generan hallazgos de regla', () => {
      for (const { name } of CONTROL_RECIPES) expect(recipeFindings('C6', name), name).toEqual([]);
    });
  });

  it('una receta con avena sin TACC se ofrece en celiaquía y advierte al guardar (DA-36)', () => {
    const withOats = RECIPES.filter((recipe) => usesFood(recipe, ({ name }) => name === 'Avena sin TACC'));
    expect(withOats.length).toBeGreaterThan(0);
    for (const { name } of withOats) {
      expect(namesOf(candidatesOf('C1')), name).toContain(name);
      expect(recipeFindings('C1', name), name).toEqual([['pathology_rule', 'warning']]);
    }
  });
});
