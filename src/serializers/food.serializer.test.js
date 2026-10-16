const { serializeFood } = require('./food.serializer');

describe('food.serializer', () => {
  it('aplana las categorías y no expone el dueño', () => {
    const result = serializeFood({
      id: 'caballa',
      name: 'Caballa',
      active: true,
      foodGroupId: 'pescados',
      nutritionistId: 'nutri-1',
      foodGroup: { id: 'pescados', name: 'Pescados', parentId: 'carnes' },
      categories: [{ category: 'healthy_fat' }, { category: 'protein' }],
    });

    expect(result).toEqual({
      id: 'caballa',
      name: 'Caballa',
      active: true,
      foodGroupId: 'pescados',
      foodGroup: { id: 'pescados', name: 'Pescados', parentId: 'carnes' },
      categories: ['healthy_fat', 'protein'],
    });
  });
});
