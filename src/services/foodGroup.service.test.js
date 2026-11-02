const { createFoodGroupService } = require('./foodGroup.service');

// Repositorio fake en memoria. Los nombres se comparan sin mayúsculas, como el
// citext de la base. La regla de ciclos en sí se prueba en
// src/utils/foodGroupTree.test.js; acá, que el servicio la aplique.
function createFakeRepository() {
  const store = [
    { id: 'carnes', name: 'Carnes, pescados y huevos', description: null, parentId: null },
    { id: 'pescados', name: 'Pescados', description: null, parentId: 'carnes' },
    { id: 'azules', name: 'Pescados azules', description: null, parentId: 'pescados' },
    { id: 'lacteos', name: 'Lácteos', description: null, parentId: null },
  ];
  let nextId = 1;

  return {
    store,
    async findAll() {
      return store;
    },
    async findById(id) {
      return store.find((group) => group.id === id) || null;
    },
    async findByName(name, { excludeId } = {}) {
      return store.find((group) => group.name.toLowerCase() === name.toLowerCase() && group.id !== excludeId) || null;
    },
    create: vi.fn(async (data) => {
      const group = { id: `nuevo-${nextId++}`, ...data };
      store.push(group);
      return group;
    }),
    update: vi.fn(async (id, data) => Object.assign(store.find((group) => group.id === id), data)),
  };
}

function buildService() {
  const repository = createFakeRepository();
  return { service: createFoodGroupService({ foodGroupRepository: repository }), repository };
}

describe('foodGroup.service — lectura', () => {
  it('lista y obtiene grupos', async () => {
    const { service, repository } = buildService();

    expect(await service.list()).toEqual(repository.store);
    expect(await service.get('carnes')).toEqual(repository.store[0]);
  });

  it('responde 404 para un grupo inexistente', async () => {
    const { service } = buildService();

    await expect(service.get('no-existe')).rejects.toMatchObject({ status: 404, message: 'Grupo de alimentos no encontrado' });
  });
});

describe('foodGroup.service — alta y edición (T25)', () => {
  it('da de alta un grupo dentro de otro', async () => {
    const { service } = buildService();

    const created = await service.create({ name: 'Leches fermentadas', description: null, parentId: 'lacteos' });

    expect(created).toMatchObject({ name: 'Leches fermentadas', parentId: 'lacteos' });
  });

  it('mueve un grupo a otra rama y lo vuelve raíz', async () => {
    const { service } = buildService();

    expect(await service.update('azules', { name: 'Pescados azules', description: null, parentId: 'carnes' })).toMatchObject({
      parentId: 'carnes',
    });
    expect(await service.update('azules', { name: 'Pescados azules', description: null, parentId: null })).toMatchObject({
      parentId: null,
    });
  });

  it.each([
    ['dentro de un subgrupo directo', 'carnes', 'pescados'],
    ['dentro de un subgrupo de un subgrupo', 'carnes', 'azules'],
    ['dentro de sí mismo', 'pescados', 'pescados'],
  ])('un grupo no puede quedar %s: 400 en parentId', async (_case, groupId, parentId) => {
    const { service, repository } = buildService();

    await expect(service.update(groupId, { name: 'X', description: null, parentId })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { parentId: 'Un grupo no puede quedar dentro de sí mismo ni de uno de sus subgrupos' } },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('un padre inexistente da 400 en parentId, al crear y al editar', async () => {
    const { service } = buildService();
    const fieldError = { status: 400, details: { fields: { parentId: 'El grupo padre no existe' } } };

    await expect(service.create({ name: 'Nuevo', description: null, parentId: 'no-existe' })).rejects.toMatchObject(fieldError);
    await expect(service.update('lacteos', { name: 'Lácteos', description: null, parentId: 'no-existe' })).rejects.toMatchObject(
      fieldError,
    );
  });

  it('un nombre duplicado, en otras mayúsculas, da CONFLICT al crear y al editar', async () => {
    const { service, repository } = buildService();
    const conflict = {
      status: 409,
      code: 'CONFLICT',
      details: { fields: { name: 'Ya existe un grupo con ese nombre' } },
    };

    await expect(service.create({ name: 'PESCADOS', description: null, parentId: null })).rejects.toMatchObject(conflict);
    await expect(service.update('lacteos', { name: 'pescados', description: null, parentId: null })).rejects.toMatchObject(conflict);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('editar un grupo conservando su nombre no choca consigo mismo', async () => {
    const { service } = buildService();

    expect(await service.update('lacteos', { name: 'LÁCTEOS', description: 'Leches y quesos', parentId: null })).toMatchObject({
      description: 'Leches y quesos',
    });
  });

  it('editar un grupo inexistente da 404', async () => {
    const { service } = buildService();

    await expect(service.update('no-existe', { name: 'X', description: null, parentId: null })).rejects.toMatchObject({
      status: 404,
    });
  });
});
