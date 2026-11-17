const { descendantIds } = require('../src/utils/foodGroupTree');
const { itemCategories } = require('../src/domain/reglas/itemCategories');

// Cumplimiento de las pautas de adecuación nutricional (T57) en una propuesta,
// para measure-generation (T58). Es la traducción a código de
// docs/pautas-de-adecuacion.md (repo raíz): cada pauta PA-* con su nivel, sus
// comidas y su indicador, y los criterios de medición CM-01 a CM-10. Si cambia
// el documento, cambia esto. Las pautas no generan hallazgos ni llegan al editor
// (DA-41): solo se miden. Fundamento en
// docs/decisiones/evaluadores-de-validez-de-la-generacion.md.
//
// Cada indicador es { num, den }: una bandera por plan vale { 0|1, 1 }, un
// porcentaje de opciones o de alimentos vale { cumplen, total }, y "cuántos de 8"
// vale { presentes, 8 }. Así se suman entre propuestas y el cociente da, según el
// caso, el % de propuestas que cumplen, el % agrupado de opciones o la cobertura
// media. Un denominador 0 significa que no hubo nada que medir.

const MAIN_MEALS = ['lunch', 'dinner'];
const LIGHT_MEALS = ['breakfast', 'afternoon_snack'];
const ALL_MEALS = ['breakfast', 'lunch', 'afternoon_snack', 'dinner'];
const MEAL_LABELS = { breakfast: 'desayuno', lunch: 'almuerzo', afternoon_snack: 'merienda', dinner: 'cena' };

const MEAT_GROUPS = ['Carnes', 'Aves', 'Pescados', 'Mariscos'];
const VEGETABLE_GROUPS = ['Verduras de hoja', 'Hortalizas de fruto', 'Bulbos, raíces y tallos', 'Coles, flores y hongos'];

// CM-04: integral. Los salvados son un agregado, no una porción de cereal: salen
// del denominador. Cebada perlada y Granola quedan como no integrales.
const WHOLE_GRAINS = [
  'Pan integral',
  'Pan lactal integral',
  'Pan de salvado',
  'Harina integral',
  'Fideos integrales',
  'Arroz integral',
  'Avena arrollada',
  'Avena sin TACC',
  'Trigo burgol',
  'Quinoa',
  'Amaranto',
  'Galletitas integrales',
  'Galletitas de salvado',
];
const NOT_A_CEREAL_PORTION = ['Salvado de avena', 'Salvado de trigo'];
// CM-05: descremado o magro.
const LOW_FAT_DAIRY = [
  'Leche descremada',
  'Leche parcialmente descremada',
  'Yogur descremado',
  'Queso untable descremado',
  'Ricota',
  'Ricota descremada',
];
// CM-06: cortes magros de carnes rojas (el subgrupo Carnes).
const LEAN_CUTS = ['Carne vacuna magra', 'Carne picada magra', 'Lomo de cerdo', 'Hígado vacuno'];
// PA-CEL-02: cereales y harinas sin gluten de la lista (V).
const GLUTEN_FREE_CEREALS = [
  'Arroz blanco',
  'Arroz integral',
  'Arroz parboil',
  'Harina de maíz (polenta)',
  'Quinoa',
  'Amaranto',
  'Harina de arroz',
  'Almidón de maíz',
  'Fécula de mandioca',
  'Pan sin TACC',
  'Premezcla sin TACC',
  'Fideos sin TACC',
  'Fideos de arroz',
  'Galletitas sin TACC',
  'Tostadas de arroz',
  'Copos de maíz sin TACC',
];

// Qué cuenta para cada componente de una pauta (CM-02). groups: el ítem cuenta
// si un alimento suyo (o un ingrediente de la receta) está en el subárbol de uno
// de esos grupos, o si es un ítem de grupo comprendido en uno de ellos (un grupo
// más amplio no cuenta). foods: por nombre; un ítem de grupo nunca los asegura.
// exclude: los condimentos de CM-10, que no cuentan como porción.
const MATCHERS = {
  vegetable: { groups: VEGETABLE_GROUPS, exclude: ['Ajo'] },
  vegetables: { groups: ['Verduras'], exclude: ['Ajo'] },
  fresh_fruit: { groups: ['Frutas frescas'], exclude: ['Limón'] },
  fruits: { groups: ['Frutas'], exclude: ['Limón'] },
  legumes: { groups: ['Legumbres'] },
  cereals: { groups: ['Cereales y derivados'] },
  dairy: { groups: ['Lácteos'], exclude: ['Queso rallado'] },
  eggs: { groups: ['Huevos'] },
  meats: { groups: MEAT_GROUPS },
  meats_or_eggs: { groups: [...MEAT_GROUPS, 'Huevos'] },
  oils: { groups: ['Aceites'] },
  fish: { groups: ['Pescados'] },
  nuts_seeds: { groups: ['Frutos secos y semillas'] },
  tubers: { groups: ['Tubérculos y choclo'] },
  plate_protein: { groups: [...MEAT_GROUPS, 'Huevos', 'Quesos'], exclude: ['Queso rallado'] },
  complex_carb: { groups: ['Legumbres', 'Cereales y derivados', 'Tubérculos y choclo'] },
  dinner_carb: { groups: ['Cereales y derivados', 'Legumbres', 'Tubérculos y choclo'] },
  healthy_fat: { groups: ['Aceites', 'Frutas oleosas', 'Frutos secos y semillas'] },
  sugars: { groups: ['Azúcares y edulcorantes'] },
  sweetener: { foods: ['Edulcorante'] },
  oily_fish: { foods: ['Caballa', 'Salmón', 'Atún al natural', 'Atún en aceite', 'Sardinas en lata'] },
  olive_oil: { foods: ['Aceite de oliva'] },
  // PA-HTA-02: Limón y Ajo sí cuentan (CM-10).
  salt_substitutes: {
    foods: [
      'Limón',
      'Vinagre',
      'Cebolla',
      'Cebolla de verdeo',
      'Puerro',
      'Ajo',
      'Orégano',
      'Perejil',
      'Laurel',
      'Pimentón',
      'Ají molido',
      'Pimienta',
      'Comino',
      'Nuez moscada',
      'Albahaca',
    ],
  },
  gluten_free_cereals: { foods: GLUTEN_FREE_CEREALS },
  gluten_free_carb: { foods: [...GLUTEN_FREE_CEREALS, 'Papa', 'Batata', 'Mandioca', 'Choclo'], groups: ['Legumbres'] },
  red_meat: { groups: ['Carnes'] },
  // PA-OBE-07 (V).
  optional_foods: {
    groups: ['Fiambres y embutidos'],
    foods: [
      'Galletitas dulces simples',
      'Bizcochos de grasa',
      'Hígado vacuno',
      'Hígado de pollo',
      'Manteca',
      'Margarina',
      'Dulce de leche',
      'Mermelada',
      'Mermelada reducida en azúcar',
      'Mayonesa',
      'Kétchup',
      'Mostaza',
      'Salsa de soja',
    ],
  },
};

// Las 8 de PA-GEN-02 y PA-CEL-01 (en celiaquía, el cereal es solo el sin gluten).
const ALL_GROUPS = ['vegetable', 'fruits', 'legumes', 'cereals', 'dairy', 'eggs', 'meats', 'oils'];
const ALL_GROUPS_GLUTEN_FREE = ALL_GROUPS.map((key) => (key === 'cereals' ? 'gluten_free_cereals' : key));
// Las 7 de PA-OBE-01.
const FRESH_FOOD_GROUPS = ['vegetables', 'fruits', 'legumes', 'nuts_seeds', 'eggs', 'fish', 'oils'];

// CM-07 y CM-08: a quién se aplica cada clave. Desde T61 el objetivo tiene una
// categoría: las OBE se aplican con lose_weight. Un paciente sin categoría cae al
// criterio de T58: "bajar de peso" en el texto (V).
const goalCategoryFor = (goal) => (/bajar de peso/i.test(goal ?? '') ? 'lose_weight' : 'other');

const APPLIES = {
  GEN: () => true,
  DM2: ({ pathologies }) => pathologies.includes('Diabetes'),
  HTA: ({ pathologies }) => pathologies.includes('Hipertensión'),
  CEL: ({ pathologies }) => pathologies.includes('Celiaquía'),
  OBE: ({ goal, goalCategory }) => (goalCategory ?? goalCategoryFor(goal)) === 'lose_weight',
};

const flag = (value) => ({ num: value ? 1 : 0, den: 1 });
const ratio = (num, den) => ({ num, den });

// Las pautas, en el orden del documento. evaluate recibe las herramientas de
// medición (ver createGuidelineEvaluator) y devuelve { main, indicators } o
// { sameAs } si la pauta adopta otras con el mismo indicador.
const GUIDELINES = [
  {
    id: 'PA-GEN-01',
    level: 'plan',
    evaluate: ({ mealsWithOptions }) => ({ main: flag(ALL_MEALS.every((meal) => mealsWithOptions.has(meal))) }),
  },
  {
    id: 'PA-GEN-02',
    level: 'plan',
    evaluate: ({ coverage }) => {
      const present = coverage(ALL_GROUPS);
      return { main: flag(present === ALL_GROUPS.length), indicators: { grupos: ratio(present, ALL_GROUPS.length) } };
    },
  },
  {
    id: 'PA-GEN-03',
    level: 'option',
    evaluate: ({ optionRatio }) => ({ main: optionRatio(MAIN_MEALS, (option) => option.has('vegetable')) }),
  },
  {
    id: 'PA-GEN-04',
    level: 'plan',
    evaluate: ({ inPlan, mealsWith, mealsWithOptions }) => ({
      main: flag(inPlan('fresh_fruit')),
      indicators: { comidas: ratio(mealsWith('fresh_fruit'), mealsWithOptions.size) },
    }),
  },
  {
    id: 'PA-GEN-05',
    level: 'plan',
    evaluate: ({ inPlan, foodRatio }) => ({
      main: flag(inPlan('dairy')),
      indicators: { descremados: foodRatio(ALL_MEALS, 'dairy', LOW_FAT_DAIRY) },
    }),
  },
  {
    id: 'PA-GEN-06',
    level: 'plan',
    evaluate: ({ inPlan }) => ({ indicators: { pescado: flag(inPlan('fish')), huevo: flag(inPlan('eggs')) } }),
  },
  {
    id: 'PA-GEN-07',
    level: 'plan',
    evaluate: ({ inPlan, wholeGrainRatio }) => ({
      indicators: { legumbres: flag(inPlan('legumes')), integrales: wholeGrainRatio(ALL_MEALS) },
    }),
  },
  {
    id: 'PA-GEN-08',
    level: 'plan',
    evaluate: ({ inPlan }) => ({ main: flag(inPlan('oils') || inPlan('nuts_seeds')) }),
  },
  {
    id: 'PA-GEN-09',
    level: 'option',
    evaluate: ({ optionRatio }) => ({
      main: optionRatio(
        LIGHT_MEALS,
        (option) => ['fruits', 'cereals', 'dairy', 'nuts_seeds'].filter((key) => option.has(key)).length >= 2,
      ),
    }),
  },
  {
    id: 'PA-GEN-10',
    level: 'option',
    evaluate: ({ optionRatio }) => ({
      main: optionRatio(
        MAIN_MEALS,
        (option) => option.has('vegetable') || option.has('legumes') || option.has('meats_or_eggs'),
        (option) => option.has('cereals'),
      ),
    }),
  },
  {
    // Descriptivo: un indicador por componente del día de ejemplo de MAN.
    id: 'PA-GEN-11',
    level: 'option',
    evaluate: ({ optionRatio }) => {
      const components = {
        breakfast: { lácteos: 'dairy', fruta: 'fresh_fruit', cereal: 'cereals' },
        lunch: { verduras: 'vegetable', aceite: 'oils', 'carne o huevo': 'meats_or_eggs', fruta: 'fresh_fruit' },
        afternoon_snack: { lácteos: 'dairy', cereal: 'cereals', 'frutos secos': 'nuts_seeds' },
        dinner: { verduras: 'vegetable', 'cereal, legumbre o tubérculo': 'dinner_carb', aceite: 'oils', fruta: 'fresh_fruit' },
      };
      const indicators = {};
      for (const [meal, keys] of Object.entries(components)) {
        for (const [label, key] of Object.entries(keys)) {
          indicators[`${MEAL_LABELS[meal]}: ${label}`] = optionRatio([meal], (option) => option.has(key));
        }
      }
      return { indicators };
    },
  },
  {
    id: 'PA-DM2-01',
    level: 'option',
    evaluate: ({ optionRatio }) => {
      const components = {
        vegetal: 'vegetable',
        proteína: 'plate_protein',
        'hidrato complejo': 'complex_carb',
        fruta: 'fresh_fruit',
        'grasa saludable': 'healthy_fat',
      };
      const indicators = {};
      for (const [label, key] of Object.entries(components)) {
        indicators[label] = optionRatio(MAIN_MEALS, (option) => option.has(key));
      }
      const all = (option) => Object.values(components).every((key) => option.has(key));
      return { main: optionRatio(MAIN_MEALS, all), indicators };
    },
  },
  {
    id: 'PA-DM2-02',
    level: 'option',
    evaluate: ({ optionRatio }) => {
      const hasCarb = (option) => option.categories.has('carbohydrate') || option.has('fresh_fruit');
      const indicators = Object.fromEntries(ALL_MEALS.map((meal) => [MEAL_LABELS[meal], optionRatio([meal], hasCarb)]));
      return { main: optionRatio(ALL_MEALS, hasCarb), indicators };
    },
  },
  {
    id: 'PA-DM2-03',
    level: 'option',
    evaluate: ({ optionRatio }) => ({
      main: optionRatio(
        LIGHT_MEALS,
        (option) => option.categories.has('protein'),
        (option) => option.categories.has('carbohydrate'),
      ),
    }),
  },
  {
    id: 'PA-DM2-04',
    level: 'plan',
    evaluate: ({ inPlan, wholeGrainRatio }) => ({
      indicators: { legumbres: flag(inPlan('legumes')), integrales: wholeGrainRatio(ALL_MEALS) },
    }),
  },
  {
    id: 'PA-DM2-05',
    level: 'plan',
    evaluate: ({ inPlan }) => ({
      indicators: { 'pescado graso': flag(inPlan('oily_fish')), 'aceite de oliva': flag(inPlan('olive_oil')) },
    }),
  },
  {
    id: 'PA-DM2-06',
    level: 'option',
    evaluate: ({ optionRatio }) => ({
      main: optionRatio(
        ALL_MEALS,
        (option) => option.itemsMatching('sugars').every((item) => option.itemIs(item, 'sweetener')),
        (option) => option.has('sugars'),
      ),
    }),
  },
  { id: 'PA-HTA-01', level: 'plan', evaluate: () => ({ sameAs: ['PA-GEN-02', 'PA-GEN-04', 'PA-GEN-05', 'PA-GEN-06', 'PA-GEN-07', 'PA-GEN-08'] }) },
  {
    id: 'PA-HTA-02',
    level: 'plan',
    evaluate: ({ inPlan, optionRatio }) => ({
      main: flag(inPlan('salt_substitutes')),
      indicators: { 'almuerzo y cena': optionRatio(MAIN_MEALS, (option) => option.has('salt_substitutes')) },
    }),
  },
  {
    id: 'PA-CEL-01',
    level: 'plan',
    evaluate: ({ coverage }) => {
      const present = coverage(ALL_GROUPS_GLUTEN_FREE);
      return { main: flag(present === ALL_GROUPS.length), indicators: { grupos: ratio(present, ALL_GROUPS.length) } };
    },
  },
  {
    id: 'PA-CEL-02',
    level: 'option',
    evaluate: ({ optionRatio }) => ({ main: optionRatio(ALL_MEALS, (option) => option.has('gluten_free_carb')) }),
  },
  {
    id: 'PA-OBE-01',
    level: 'plan',
    evaluate: ({ coverage, wholeGrainRatio }) => ({
      main: ratio(coverage(FRESH_FOOD_GROUPS), FRESH_FOOD_GROUPS.length),
      indicators: { integrales: wholeGrainRatio(ALL_MEALS) },
    }),
  },
  {
    // Cumple con al menos 3 de cada 4 carnes rojas en cortes magros, o sin carnes
    // rojas (DA-42).
    id: 'PA-OBE-02',
    level: 'option',
    evaluate: ({ optionRatio, foodRatio }) => {
      const lean = foodRatio(MAIN_MEALS, 'red_meat', LEAN_CUTS);
      return {
        main: flag(lean.den === 0 || lean.num / lean.den >= 0.75),
        indicators: {
          'con carnes rojas': optionRatio(
            MAIN_MEALS,
            (option) => option.has('red_meat'),
            (option) => option.categories.has('protein'),
          ),
          'cortes magros': lean,
        },
      };
    },
  },
  { id: 'PA-OBE-03', level: 'plan', evaluate: () => ({ sameAs: ['PA-GEN-01'] }) },
  {
    id: 'PA-OBE-04',
    level: 'option',
    evaluate: ({ optionRatio }) => ({
      main: optionRatio(
        MAIN_MEALS,
        ({ categories }) => categories.has('vegetable') && (categories.has('protein') || categories.has('carbohydrate')),
      ),
    }),
  },
  {
    // El aceite se informa, pero no entra en el cumplimiento ("se puede").
    id: 'PA-OBE-05',
    level: 'option',
    evaluate: ({ optionRatio, wholeGrainRatio }) => {
      const components = { vegetal: 'vegetable', proteína: 'plate_protein', 'hidrato complejo': 'complex_carb', fruta: 'fresh_fruit' };
      const indicators = {};
      for (const [label, key] of Object.entries(components)) {
        indicators[label] = optionRatio(MAIN_MEALS, (option) => option.has(key));
      }
      indicators.aceite = optionRatio(MAIN_MEALS, (option) => option.has('oils'));
      indicators.integrales = wholeGrainRatio(MAIN_MEALS);
      const all = (option) => Object.values(components).every((key) => option.has(key));
      return { main: optionRatio(MAIN_MEALS, all), indicators };
    },
  },
  {
    id: 'PA-OBE-06',
    level: 'option',
    evaluate: ({ optionRatio, foodRatio }) => {
      const components = { lácteo: 'dairy', fruta: 'fresh_fruit', cereal: 'cereals' };
      const indicators = {};
      for (const [label, key] of Object.entries(components)) {
        indicators[label] = optionRatio(LIGHT_MEALS, (option) => option.has(key));
      }
      indicators['integrales o copos sin azúcar'] = foodRatio(
        LIGHT_MEALS,
        'cereals',
        [...WHOLE_GRAINS, 'Copos de maíz sin azúcar', 'Copos de maíz sin TACC'],
        NOT_A_CEREAL_PORTION,
      );
      const all = (option) => Object.values(components).every((key) => option.has(key));
      return { main: optionRatio(LIGHT_MEALS, all), indicators };
    },
  },
  {
    // Lo único que mide lo que conviene dejar afuera: cumple con 0 %. Cuenta
    // también los ítems con hallazgo bloqueante, porque están en el plan.
    id: 'PA-OBE-07',
    level: 'option',
    evaluate: ({ optionRatio }) => {
      const withOptional = optionRatio(ALL_MEALS, (option) => option.hasAny('optional_foods'));
      return { main: flag(withOptional.num === 0), indicators: { 'con consumo opcional': withOptional } };
    },
  },
];

const GUIDELINE_IDS = GUIDELINES.map(({ id }) => id);
const sourceOf = (id) => id.split('-')[1];

// Prepara la evaluación para un catálogo indexado (indexCatalog: foods, groups
// con nombre, food(id), recipe(id)). Resuelve los grupos y alimentos de las
// pautas por nombre una sola vez, y falla si alguno no está: un nombre que no
// coincide dejaría la pauta en 0 % sin avisar.
function createGuidelineEvaluator(catalog) {
  const groupIdByName = new Map(catalog.groups.map((group) => [group.name, group.id]));
  const foodNames = new Set(catalog.foods.map(({ name }) => name));
  const missing = [];
  const compiled = {};
  for (const [key, { groups = [], foods = [], exclude = [] }] of Object.entries(MATCHERS)) {
    const groupIds = new Set();
    for (const name of groups) {
      if (!groupIdByName.has(name)) missing.push(`grupo ${name}`);
      else for (const id of descendantIds(catalog.groups, groupIdByName.get(name))) groupIds.add(id);
    }
    for (const name of [...foods, ...exclude]) if (!foodNames.has(name)) missing.push(`alimento ${name}`);
    compiled[key] = { groupIds, foods: new Set(foods), exclude: new Set(exclude) };
  }
  for (const name of [...WHOLE_GRAINS, ...NOT_A_CEREAL_PORTION, ...LOW_FAT_DAIRY, ...LEAN_CUTS]) {
    if (!foodNames.has(name)) missing.push(`alimento ${name}`);
  }
  if (missing.length > 0) {
    throw new Error(`Pautas de adecuación: no están en el catálogo ${[...new Set(missing)].join(', ')}`);
  }

  // Los alimentos que representa un ítem: el suyo o los ingredientes de la
  // receta. Un ítem de grupo o no reconocido no representa ninguno.
  function itemFoods(item) {
    if (item.type === 'food') return [catalog.food(item.foodId)];
    if (item.type === 'recipe') return catalog.recipe(item.recipeId).ingredients.map(({ food }) => catalog.food(food.id));
    return [];
  }

  function itemIs(item, key) {
    const { groupIds, foods, exclude } = compiled[key];
    if (item.type === 'food_group') return groupIds.has(item.foodGroupId);
    return itemFoods(item).some(
      (food) => !exclude.has(food.name) && (foods.has(food.name) || groupIds.has(food.foodGroupId)),
    );
  }

  // blockingItemIds: los ítems con un hallazgo bloqueante, que no cuentan para
  // ninguna pauta (CM-03). pathologies: nombres de las patologías del paciente
  // (CM-07). goal y goalCategory: su objetivo, en texto y por categoría (CM-08, T61).
  function evaluate(plan, { blockingItemIds = new Set(), pathologies = [], goal = null, goalCategory = null } = {}) {
    const options = plan.meals.flatMap(({ mealType, options: mealOptions }) =>
      mealOptions
        .filter(({ items }) => items.length > 0)
        .map(({ items: allItems }) => {
          const items = allItems.filter((item) => !blockingItemIds.has(item.id));
          return {
            mealType,
            items,
            categories: new Set(items.flatMap((item) => itemCategories(item, catalog))),
            has: (key) => items.some((item) => itemIs(item, key)),
            hasAny: (key) => allItems.some((item) => itemIs(item, key)),
            itemsMatching: (key) => items.filter((item) => itemIs(item, key)),
            itemIs,
          };
        }),
    );
    const inMeals = (meals) => options.filter(({ mealType }) => meals.includes(mealType));

    const tools = {
      mealsWithOptions: new Set(options.map(({ mealType }) => mealType)),
      inPlan: (key) => options.some((option) => option.has(key)),
      coverage: (keys) => keys.filter((key) => options.some((option) => option.has(key))).length,
      mealsWith: (key) => new Set(options.filter((option) => option.has(key)).map(({ mealType }) => mealType)).size,
      // Opciones de esas comidas que cumplen, entre las que entran en el
      // denominador (todas, o las que cumplen la condición previa).
      optionRatio(meals, predicate, eligible = () => true) {
        const pool = inMeals(meals).filter(eligible);
        return ratio(pool.filter(predicate).length, pool.length);
      },
      // Alimentos del componente (ítems de alimento e ingredientes de receta) que
      // están en la lista. Un ítem de grupo queda sin determinar (CM-05).
      foodRatio(meals, key, names, notCounted = []) {
        const { groupIds, foods, exclude } = compiled[key];
        const pool = inMeals(meals)
          .flatMap(({ items }) => items.flatMap(itemFoods))
          .filter((food) => !exclude.has(food.name) && !notCounted.includes(food.name))
          .filter((food) => foods.has(food.name) || groupIds.has(food.foodGroupId));
        return ratio(pool.filter((food) => names.includes(food.name)).length, pool.length);
      },
      wholeGrainRatio: (meals) => tools.foodRatio(meals, 'cereals', WHOLE_GRAINS, NOT_A_CEREAL_PORTION),
    };

    const patient = { pathologies, goal, goalCategory };
    const results = {};
    for (const guideline of GUIDELINES) {
      if (!APPLIES[sourceOf(guideline.id)](patient)) continue;
      results[guideline.id] = { level: guideline.level, ...guideline.evaluate(tools) };
    }
    return results;
  }

  return { evaluate };
}

// Suma los resultados de varias propuestas, pauta por pauta e indicador por
// indicador. Una pauta que no se aplicó a una propuesta no suma.
function sumGuidelines(resultsList) {
  const add = (target = { num: 0, den: 0 }, { num, den }) => ({ num: target.num + num, den: target.den + den });
  const totals = {};
  for (const results of resultsList) {
    for (const [id, { level, main, indicators, sameAs }] of Object.entries(results)) {
      const total = (totals[id] ??= { level, plans: 0, ...(sameAs ? { sameAs } : {}) });
      total.plans += 1;
      if (main) total.main = add(total.main, main);
      for (const [name, value] of Object.entries(indicators ?? {})) {
        total.indicators ??= {};
        total.indicators[name] = add(total.indicators[name], value);
      }
    }
  }
  return totals;
}

module.exports = { GUIDELINE_IDS, MATCHERS, createGuidelineEvaluator, sumGuidelines, goalCategoryFor };
