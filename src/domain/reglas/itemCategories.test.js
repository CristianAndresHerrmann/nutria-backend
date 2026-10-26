const { indexCatalog } = require('./catalogIndex');
const { itemCategories } = require('./itemCategories');

const GROUPS = [
  { id: 'carnes', parentId: null },
  { id: 'pescados', parentId: 'carnes' },
  { id: 'frutas', parentId: null },
  { id: 'cereales', parentId: null },
  { id: 'lacteos', parentId: null },
  { id: 'vacio', parentId: null },
];

const food = (id, foodGroupId, categories, active = true) => ({
  id,
  name: id,
  foodGroupId,
  active,
  categories: categories.map((category) => ({ category })),
});

const FOODS = [
  food('pollo', 'carnes', ['protein']),
  food('atun', 'pescados', ['protein', 'healthy_fat']),
  food('manzana', 'frutas', ['fiber']),
  food('banana', 'frutas', ['carbohydrate', 'fiber']),
  food('fruta-de-baja', 'frutas', ['carbohydrate'], false),
  food('avena', 'cereales', ['carbohydrate', 'fiber']),
  food('leche', 'lacteos', ['protein']),
];

const RECIPES = [
  { id: 'avena-con-leche', name: 'Avena con leche', ingredients: [{ food: { id: 'avena' } }, { food: { id: 'leche' } }] },
];

const CATALOG = indexCatalog({ foods: FOODS, groups: GROUPS, recipes: RECIPES });

const sorted = (categories) => [...categories].sort();

describe('itemCategories (RF-44, DA-30)', () => {
  it('alimento: la copia del ítem (DA-16), no el catálogo actual', () => {
    const item = { type: 'food', foodId: 'atun', foodCategories: ['protein'] };

    expect(itemCategories(item, CATALOG)).toEqual(['protein']);
  });

  it('receta: la unión de las categorías de sus ingredientes', () => {
    const item = { type: 'recipe', recipeId: 'avena-con-leche' };

    expect(sorted(itemCategories(item, CATALOG))).toEqual(['carbohydrate', 'fiber', 'protein']);
  });

  it('grupo: las que comparten todos sus alimentos vigentes', () => {
    const item = { type: 'food_group', foodGroupId: 'frutas' };

    // La fruta dada de baja (solo carbohydrate) no cuenta.
    expect(itemCategories(item, CATALOG)).toEqual(['fiber']);
  });

  it('grupo: incluye los alimentos de los subgrupos', () => {
    const item = { type: 'food_group', foodGroupId: 'carnes' };

    expect(itemCategories(item, CATALOG)).toEqual(['protein']);
  });

  it('grupo sin alimentos vigentes: ninguna', () => {
    expect(itemCategories({ type: 'food_group', foodGroupId: 'vacio' }, CATALOG)).toEqual([]);
  });

  it('no reconocido: ninguna', () => {
    expect(itemCategories({ type: 'unrecognized', originalText: 'pan de algas' }, CATALOG)).toEqual([]);
  });
});
