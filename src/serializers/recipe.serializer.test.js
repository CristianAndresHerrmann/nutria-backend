const { serializeRecipe } = require('./recipe.serializer');

describe('recipe.serializer', () => {
  it('aplana los tipos de comida y no expone el dueño', () => {
    const ingredients = [{ order: 1, quantityDescription: '1 taza', food: { id: 'arroz', name: 'Arroz', active: true, foodGroupId: 'g' } }];

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
      ingredients,
      mealTypes: ['lunch', 'dinner'],
    });
  });
});
