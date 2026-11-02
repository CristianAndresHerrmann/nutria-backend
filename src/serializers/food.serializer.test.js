const { serializeFood, serializeAdminFood, serializeCatalogActivity } = require('./food.serializer');

describe('food.serializer', () => {
  it('aplana las categorías y no expone el dueño, el autor ni la fecha de alta', () => {
    const result = serializeFood({
      id: 'caballa',
      name: 'Caballa',
      active: true,
      foodGroupId: 'pescados',
      nutritionistId: 'nutri-1',
      createdById: 'nutri-1',
      createdAt: new Date('2026-10-27T13:20:05.118Z'),
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

  it('la vista del administrador marca si es común y trae solo id y nombre de las cuentas', () => {
    const createdAt = new Date('2026-10-27T13:20:05.118Z');
    const account = { id: 'nutri-1', name: 'Lic. Ficticia', email: 'no@debe.salir', passwordHash: 'x' };

    const result = serializeAdminFood({
      id: 'kefir',
      name: 'Kéfir',
      active: false,
      foodGroupId: 'lacteos',
      foodGroup: { id: 'lacteos', name: 'Leches y yogures', parentId: null },
      categories: [{ category: 'protein' }],
      nutritionistId: 'nutri-1',
      nutritionist: account,
      createdById: 'nutri-1',
      createdBy: account,
      createdAt,
    });

    expect(result).toEqual({
      id: 'kefir',
      name: 'Kéfir',
      active: false,
      foodGroupId: 'lacteos',
      foodGroup: { id: 'lacteos', name: 'Leches y yogures', parentId: null },
      categories: ['protein'],
      common: false,
      owner: { id: 'nutri-1', name: 'Lic. Ficticia' },
      createdBy: { id: 'nutri-1', name: 'Lic. Ficticia' },
      createdAt,
    });
  });

  it('la actividad sigue mostrando al autor de un alimento que pasó al común', () => {
    const createdAt = new Date('2026-10-27T13:20:05.118Z');

    expect(
      serializeCatalogActivity([
        { id: 'kefir', name: 'Kéfir', active: true, nutritionistId: null, createdAt, createdBy: { id: 'nutri-1', name: 'Ana' } },
      ]),
    ).toEqual([{ id: 'kefir', name: 'Kéfir', active: true, common: true, createdBy: { id: 'nutri-1', name: 'Ana' }, createdAt }]);
  });
});
