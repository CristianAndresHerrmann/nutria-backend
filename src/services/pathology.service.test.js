const { createPathologyService } = require('./pathology.service');

function buildService() {
  const store = [
    { id: 'celiaquia', name: 'Celiaquía', description: null, createdById: null },
    { id: 'propia', name: 'Hipotiroidismo', description: null, createdById: 'nutri-1' },
  ];
  const repository = {
    async findAll() {
      return store;
    },
    async findById(id) {
      return store.find((item) => item.id === id) || null;
    },
    async findByName(name) {
      return store.find((item) => item.name.toLowerCase() === name.toLowerCase()) || null;
    },
    async create(data) {
      const pathology = { id: 'nueva', ...data };
      store.push(pathology);
      return pathology;
    },
    async updateByAuthor(id, nutritionistId, data) {
      const pathology = store.find((item) => item.id === id && item.createdById === nutritionistId);
      if (!pathology) return null;
      Object.assign(pathology, data);
      return pathology;
    },
  };
  return { store, service: createPathologyService({ pathologyRepository: repository }) };
}

describe('pathology.service', () => {
  it('da de alta una patología a nombre del nutricionista del token', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', { name: 'Gota', description: null });

    expect(created).toMatchObject({ name: 'Gota', createdById: 'nutri-1' });
  });

  it('rechaza con 409 CONFLICT un nombre repetido en otras mayúsculas', async () => {
    const { service } = buildService();

    await expect(service.create('nutri-1', { name: 'CELIAQUÍA', description: null })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: { fields: { name: 'Ya existe una patología con ese nombre' } },
    });
  });

  it('el autor edita su patología', async () => {
    const { service } = buildService();

    const updated = await service.update('propia', 'nutri-1', { name: 'Hipotiroidismo', description: 'Nota' });

    expect(updated.description).toBe('Nota');
  });

  it('rechaza con 403 editar una patología ajena o del seed, sin modificarla', async () => {
    const { service, store } = buildService();

    await expect(service.update('propia', 'nutri-2', { name: 'Otra', description: null })).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.update('celiaquia', 'nutri-1', { name: 'Celiaquía', description: 'x' })).rejects.toMatchObject({
      status: 403,
    });
    expect(store.find((item) => item.id === 'propia').name).toBe('Hipotiroidismo');
    expect(store.find((item) => item.id === 'celiaquia').description).toBeNull();
  });

  it('responde 404 para una patología inexistente', async () => {
    const { service } = buildService();

    await expect(service.get('no-existe')).rejects.toMatchObject({ status: 404, message: 'Patología no encontrada' });
  });
});
