const { recipeMealTypeFinding } = require('./recipeMealType');
const { indexCatalog } = require('./catalogIndex');

const recipe = (id, name, mealTypes) => ({ id, name, ingredients: [], mealTypes: mealTypes.map((mealType) => ({ mealType })) });

const CATALOG = indexCatalog({
  foods: [],
  groups: [],
  recipes: [
    // Los tipos llegan en cualquier orden; el mensaje los nombra en el orden del día.
    recipe('licuado', 'Licuado de banana', ['afternoon_snack', 'breakfast']),
    recipe('guiso', 'Guiso de lentejas', ['dinner']),
  ],
});

const recipeItem = (recipeId) => ({ id: `i-${recipeId}`, order: 1, type: 'recipe', recipeId });

describe('recipeMealTypeFinding — receta fuera de su tipo de comida (R-06)', () => {
  it('advierte sobre una receta en una comida que no es la suya, nombrando sus tipos en el orden del día', () => {
    expect(recipeMealTypeFinding(recipeItem('licuado'), 'dinner', CATALOG)).toEqual({
      type: 'meal_type_mismatch',
      severity: 'warning',
      optionId: null,
      optionItemId: 'i-licuado',
      patientConditionId: null,
      message: 'Receta Licuado de banana: no está indicada para la cena (se indica para desayuno y merienda)',
    });
    expect(recipeMealTypeFinding(recipeItem('guiso'), 'lunch', CATALOG).message).toBe(
      'Receta Guiso de lentejas: no está indicada para el almuerzo (se indica para cena)',
    );
  });

  it('no advierte sobre una receta en uno de sus tipos de comida', () => {
    expect(recipeMealTypeFinding(recipeItem('licuado'), 'breakfast', CATALOG)).toBeNull();
    expect(recipeMealTypeFinding(recipeItem('licuado'), 'afternoon_snack', CATALOG)).toBeNull();
  });

  it('no aplica a alimentos, grupos ni ítems no reconocidos', () => {
    expect(recipeMealTypeFinding({ id: 'i-1', type: 'food', foodId: 'pollo' }, 'dinner', CATALOG)).toBeNull();
    expect(recipeMealTypeFinding({ id: 'i-2', type: 'food_group', foodGroupId: 'frutas' }, 'dinner', CATALOG)).toBeNull();
    expect(recipeMealTypeFinding({ id: 'i-3', type: 'unrecognized', originalText: 'mate' }, 'dinner', CATALOG)).toBeNull();
  });

  it('una receta que no está en el catálogo es un error, no se saltea', () => {
    expect(() => recipeMealTypeFinding(recipeItem('no-existe'), 'lunch', CATALOG)).toThrow(/no-existe/);
  });
});
