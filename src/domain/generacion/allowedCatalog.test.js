const { allowedCatalog, exceededLimit, CONTRACT_LIMITS } = require('./allowedCatalog');

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
  food('cebada', 'con-tacc', { active: false }),
];

const ingredient = (foodId) => {
  const { id, name, foodGroupId, active } = FOODS.find((candidate) => candidate.id === foodId);
  return { food: { id, name, foodGroupId, active } };
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
    expect(ids(allowed.groups)).toEqual(['cereales', 'con-tacc']);
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
    expect(ids(allowed.foods)).toContain('arroz');
  });

  it('no ofrece un grupo más amplio que una condición: "Carnes" con rechazo de "Pescados" (DA-40)', () => {
    const conditions = [{ id: 'c-1', type: 'rejection', foodId: null, foodGroupId: 'pescados' }];

    const allowed = run({ conditions });

    expect(ids(allowed.groups)).not.toContain('carnes');
    expect(ids(allowed.groups)).not.toContain('pescados');
    expect(ids(allowed.foods)).toContain('pollo');
    expect(ids(allowed.recipes)).not.toContain('merluza-al-horno');
  });

  it('no ofrece un grupo que contiene un alimento prohibido por regla, aunque la regla sea por alimento ("un cereal" en celiaquía)', () => {
    const prohibitedRules = [{ id: 'r-1', pathologyId: 'celiaquia', foodId: 'trigo', foodGroupId: null }];

    const allowed = run({ prohibitedRules });

    expect(ids(allowed.groups)).not.toContain('cereales');
    expect(ids(allowed.groups)).not.toContain('con-tacc');
    expect(ids(allowed.foods)).toContain('arroz');
  });

  it('una regla a moderar saca los grupos que contienen su alimento, pero no el alimento ni sus recetas (DA-43)', () => {
    const moderatedRules = [{ id: 'r-1', pathologyId: 'hipertension', foodId: 'merluza', foodGroupId: null }];

    const allowed = run({ moderatedRules });

    expect(ids(allowed.groups)).toEqual(['frutas', 'cereales', 'con-tacc']);
    expect(ids(allowed.foods)).toEqual(ids(run().foods));
    expect(ids(allowed.recipes)).toEqual(ids(run().recipes));
  });

  it('una regla a moderar por grupo saca ese grupo y los que lo contienen, y deja los grupos hermanos (DA-43)', () => {
    const moderatedRules = [{ id: 'r-1', pathologyId: 'hipertension', foodId: null, foodGroupId: 'con-tacc' }];

    const allowed = run({ moderatedRules });

    expect(ids(allowed.groups)).toEqual(['carnes', 'pescados', 'frutas']);
    expect(ids(allowed.foods)).toContain('trigo');
  });

  it('un alimento comprendido dado de baja también saca su grupo y los que lo contienen', () => {
    const conditions = [{ id: 'c-1', type: 'allergy', foodId: 'cebada', foodGroupId: null }];

    const allowed = run({ conditions });

    expect(ids(allowed.groups)).not.toContain('con-tacc');
    expect(ids(allowed.groups)).not.toContain('cereales');
    expect(ids(allowed.foods)).toEqual(expect.arrayContaining(['arroz', 'trigo']));
  });

  it('una alergia a un alimento saca su grupo, y los demás grupos se siguen ofreciendo', () => {
    const conditions = [{ id: 'c-1', type: 'allergy', foodId: 'banana', foodGroupId: null }];

    const allowed = run({ conditions });

    expect(ids(allowed.groups)).toEqual(['carnes', 'pescados', 'cereales', 'con-tacc']);
    expect(ids(allowed.foods)).toContain('manzana');
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

  it('no ofrece una receta con un ingrediente dado de baja', () => {
    const recipes = [...RECIPES, recipe('compota-de-pera', ['pera', 'manzana'])];

    expect(ids(run({ recipes }).recipes)).not.toContain('compota-de-pera');
  });

  it('exceededLimit informa el tope pasado sin lanzar, y null si el catálogo entra', () => {
    const many = Array.from({ length: CONTRACT_LIMITS.recipes + 1 }, (_, index) => recipe(`r-${index}`, ['arroz']));

    const allowed = run({ recipes: many });

    expect(allowed.recipes).toHaveLength(CONTRACT_LIMITS.recipes + 1);
    expect(exceededLimit(allowed)).toEqual({ kind: 'recipes', count: CONTRACT_LIMITS.recipes + 1, limit: CONTRACT_LIMITS.recipes });
    expect(exceededLimit(run())).toBeNull();
  });
});
