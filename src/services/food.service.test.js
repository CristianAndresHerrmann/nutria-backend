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

// Repositorio fake en memoria con la misma visibilidad que el real: comunes
// (nutritionistId null) más los privados del nutricionista, solo vigentes en el
// listado. Los nombres se comparan sin mayúsculas, como el citext de la base. No
// tiene update ni delete: el servicio tampoco los usa.
function createFakeFoodRepository(initialFoods) {
  const store = initialFoods.map((food) => ({ active: true, nutritionistId: null, ...food }));
  const visible = (food, nutritionistId) => food.nutritionistId === null || food.nutritionistId === nutritionistId;
  let nextId = 1;

  return {
    store,
    async findVisible(nutritionistId, { search, groupIds }) {
      return store.filter(
        (food) =>
          visible(food, nutritionistId) &&
          food.active &&
          (!search || food.name.toLowerCase().includes(search.toLowerCase())) &&
          (!groupIds || groupIds.includes(food.foodGroupId)),
      );
    },
    async findVisibleById(id, nutritionistId) {
      return store.find((food) => food.id === id && visible(food, nutritionistId)) || null;
    },
    async findVisibleByName(name, nutritionistId) {
      return store.find((food) => food.name.toLowerCase() === name.toLowerCase() && visible(food, nutritionistId)) || null;
    },
    async createPrivate(nutritionistId, data) {
      const food = { id: `nuevo-${nextId++}`, active: true, ...data, nutritionistId };
      store.push(food);
      return food;
    },
  };
}

function buildService() {
  const foodRepository = createFakeFoodRepository([
    { id: 'leche', name: 'Leche', foodGroupId: 'lacteos' },
    { id: 'merluza', name: 'Merluza', foodGroupId: 'pescados' },
    { id: 'baja', name: 'Queso de baja', foodGroupId: 'lacteos', active: false },
    { id: 'kefir-1', name: 'Kéfir', foodGroupId: 'lacteos', nutritionistId: 'nutri-1' },
    { id: 'caballa-2', name: 'Caballa', foodGroupId: 'pescados', nutritionistId: 'nutri-2' },
  ]);
  const service = createFoodService({ foodRepository, foodGroupRepository: createFakeGroupRepository() });
  return { service, foodRepository };
}

const newFood = { name: 'Trucha', foodGroupId: 'pescados', categories: ['protein', 'healthy_fat'] };
const names = (foods) => foods.map((food) => food.name).sort();

describe('food.service — alta', () => {
  it('da de alta un alimento con dos categorías dentro de un subgrupo, privado del nutricionista del token', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', newFood);

    expect(created).toMatchObject({ ...newFood, nutritionistId: 'nutri-1', active: true });
  });

  it('rechaza con 400 en foodGroupId un grupo que no existe', async () => {
    const { service } = buildService();

    await expect(service.create('nutri-1', { ...newFood, foodGroupId: 'no-existe' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { foodGroupId: 'El grupo de alimentos no existe' } },
    });
  });

  it('el servicio no expone edición ni borrado: el nutricionista no modifica el catálogo', () => {
    const { service } = buildService();

    expect(Object.keys(service).sort()).toEqual(['create', 'get', 'list']);
  });
});

describe('food.service — nombre duplicado → CONFLICT', () => {
  it('rechaza con 409 un nombre común en otras mayúsculas', async () => {
    const { service, foodRepository } = buildService();
    const before = foodRepository.store.length;

    await expect(service.create('nutri-1', { ...newFood, name: 'LECHE' })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: { fields: { name: 'Ya existe un alimento con ese nombre' } },
    });
    expect(foodRepository.store).toHaveLength(before);
  });

  it('rechaza con 409 repetir un nombre propio', async () => {
    const { service } = buildService();

    await expect(service.create('nutri-1', { ...newFood, name: 'kéfir' })).rejects.toMatchObject({ status: 409 });
  });

  it('permite repetir el nombre de un privado de otro nutricionista: no lo ve', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', { ...newFood, name: 'Caballa' });

    expect(created).toMatchObject({ name: 'Caballa', nutritionistId: 'nutri-1' });
  });
});

describe('food.service — alimentos privados aislados por nutricionista', () => {
  it('lista los comunes y los propios, nunca los privados de otro', async () => {
    const { service } = buildService();

    expect(names(await service.list('nutri-1'))).toEqual(['Kéfir', 'Leche', 'Merluza']);
    expect(names(await service.list('nutri-2'))).toEqual(['Caballa', 'Leche', 'Merluza']);
  });

  it('pedir por id un privado de otro nutricionista da 404, igual que uno inexistente', async () => {
    const { service } = buildService();

    await expect(service.get('caballa-2', 'nutri-1')).rejects.toMatchObject({ status: 404, message: 'Alimento no encontrado' });
    await expect(service.get('no-existe', 'nutri-1')).rejects.toMatchObject({ status: 404 });
    expect(await service.get('kefir-1', 'nutri-1')).toMatchObject({ id: 'kefir-1' });
  });

  it('un alimento recién dado de alta lo ve solo quien lo cargó', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', newFood);

    expect(names(await service.list('nutri-1'))).toContain('Trucha');
    expect(names(await service.list('nutri-2'))).not.toContain('Trucha');
    await expect(service.get(created.id, 'nutri-2')).rejects.toMatchObject({ status: 404 });
  });
});

describe('food.service — listado', () => {
  it('no lista los dados de baja', async () => {
    const { service } = buildService();

    expect(names(await service.list('nutri-1'))).not.toContain('Queso de baja');
  });

  it('filtrar por un grupo incluye los alimentos de sus subgrupos', async () => {
    const { service } = buildService();

    expect(names(await service.list('nutri-2', { groupId: 'carnes' }))).toEqual(['Caballa', 'Merluza']);
  });

  it('un grupo inexistente devuelve una lista vacía', async () => {
    const { service } = buildService();

    expect(await service.list('nutri-1', { groupId: 'no-existe' })).toEqual([]);
  });
});
