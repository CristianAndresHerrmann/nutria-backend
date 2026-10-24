const { excludeRecipesForConditions } = require('./recipeConditionFilter');

const GROUPS = [
  { id: 'carnes', parentId: null },
  { id: 'pescados', parentId: 'carnes' },
  { id: 'mariscos', parentId: 'pescados' },
  { id: 'lacteos', parentId: null },
  { id: 'cereales', parentId: null },
];

const food = (id, foodGroupId) => ({ food: { id, foodGroupId } });

const RECIPES = [
  { name: 'Ensalada de atún', ingredients: [food('arroz', 'cereales'), food('atun', 'pescados')] },
  { name: 'Arroz con langostinos', ingredients: [food('arroz', 'cereales'), food('langostino', 'mariscos')] },
  { name: 'Avena con leche', ingredients: [food('avena', 'cereales'), food('leche', 'lacteos')] },
  { name: 'Arroz blanco', ingredients: [food('arroz', 'cereales')] },
];

const names = (recipes) => recipes.map((recipe) => recipe.name);

describe('excludeRecipesForConditions (RF-28)', () => {
  it('un paciente sin condiciones ve todas las recetas', () => {
    expect(excludeRecipesForConditions(RECIPES, [], GROUPS)).toEqual(RECIPES);
  });

  it('excluye las recetas con un alimento directo de una alergia', () => {
    const conditions = [{ type: 'allergy', foodId: 'leche', foodGroupId: null }];

    expect(names(excludeRecipesForConditions(RECIPES, conditions, GROUPS))).toEqual([
      'Ensalada de atún',
      'Arroz con langostinos',
      'Arroz blanco',
    ]);
  });

  it('excluye las recetas con un alimento del grupo de una intolerancia', () => {
    const conditions = [{ type: 'intolerance', foodId: null, foodGroupId: 'lacteos' }];

    expect(names(excludeRecipesForConditions(RECIPES, conditions, GROUPS))).not.toContain('Avena con leche');
  });

  it('un rechazo sobre un grupo alcanza a sus subgrupos, a cualquier profundidad', () => {
    const conditions = [{ type: 'rejection', foodId: null, foodGroupId: 'carnes' }];

    expect(names(excludeRecipesForConditions(RECIPES, conditions, GROUPS))).toEqual(['Avena con leche', 'Arroz blanco']);
  });

  it('una condición sobre un subgrupo no alcanza al grupo padre ni a los hermanos', () => {
    const conditions = [{ type: 'rejection', foodId: null, foodGroupId: 'mariscos' }];

    expect(names(excludeRecipesForConditions(RECIPES, conditions, GROUPS))).toEqual([
      'Ensalada de atún',
      'Avena con leche',
      'Arroz blanco',
    ]);
  });

  it('combina varias condiciones', () => {
    const conditions = [
      { type: 'allergy', foodId: 'leche', foodGroupId: null },
      { type: 'rejection', foodId: null, foodGroupId: 'pescados' },
    ];

    expect(names(excludeRecipesForConditions(RECIPES, conditions, GROUPS))).toEqual(['Arroz blanco']);
  });

  it('las preferencias y las patologías no excluyen recetas: son reglas clínicas del Incremento 3', () => {
    const conditions = [
      { type: 'preference', foodId: 'arroz', foodGroupId: null },
      { type: 'preference', foodId: null, foodGroupId: 'cereales' },
      { type: 'pathology', pathologyId: 'celiaquia', foodId: null, foodGroupId: null },
    ];

    expect(excludeRecipesForConditions(RECIPES, conditions, GROUPS)).toEqual(RECIPES);
  });
});
