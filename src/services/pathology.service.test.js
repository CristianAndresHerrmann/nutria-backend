const { createPathologyService } = require('./pathology.service');

// Repositorio fake en memoria. Los nombres se comparan sin mayúsculas, como el
// citext de la base.
function createFakeRepository() {
  const store = [
    { id: 'celiaquia', name: 'Celiaquía', description: null },
    { id: 'diabetes', name: 'Diabetes', description: null },
  ];
  let nextId = 1;

  return {
    store,
    async findAll() {
      return store;
    },
    async findById(id) {
      return store.find((item) => item.id === id) || null;
    },
    async findByName(name, { excludeId } = {}) {
      return store.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== excludeId) || null;
    },
    create: vi.fn(async (data) => {
      const pathology = { id: `nueva-${nextId++}`, ...data };
      store.push(pathology);
      return pathology;
    }),
    update: vi.fn(async (id, data) => Object.assign(store.find((item) => item.id === id), data)),
  };
}

function buildService() {
  const repository = createFakeRepository();
  return { service: createPathologyService({ pathologyRepository: repository }), repository };
}

describe('pathology.service — lectura', () => {
  it('lista y obtiene patologías', async () => {
    const { service, repository } = buildService();

    expect(await service.list()).toEqual(repository.store);
    expect(await service.get('celiaquia')).toEqual(repository.store[0]);
  });

  it('responde 404 para una patología inexistente', async () => {
    const { service } = buildService();

    await expect(service.get('no-existe')).rejects.toMatchObject({ status: 404, message: 'Patología no encontrada' });
  });
});

describe('pathology.service — alta y edición (T25; RF-04)', () => {
  it('da de alta y edita una patología', async () => {
    const { service } = buildService();

    const created = await service.create({ name: 'Hipertensión', description: null });
    const updated = await service.update(created.id, { name: 'Hipertensión arterial', description: 'HTA' });

    expect(updated).toMatchObject({ name: 'Hipertensión arterial', description: 'HTA' });
  });

  it('un nombre duplicado, en otras mayúsculas, da CONFLICT al crear y al editar', async () => {
    const { service, repository } = buildService();
    const conflict = {
      status: 409,
      code: 'CONFLICT',
      details: { fields: { name: 'Ya existe una patología con ese nombre' } },
    };

    await expect(service.create({ name: 'CELIAQUÍA', description: null })).rejects.toMatchObject(conflict);
    await expect(service.update('diabetes', { name: 'celiaquía', description: null })).rejects.toMatchObject(conflict);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('editar una patología conservando su nombre no choca consigo misma', async () => {
    const { service } = buildService();

    expect(await service.update('diabetes', { name: 'Diabetes', description: 'DM2' })).toMatchObject({ description: 'DM2' });
  });

  it('editar una patología inexistente da 404', async () => {
    const { service } = buildService();

    await expect(service.update('no-existe', { name: 'X', description: null })).rejects.toMatchObject({ status: 404 });
  });
});
