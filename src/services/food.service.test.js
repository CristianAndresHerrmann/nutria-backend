const { createFoodService } = require('./food.service');

const GROUPS = [
  { id: 'carnes', name: 'Carnes, pescados y huevos', parentId: null },
  { id: 'pescados', name: 'Pescados', parentId: 'carnes' },
  { id: 'lacteos', name: 'Lácteos', parentId: null },
];

function createFakeGroupRepository() {
  return {
    async findAll() {
      return GROUPS;
    },
    async findById(id) {
      return GROUPS.find((group) => group.id === id) || null;
    },
  };
}

// findByName compara sin mayúsculas, como el citext de la base; updateByAuthor
// filtra por autor, como el updateMany real. No hay delete: el servicio tampoco
// lo necesita.
function createFakeFoodRepository(initialFoods) {
  const store = initialFoods.map((food) => ({ active: true, ...food }));
  let nextId = 1;

  return {
    store,
    async findMany({ search, groupIds, includeInactive }) {
      return store.filter(
        (food) =>
          (!search || food.name.toLowerCase().includes(search.toLowerCase())) &&
          (!groupIds || groupIds.includes(food.foodGroupId)) &&
          (includeInactive || food.active),
      );
    },
    async findById(id) {
      const food = store.find((item) => item.id === id);
      return food ? { ...food } : null;
    },
    async findByName(name) {
      return store.find((item) => item.name.toLowerCase() === name.toLowerCase()) || null;
    },
    async create(data) {
      const food = { id: `nuevo-${nextId++}`, active: true, ...data };
      store.push(food);
      return food;
    },
    async updateByAuthor(id, nutritionistId, data) {
      const food = store.find((item) => item.id === id && item.createdById === nutritionistId);
      if (!food) return null;
      Object.assign(food, data);
      return { ...food };
    },
  };
}

function buildService() {
  const foodRepository = createFakeFoodRepository([
    { id: 'leche', name: 'Leche', foodGroupId: 'lacteos', categories: ['protein'], createdById: null },
    { id: 'merluza', name: 'Merluza', foodGroupId: 'pescados', categories: ['protein'], createdById: null },
    { id: 'caballa', name: 'Caballa', foodGroupId: 'pescados', categories: ['protein'], createdById: 'nutri-1' },
    { id: 'ajeno', name: 'Kéfir', foodGroupId: 'lacteos', categories: ['protein'], createdById: 'nutri-2' },
    { id: 'baja', name: 'Queso de prueba', foodGroupId: 'lacteos', categories: ['protein'], createdById: 'nutri-1', active: false },
  ]);
  const service = createFoodService({ foodRepository, foodGroupRepository: createFakeGroupRepository() });
  return { service, foodRepository };
}

const newFood = { name: 'Trucha', foodGroupId: 'pescados', categories: ['protein', 'healthy_fat'] };

describe('food.service — alta de punta a punta en la capa de servicio', () => {
  it('da de alta un alimento con dos categorías dentro de un subgrupo, a nombre del nutricionista del token', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', newFood);

    expect(created).toMatchObject({ ...newFood, createdById: 'nutri-1', active: true });
  });

  it('rechaza con 400 en foodGroupId un grupo que no existe', async () => {
    const { service } = buildService();

    await expect(service.create('nutri-1', { ...newFood, foodGroupId: 'no-existe' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { foodGroupId: 'El grupo de alimentos no existe' } },
    });
  });
});

describe('food.service — nombre duplicado → CONFLICT', () => {
  it('rechaza con 409 un alta con el nombre de otro alimento en otras mayúsculas', async () => {
    const { service, foodRepository } = buildService();
    const before = foodRepository.store.length;

    await expect(service.create('nutri-1', { ...newFood, name: 'leche' })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: { fields: { name: 'Ya existe un alimento con ese nombre' } },
    });
    expect(foodRepository.store).toHaveLength(before);
  });

  it('rechaza con 409 renombrar un alimento propio con el nombre de otro', async () => {
    const { service } = buildService();

    await expect(
      service.update('caballa', 'nutri-1', { ...newFood, name: 'MERLUZA', active: true }),
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });

  it('editar un alimento conservando su nombre no es un conflicto', async () => {
    const { service } = buildService();

    const updated = await service.update('caballa', 'nutri-1', { ...newFood, name: 'Caballa', active: true });

    expect(updated.name).toBe('Caballa');
  });
});

describe('food.service — baja lógica', () => {
  it('dar de baja un alimento lo deja guardado con active false, no lo borra', async () => {
    const { service, foodRepository } = buildService();

    await service.update('caballa', 'nutri-1', { name: 'Caballa', foodGroupId: 'pescados', categories: ['protein'], active: false });

    expect(foodRepository.store.find((food) => food.id === 'caballa')).toMatchObject({ active: false });
    expect(await service.get('caballa')).toMatchObject({ id: 'caballa', active: false });
  });

  it('el servicio no expone ningún método de borrado', () => {
    const { service } = buildService();

    expect(Object.keys(service).sort()).toEqual(['create', 'get', 'list', 'update']);
  });
});

describe('food.service — autoría', () => {
  const edit = { name: 'Kéfir', foodGroupId: 'lacteos', categories: ['protein'], active: false };

  it('rechaza con 403 editar o dar de baja un alimento de otro nutricionista, y no lo modifica', async () => {
    const { service, foodRepository } = buildService();

    await expect(service.update('ajeno', 'nutri-1', edit)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(foodRepository.store.find((food) => food.id === 'ajeno').active).toBe(true);
  });

  it('rechaza con 403 editar un alimento del seed', async () => {
    const { service } = buildService();

    await expect(
      service.update('leche', 'nutri-1', { name: 'Leche', foodGroupId: 'lacteos', categories: ['protein'], active: false }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('el autor sí puede editar su alimento', async () => {
    const { service } = buildService();

    const updated = await service.update('ajeno', 'nutri-2', edit);

    expect(updated.active).toBe(false);
  });

  it('a quien no es autor no le responde sobre la validez del dato: 403 antes que 409', async () => {
    const { service } = buildService();

    await expect(service.update('ajeno', 'nutri-1', { ...edit, name: 'Leche' })).rejects.toMatchObject({ status: 403 });
  });

  it('responde 404 para un alimento inexistente', async () => {
    const { service } = buildService();

    await expect(service.update('no-existe', 'nutri-1', edit)).rejects.toMatchObject({
      status: 404,
      message: 'Alimento no encontrado',
    });
  });
});

describe('food.service — listado', () => {
  const names = (foods) => foods.map((food) => food.name).sort();

  it('por defecto lista solo los vigentes', async () => {
    const { service } = buildService();

    expect(names(await service.list())).not.toContain('Queso de prueba');
    expect(names(await service.list({ includeInactive: true }))).toContain('Queso de prueba');
  });

  it('filtrar por un grupo incluye los alimentos de sus subgrupos', async () => {
    const { service } = buildService();

    expect(names(await service.list({ groupId: 'carnes' }))).toEqual(['Caballa', 'Merluza']);
  });

  it('un grupo inexistente devuelve una lista vacía', async () => {
    const { service } = buildService();

    expect(await service.list({ groupId: 'no-existe' })).toEqual([]);
  });
});
