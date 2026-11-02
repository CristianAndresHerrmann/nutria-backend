const { createFoodAdminService } = require('./foodAdmin.service');

const GROUPS = [
  { id: 'carnes', name: 'Carnes, pescados y huevos', parentId: null },
  { id: 'pescados', name: 'Pescados', parentId: 'carnes' },
  { id: 'lacteos', name: 'Lácteos', parentId: null },
];

const groupRepository = {
  async findAll() {
    return GROUPS;
  },
  async findById(id) {
    return GROUPS.find((group) => group.id === id) || null;
  },
};

// Repositorio fake en memoria con los mismos ámbitos que el real. Los nombres se
// comparan sin mayúsculas, como el citext de la base.
function createFakeFoodRepository(initialFoods) {
  const store = initialFoods.map((food) => ({ active: true, nutritionistId: null, categories: ['protein'], ...food }));
  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
  let nextId = 1;

  return {
    store,
    async findForAdmin({ owner, groupIds }) {
      return store.filter(
        (food) =>
          (!owner || food.nutritionistId === (owner === 'common' ? null : owner)) &&
          (!groupIds || groupIds.includes(food.foodGroupId)),
      );
    },
    async findById(id) {
      return store.find((food) => food.id === id) || null;
    },
    async findByName(name, { excludeId, ownerId, activePrivates = false }) {
      return store.filter(
        (food) =>
          sameName(food.name, name) &&
          food.id !== excludeId &&
          (food.nutritionistId === null ||
            (ownerId && food.nutritionistId === ownerId) ||
            (activePrivates && food.active)),
      );
    },
    createCommon: vi.fn(async (data) => {
      const food = { id: `nuevo-${nextId++}`, active: true, ...data, nutritionistId: null, createdById: null };
      store.push(food);
      return food;
    }),
    update: vi.fn(async (id, data) => {
      const food = store.find((item) => item.id === id);
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) food[key] = value;
      });
      return food;
    }),
    promote: vi.fn(async (id, name) => Object.assign(store.find((food) => food.id === id), { nutritionistId: null, name })),
    findActivity: vi.fn(async () => []),
  };
}

function buildService() {
  const foodRepository = createFakeFoodRepository([
    { id: 'leche', name: 'Leche', foodGroupId: 'lacteos' },
    { id: 'merluza', name: 'Merluza', foodGroupId: 'pescados' },
    { id: 'kefir-1', name: 'Kéfir', foodGroupId: 'lacteos', nutritionistId: 'nutri-1', createdById: 'nutri-1' },
    { id: 'yogur-1', name: 'Yogur de cabra', foodGroupId: 'lacteos', nutritionistId: 'nutri-1', createdById: 'nutri-1' },
    { id: 'kefir-2', name: 'kéfir', foodGroupId: 'lacteos', nutritionistId: 'nutri-2', createdById: 'nutri-2' },
    { id: 'caballa-2', name: 'Caballa', foodGroupId: 'pescados', nutritionistId: 'nutri-2', createdById: 'nutri-2' },
    {
      id: 'trucha-baja-2',
      name: 'Trucha',
      foodGroupId: 'pescados',
      nutritionistId: 'nutri-2',
      createdById: 'nutri-2',
      active: false,
    },
  ]);
  const service = createFoodAdminService({ foodRepository, foodGroupRepository: groupRepository });
  return { service, foodRepository };
}

const DUPLICATE = { status: 409, code: 'CONFLICT', details: { fields: { name: 'Ya existe un alimento con ese nombre' } } };
const PRIVATE_OF_OTHER = {
  status: 409,
  code: 'CONFLICT',
  details: {
    fields: { name: 'Otro nutricionista tiene un alimento privado vigente con ese nombre: renombralo o dalo de baja' },
  },
};
const edit = (food, changes) => ({
  name: food.name,
  foodGroupId: food.foodGroupId,
  categories: food.categories,
  ...changes,
});

describe('foodAdmin.service — listado', () => {
  it('trae comunes y privados de todos, incluidas las bajas', async () => {
    const { service, foodRepository } = buildService();

    expect(await service.list()).toHaveLength(foodRepository.store.length);
  });

  it('filtra por comunes, por los privados de un nutricionista y por grupo con sus subgrupos', async () => {
    const { service } = buildService();
    const ids = (foods) => foods.map((food) => food.id).sort();

    expect(ids(await service.list({ owner: 'common' }))).toEqual(['leche', 'merluza']);
    expect(ids(await service.list({ owner: 'nutri-2' }))).toEqual(['caballa-2', 'kefir-2', 'trucha-baja-2']);
    expect(ids(await service.list({ groupId: 'carnes' }))).toEqual(['caballa-2', 'merluza', 'trucha-baja-2']);
    expect(await service.list({ groupId: 'no-existe' })).toEqual([]);
  });

  it('un id inexistente da 404', async () => {
    const { service } = buildService();

    await expect(service.get('no-existe')).rejects.toMatchObject({ status: 404, message: 'Alimento no encontrado' });
  });
});

describe('foodAdmin.service — edición', () => {
  it('corrige el grupo y las categorías de un privado sin cambiar su dueño', async () => {
    const { service, foodRepository } = buildService();
    const kefir = foodRepository.store.find((food) => food.id === 'kefir-1');

    const updated = await service.update('kefir-1', edit(kefir, { foodGroupId: 'carnes', categories: ['protein', 'fiber'] }));

    expect(updated).toMatchObject({ foodGroupId: 'carnes', categories: ['protein', 'fiber'], nutritionistId: 'nutri-1' });
  });

  it('da de baja y reactiva', async () => {
    const { service, foodRepository } = buildService();
    const leche = foodRepository.store.find((food) => food.id === 'leche');

    expect(await service.update('leche', edit(leche, { active: false }))).toMatchObject({ active: false });
    expect(await service.update('leche', edit(leche, { active: true }))).toMatchObject({ active: true });
  });

  it('un grupo inexistente da 400 en foodGroupId', async () => {
    const { service, foodRepository } = buildService();
    const leche = foodRepository.store.find((food) => food.id === 'leche');

    await expect(service.update('leche', edit(leche, { foodGroupId: 'no-existe' }))).rejects.toMatchObject({
      status: 400,
      details: { fields: { foodGroupId: 'El grupo de alimentos no existe' } },
    });
  });

  it('renombrar un privado con el nombre de un común o de otro propio da CONFLICT', async () => {
    const { service, foodRepository } = buildService();
    const kefir = foodRepository.store.find((food) => food.id === 'kefir-1');

    await expect(service.update('kefir-1', edit(kefir, { name: 'LECHE' }))).rejects.toMatchObject(DUPLICATE);
    await expect(service.update('kefir-1', edit(kefir, { name: 'yogur de cabra' }))).rejects.toMatchObject(DUPLICATE);
    expect(foodRepository.update).not.toHaveBeenCalled();
  });

  it('renombrar un privado con el nombre de un privado de otro nutricionista está permitido: no lo ve', async () => {
    const { service, foodRepository } = buildService();
    const yogur = foodRepository.store.find((food) => food.id === 'yogur-1');

    expect(await service.update('yogur-1', edit(yogur, { name: 'Caballa' }))).toMatchObject({ name: 'Caballa' });
  });

  it('renombrar un común con el nombre de otro común o de un privado vigente de alguien da CONFLICT', async () => {
    const { service, foodRepository } = buildService();
    const merluza = foodRepository.store.find((food) => food.id === 'merluza');

    await expect(service.update('merluza', edit(merluza, { name: 'leche' }))).rejects.toMatchObject(DUPLICATE);
    await expect(service.update('merluza', edit(merluza, { name: 'Caballa' }))).rejects.toMatchObject(PRIVATE_OF_OTHER);
  });

  it('un privado dado de baja de otro nutricionista no bloquea el nombre de un común', async () => {
    const { service, foodRepository } = buildService();
    const merluza = foodRepository.store.find((food) => food.id === 'merluza');

    expect(await service.update('merluza', edit(merluza, { name: 'Trucha' }))).toMatchObject({ name: 'Trucha' });
  });

  it('sin cambiar el nombre no se controla un choque que ya existía, salvo al reactivar', async () => {
    const { service, foodRepository } = buildService();
    foodRepository.store.push({
      id: 'caballa-comun',
      name: 'Caballa',
      foodGroupId: 'pescados',
      categories: ['protein'],
      nutritionistId: null,
      active: false,
    });
    const caballa = foodRepository.store.at(-1);

    expect(await service.update('caballa-comun', edit(caballa, { categories: ['healthy_fat'] }))).toMatchObject({
      categories: ['healthy_fat'],
    });
    await expect(service.update('caballa-comun', edit(caballa, { active: true }))).rejects.toMatchObject(PRIVATE_OF_OTHER);
  });
});

describe('foodAdmin.service — alta de un común', () => {
  it('crea un común', async () => {
    const { service } = buildService();

    const created = await service.createCommon({ name: 'Ricota', foodGroupId: 'lacteos', categories: ['protein'] });

    expect(created).toMatchObject({ name: 'Ricota', nutritionistId: null, createdById: null });
  });

  it('choca con un común y con un privado vigente de cualquier nutricionista', async () => {
    const { service, foodRepository } = buildService();
    const data = { foodGroupId: 'lacteos', categories: ['protein'] };

    await expect(service.createCommon({ ...data, name: 'LECHE' })).rejects.toMatchObject(DUPLICATE);
    await expect(service.createCommon({ ...data, name: 'Yogur de cabra' })).rejects.toMatchObject(PRIVATE_OF_OTHER);
    expect(foodRepository.createCommon).not.toHaveBeenCalled();
  });
});

describe('foodAdmin.service — pasar un privado al común', () => {
  it('lo pasa con el mismo id, sin dueño y conservando quién lo cargó', async () => {
    const { service } = buildService();

    const promoted = await service.promote('yogur-1', { name: null });

    expect(promoted).toMatchObject({ id: 'yogur-1', name: 'Yogur de cabra', nutritionistId: null, createdById: 'nutri-1' });
  });

  it('si otro nutricionista tiene un privado vigente con ese nombre da CONFLICT, y con otro nombre lo pasa', async () => {
    const { service, foodRepository } = buildService();

    await expect(service.promote('kefir-1', { name: null })).rejects.toMatchObject(PRIVATE_OF_OTHER);
    expect(foodRepository.promote).not.toHaveBeenCalled();

    expect(await service.promote('kefir-1', { name: 'Kéfir de leche' })).toMatchObject({
      name: 'Kéfir de leche',
      nutritionistId: null,
    });
  });

  it('un nombre que ya usa un común da CONFLICT', async () => {
    const { service } = buildService();

    await expect(service.promote('yogur-1', { name: 'Merluza' })).rejects.toMatchObject(DUPLICATE);
  });

  it('un nombre que ya usa otro privado del mismo dueño da CONFLICT, aunque esté dado de baja', async () => {
    const { service, foodRepository } = buildService();
    foodRepository.store.find((food) => food.id === 'kefir-1').active = false;

    await expect(service.promote('yogur-1', { name: 'KÉFIR' })).rejects.toMatchObject(DUPLICATE);
  });

  it('uno que ya es común da 409', async () => {
    const { service } = buildService();

    await expect(service.promote('leche', { name: null })).rejects.toMatchObject({
      status: 409,
      message: 'El alimento ya es común',
    });
  });

  it('un id inexistente da 404', async () => {
    const { service } = buildService();

    await expect(service.promote('no-existe', { name: null })).rejects.toMatchObject({ status: 404 });
  });
});

describe('foodAdmin.service — actividad del catálogo', () => {
  it('pide al repositorio la actividad de todos o de un nutricionista', async () => {
    const { service, foodRepository } = buildService();

    await service.activity();
    await service.activity({ nutritionistId: 'nutri-1' });

    expect(foodRepository.findActivity.mock.calls).toEqual([[{ nutritionistId: null }], [{ nutritionistId: 'nutri-1' }]]);
  });
});
