const { serializeFood, serializeFoodGroup, serializePathology } = require('./catalog.serializer');

const food = {
  id: 'caballa',
  name: 'Caballa',
  active: true,
  foodGroupId: 'pescados',
  createdById: 'nutri-1',
  foodGroup: { id: 'pescados', name: 'Pescados', parentId: 'carnes' },
  categories: [{ category: 'healthy_fat' }, { category: 'protein' }],
};

describe('catalog.serializer', () => {
  it('aplana las categorías y no expone el autor', () => {
    const result = serializeFood(food, 'nutri-1');

    expect(result.categories).toEqual(['healthy_fat', 'protein']);
    expect(result).not.toHaveProperty('createdById');
    expect(result.foodGroup).toEqual(food.foodGroup);
  });

  it('editable es true solo para el autor', () => {
    expect(serializeFood(food, 'nutri-1').editable).toBe(true);
    expect(serializeFood(food, 'nutri-2').editable).toBe(false);
  });

  it('un ítem del seed (sin autor) no es editable para nadie', () => {
    const seedGroup = { id: 'carnes', name: 'Carnes', parentId: null, description: null, createdById: null };

    expect(serializeFoodGroup(seedGroup, 'nutri-1').editable).toBe(false);
    expect(serializePathology({ id: 'x', name: 'Celiaquía', createdById: null }, undefined).editable).toBe(false);
  });
});
