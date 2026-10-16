const { createFoodGroupService } = require('./foodGroup.service');

// Catálogo común de solo lectura para los nutricionistas. La regla de jerarquía
// sin ciclos se prueba en src/utils/foodGroupTree.test.js.
const groups = [{ id: 'carnes', name: 'Carnes', parentId: null }];
const repository = {
  async findAll() {
    return groups;
  },
  async findById(id) {
    return groups.find((item) => item.id === id) || null;
  },
};

describe('foodGroup.service', () => {
  const service = createFoodGroupService({ foodGroupRepository: repository });

  it('lista y obtiene grupos', async () => {
    expect(await service.list()).toEqual(groups);
    expect(await service.get('carnes')).toEqual(groups[0]);
  });

  it('responde 404 para un grupo inexistente', async () => {
    await expect(service.get('no-existe')).rejects.toMatchObject({ status: 404, message: 'Grupo de alimentos no encontrado' });
  });

  it('no expone alta ni edición', () => {
    expect(Object.keys(service).sort()).toEqual(['get', 'list']);
  });
});
