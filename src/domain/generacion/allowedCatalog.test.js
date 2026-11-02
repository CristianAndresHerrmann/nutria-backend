const { allowedCatalog, CONTRACT_LIMITS } = require('./allowedCatalog');

// Jerarquía: Carnes > Pescados; Frutas; Cereales > Con TACC.
const GROUPS = [
  { id: 'carnes', name: 'Carnes', parentId: null },
  { id: 'pescados', name: 'Pescados', parentId: 'carnes' },
  { id: 'frutas', name: 'Frutas', parentId: null },
  { id: 'cereales', name: 'Cereales', parentId: null },
  { id: 'con-tacc', name: 'Con TACC', parentId: 'cereales' },
  { id: 'vacio', name: 'Grupo sin alimentos', parentId: null },
];

const food = (id, foodGroupId, extra = {}) => ({ id, name: id, foodGroupId, active: true, categories: [], ...extra });

const FOODS = [
  food('pollo', 'carnes'),
  food('merluza', 'pescados'),
  food('banana', 'frutas'),
  food('manzana', 'frutas'),
  food('arroz', 'cereales'),
  food('trigo', 'con-tacc'),
  food('pera', 'frutas', { active: false }),
];

const ingredient = (foodId) => {
  const { id, name, foodGroupId } = FOODS.find((candidate) => candidate.id === foodId);
  return { food: { id, name, foodGroupId } };
};

const recipe = (id, ingredients, extra = {}) => ({
  id,
  name: id,
  availableInCatalog: true,
  cookingMethod: 'stovetop',
  mealTypes: [{ mealType: 'lunch' }, { mealType: 'dinner' }],
  ingredients: ingredients.map(ingredient),
  ...extra,
});

const RECIPES = [
  recipe('arroz-con-pollo', ['arroz', 'pollo']),
  recipe('merluza-al-horno', ['merluza'], { cookingMethod: 'oven' }),
  recipe('ensalada-de-frutas', ['banana', 'manzana'], { cookingMethod: 'no_cooking', mealTypes: [{ mealType: 'breakfast' }] }),
  recipe('de-baja', ['arroz'], { availableInCatalog: false }),
];

function run(overrides = {}) {
  return allowedCatalog({
    foods: FOODS,
    groups: GROUPS,
    recipes: RECIPES,
    conditions: [],
    prohibitedRules: [],
    mealTypes: ['breakfast', 'lunch', 'afternoon_snack', 'dinner'],
    cooks: true,
    ...overrides,
  });
}

const ids = (list) => list.map(({ id }) => id);

describe('allowedCatalog — catálogo que se ofrece a la IA (RF-37, RF-38)', () => {
  it('sin condiciones ofrece los alimentos vigentes y los grupos que tienen alguno', () => {
    const allowed = run();

    expect(ids(allowed.foods)).toEqual(['pollo', 'merluza', 'banana', 'manzana', 'arroz', 'trigo']);
    expect(ids(allowed.groups)).toEqual(['carnes', 'pescados', 'frutas', 'cereales', 'con-tacc']);
  });

  it('excluye lo comprendido en una alergia, intolerancia o rechazo, por alimento o por grupo con sus subgrupos', () => {
    const conditions = [
      { id: 'c-1', type: 'allergy', foodId: 'banana', foodGroupId: null },
      { id: 'c-2', type: 'rejection', foodId: null, foodGroupId: 'carnes' },
    ];

    const allowed = run({ conditions });

    expect(ids(allowed.foods)).toEqual(['manzana', 'arroz', 'trigo']);
    expect(ids(allowed.groups)).toEqual(['frutas', 'cereales', 'con-tacc']);
    expect(ids(allowed.recipes)).toEqual([]);
  });

  it('una preferencia o una patología sin reglas no excluyen nada', () => {
    const conditions = [
      { id: 'c-1', type: 'preference', foodId: 'pollo', foodGroupId: null },
      { id: 'c-2', type: 'pathology', pathologyId: 'celiaquia', foodId: null, foodGroupId: null },
    ];

    expect(ids(run({ conditions }).foods)).toEqual(ids(run().foods));
  });

  it('excluye lo que prohíbe una regla de patología, alimentos y recetas con esos ingredientes', () => {
    const prohibitedRules = [{ id: 'r-1', pathologyId: 'celiaquia', foodId: null, foodGroupId: 'con-tacc' }];

    const allowed = run({ prohibitedRules });

    expect(ids(allowed.foods)).not.toContain('trigo');
    expect(ids(allowed.groups)).not.toContain('con-tacc');
    expect(ids(allowed.groups)).toContain('cereales');
  });

  it('un grupo más amplio que la condición se sigue ofreciendo, sin el subgrupo excluido (DA-30)', () => {
    const conditions = [{ id: 'c-1', type: 'rejection', foodId: null, foodGroupId: 'pescados' }];

    const allowed = run({ conditions });

    expect(ids(allowed.groups)).toContain('carnes');
    expect(ids(allowed.groups)).not.toContain('pescados');
    expect(ids(allowed.recipes)).not.toContain('merluza-al-horno');
  });

  it('el grupo de cada alimento ofrecido está siempre entre los grupos ofrecidos', () => {
    const conditions = [{ id: 'c-1', type: 'allergy', foodId: 'pollo', foodGroupId: null }];

    const allowed = run({ conditions });
    const groupIds = new Set(ids(allowed.groups));

    expect(allowed.foods.every(({ foodGroupId }) => groupIds.has(foodGroupId))).toBe(true);
  });

  it('las recetas: disponibles, sin ingredientes comprendidos y con los tipos de comida pedidos', () => {
    const conditions = [{ id: 'c-1', type: 'intolerance', foodId: 'merluza', foodGroupId: null }];

    const allowed = run({ conditions, mealTypes: ['lunch'] });

    expect(ids(allowed.recipes)).toEqual(['arroz-con-pollo']);
    expect(allowed.recipes[0].mealTypes).toEqual(['lunch']);
  });

  it('si el paciente no cocina, solo ofrece recetas sin cocción (RF-38)', () => {
    expect(ids(run({ cooks: false }).recipes)).toEqual(['ensalada-de-frutas']);
  });

  it('si no se sabe si el paciente cocina, no filtra por cocción', () => {
    expect(ids(run({ cooks: null }).recipes)).toEqual(ids(run().recipes));
  });

  it('corta con un error si el catálogo supera un tope del contrato', () => {
    const many = Array.from({ length: CONTRACT_LIMITS.recipes + 1 }, (_, index) => recipe(`r-${index}`, ['arroz']));

    expect(() => run({ recipes: many })).toThrow(/recipes/);
  });
});
