const { serializeRecipe } = require('./recipe.serializer');

const ingredients = [{ order: 1, quantityDescription: '1 taza', food: { id: 'arroz', name: 'Arroz', active: true, foodGroupId: 'g' } }];

describe('recipe.serializer', () => {
  it('aplana los tipos de comida y no expone el dueño', () => {
    const result = serializeRecipe({
      id: 'r-1',
      name: 'Ensalada',
      nutritionistId: 'nutri-1',
      origin: 'professional',
      availableInCatalog: true,
      ingredients,
      mealTypes: [{ mealType: 'lunch' }, { mealType: 'dinner' }],
    });

    expect(result).toEqual({
      id: 'r-1',
      name: 'Ensalada',
      origin: 'professional',
      availableInCatalog: true,
      own: true,
      ingredients,
      mealTypes: ['lunch', 'dinner'],
    });
  });

  it('marca una receta básica común como no propia (T30)', () => {
    const result = serializeRecipe({ id: 'r-2', name: 'Licuado', nutritionistId: null, ingredients, mealTypes: [] });

    expect(result.own).toBe(false);
    expect(result).not.toHaveProperty('nutritionistId');
  });
});
