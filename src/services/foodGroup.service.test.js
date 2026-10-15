const { createFoodGroupService } = require('./foodGroup.service');

// Repositorio fake en memoria: findByName compara sin mayúsculas, como el citext
// de la base, y updateByAuthor filtra por autor, como el updateMany real.
function createFakeRepository(initialGroups) {
  const store = initialGroups.map((group) => ({ description: null, ...group }));
  let nextId = 1;

  return {
    store,
    async findAll() {
      return store.map((group) => ({ ...group }));
    },
    async findById(id) {
      const group = store.find((item) => item.id === id);
      return group ? { ...group } : null;
    },
    async findByName(name) {
      return store.find((item) => item.name.toLowerCase() === name.toLowerCase()) || null;
    },
    async create(data) {
      const group = { id: `nuevo-${nextId++}`, ...data };
      store.push(group);
      return group;
    },
    async updateByAuthor(id, nutritionistId, data) {
      const group = store.find((item) => item.id === id && item.createdById === nutritionistId);
      if (!group) return null;
      Object.assign(group, data);
      return { ...group };
    },
  };
}

// Del seed (sin autor): Carnes > Aves. Propios de nutri-1: Mis grupos > Sub > Subsub.
// De nutri-2: Ajeno.
function buildService() {
  const repository = createFakeRepository([
    { id: 'carnes', name: 'Carnes', parentId: null, createdById: null },
    { id: 'aves', name: 'Aves', parentId: 'carnes', createdById: null },
    { id: 'propio', name: 'Mis grupos', parentId: null, createdById: 'nutri-1' },
    { id: 'sub', name: 'Sub', parentId: 'propio', createdById: 'nutri-1' },
    { id: 'subsub', name: 'Subsub', parentId: 'sub', createdById: 'nutri-1' },
    { id: 'ajeno', name: 'Ajeno', parentId: null, createdById: 'nutri-2' },
  ]);
  return { repository, service: createFoodGroupService({ foodGroupRepository: repository }) };
}

describe('foodGroup.service — jerarquía sin ciclos', () => {
  it('rechaza con 400 en parentId mover un grupo dentro de su nieto', async () => {
    const { service, repository } = buildService();

    await expect(
      service.update('propio', 'nutri-1', { name: 'Mis grupos', description: null, parentId: 'subsub' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { parentId: 'Un grupo no puede quedar dentro de sí mismo ni de uno de sus subgrupos' } },
    });
    expect(repository.store.find((group) => group.id === 'propio').parentId).toBeNull();
  });

  it('rechaza con 400 un grupo como su propio padre', async () => {
    const { service } = buildService();

    await expect(
      service.update('sub', 'nutri-1', { name: 'Sub', description: null, parentId: 'sub' }),
    ).rejects.toMatchObject({ status: 400, details: { fields: { parentId: expect.any(String) } } });
  });

  it('permite mover un grupo propio a otra rama, incluso bajo un grupo del seed', async () => {
    const { service } = buildService();

    const updated = await service.update('sub', 'nutri-1', { name: 'Sub', description: null, parentId: 'aves' });

    expect(updated.parentId).toBe('aves');
  });

  it('rechaza con 400 un padre que no existe', async () => {
    const { service } = buildService();

    await expect(service.create('nutri-1', { name: 'Nuevo', description: null, parentId: 'no-existe' })).rejects.toMatchObject({
      status: 400,
      details: { fields: { parentId: 'El grupo padre no existe' } },
    });
  });
});

describe('foodGroup.service — nombre único sin distinguir mayúsculas', () => {
  it('rechaza con 409 CONFLICT un alta con el nombre de otro grupo en otras mayúsculas', async () => {
    const { service } = buildService();

    await expect(service.create('nutri-1', { name: 'aves', description: null, parentId: null })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: { fields: { name: 'Ya existe un grupo con ese nombre' } },
    });
  });

  it('editar un grupo conservando su nombre no es un conflicto', async () => {
    const { service } = buildService();

    const updated = await service.update('sub', 'nutri-1', { name: 'SUB', description: null, parentId: 'propio' });

    expect(updated.name).toBe('SUB');
  });
});

describe('foodGroup.service — autoría', () => {
  it('el alta guarda como autor al nutricionista del token', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', { name: 'Hongos', description: null, parentId: 'carnes' });

    expect(created.createdById).toBe('nutri-1');
  });

  it('rechaza con 403 editar un grupo de otro nutricionista y no lo modifica', async () => {
    const { service, repository } = buildService();

    await expect(
      service.update('ajeno', 'nutri-1', { name: 'Pisado', description: null, parentId: null }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(repository.store.find((group) => group.id === 'ajeno').name).toBe('Ajeno');
  });

  it('rechaza con 403 editar un grupo del seed', async () => {
    const { service } = buildService();

    await expect(
      service.update('carnes', 'nutri-1', { name: 'Carnes', description: 'x', parentId: null }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('responde 404 para un grupo inexistente', async () => {
    const { service } = buildService();

    await expect(service.get('no-existe')).rejects.toMatchObject({
      status: 404,
      message: 'Grupo de alimentos no encontrado',
    });
  });
});
