const { createRecipeService } = require('./recipe.service');

const GROUPS = [
  { id: 'carnes', name: 'Carnes, pescados y huevos', parentId: null },
  { id: 'pescados', name: 'Pescados', parentId: 'carnes' },
  { id: 'cereales', name: 'Cereales', parentId: null },
  { id: 'verduras', name: 'Verduras', parentId: null },
];

const FOODS = [
  { id: 'arroz', name: 'Arroz blanco', foodGroupId: 'cereales', nutritionistId: null, active: true },
  { id: 'atun', name: 'Atún al natural', foodGroupId: 'pescados', nutritionistId: null, active: true },
  { id: 'tomate', name: 'Tomate', foodGroupId: 'verduras', nutritionistId: null, active: true },
  { id: 'lechuga', name: 'Lechuga', foodGroupId: 'verduras', nutritionistId: null, active: true },
  { id: 'baja', name: 'Queso de baja', foodGroupId: 'cereales', nutritionistId: null, active: false },
  { id: 'kefir-1', name: 'Kéfir', foodGroupId: 'cereales', nutritionistId: 'nutri-1', active: true },
  { id: 'caballa-2', name: 'Caballa', foodGroupId: 'pescados', nutritionistId: 'nutri-2', active: true },
];

const visible = (food, nutritionistId) => food.nutritionistId === null || food.nutritionistId === nutritionistId;

// Repositorio fake en memoria con el mismo aislamiento que el real: un
// nutricionista ve las comunes (dueño null) y las suyas, y edita solo las
// suyas. Guarda las recetas con la forma que devuelve Prisma
// (ingredientes con su alimento, tipos como filas).
function createFakeRecipeRepository() {
  const store = [];
  let nextId = 1;

  function build(id, nutritionistId, data, ingredients, mealTypes, previous = {}) {
    return {
      origin: 'professional',
      availableInCatalog: true,
      ...previous,
      ...data,
      id,
      nutritionistId,
      ingredients: ingredients.map(({ foodId, quantityDescription }, index) => {
        const { id: foodIdValue, name, active, foodGroupId } = FOODS.find((food) => food.id === foodId);
        return { order: index + 1, quantityDescription, food: { id: foodIdValue, name, active, foodGroupId } };
      }),
      mealTypes: mealTypes.map((mealType) => ({ mealType })),
    };
  }

  return {
    store,
    async findVisible(nutritionistId, { mealType = null, includeUnavailable = false } = {}) {
      return store.filter(
        (recipe) =>
          visible(recipe, nutritionistId) &&
          (includeUnavailable || recipe.availableInCatalog) &&
          (!mealType || recipe.mealTypes.some((row) => row.mealType === mealType)),
      );
    },
    async findVisibleById(id, nutritionistId) {
      return store.find((recipe) => recipe.id === id && visible(recipe, nutritionistId)) || null;
    },
    async create(nutritionistId, data, ingredients, mealTypes) {
      const recipe = build(`receta-${nextId++}`, nutritionistId, data, ingredients, mealTypes);
      store.push(recipe);
      return recipe;
    },
    async updateOwn(id, nutritionistId, data, ingredients, mealTypes) {
      const index = store.findIndex((recipe) => recipe.id === id && recipe.nutritionistId === nutritionistId);
      if (index === -1) return null;
      store[index] = build(id, nutritionistId, data, ingredients, mealTypes, store[index]);
      return store[index];
    },
    async setAvailabilityOwn(id, nutritionistId, availableInCatalog) {
      const index = store.findIndex((recipe) => recipe.id === id && recipe.nutritionistId === nutritionistId);
      if (index === -1) return null;
      store[index] = { ...store[index], availableInCatalog };
      return store[index];
    },
    upsertCommon: vi.fn(async (data, ingredients, mealTypes) => {
      const recipe = build(`comun-${nextId++}`, null, data, ingredients, mealTypes);
      store.push(recipe);
      return recipe;
    }),
  };
}

function buildService({ conditions = [] } = {}) {
  const recipeRepository = createFakeRecipeRepository();
  const foodRepository = {
    async findVisibleById(id, nutritionistId) {
      return FOODS.find((food) => food.id === id && visible(food, nutritionistId)) || null;
    },
    async findCommonById(id) {
      return FOODS.find((food) => food.id === id && food.nutritionistId === null) || null;
    },
  };
  const foodGroupRepository = { findAll: async () => GROUPS };
  const patientRepository = {
    async findByIdForNutritionist(id, nutritionistId) {
      return id === 'paciente-1' && nutritionistId === 'nutri-1' ? { id } : null;
    },
  };
  const patientConditionRepository = {
    findAllForPatient: vi.fn(async () => conditions),
  };

  const service = createRecipeService({
    recipeRepository,
    foodRepository,
    foodGroupRepository,
    patientRepository,
    patientConditionRepository,
  });
  return { service, recipeRepository, patientConditionRepository };
}

const ensalada = {
  name: 'Ensalada de arroz y atún',
  preparation: '1. Hervir el arroz.\n2. Mezclar todo.',
  finalNote: null,
  cookingMethod: 'stovetop',
  timeMinutes: 25,
  purchasePlace: 'Supermercado',
  mealTypes: ['lunch', 'dinner'],
  ingredients: [
    { foodId: 'arroz', quantityDescription: '1 taza cocida' },
    { foodId: 'atun', quantityDescription: '1 lata' },
    { foodId: 'tomate', quantityDescription: '1 unidad' },
  ],
};

const foodIds = (recipe) => recipe.ingredients.map(({ food }) => food.id);
const names = (recipes) => recipes.map((recipe) => recipe.name);

describe('recipe.service — alta y edición (criterio de cierre)', () => {
  it('crea una receta con tres ingredientes y dos tipos de comida, y la edita', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', ensalada);

    expect(created).toMatchObject({ name: ensalada.name, nutritionistId: 'nutri-1', origin: 'professional', availableInCatalog: true });
    expect(created.ingredients.map(({ order, food }) => [order, food.id])).toEqual([
      [1, 'arroz'],
      [2, 'atun'],
      [3, 'tomate'],
    ]);
    expect(created.mealTypes.map(({ mealType }) => mealType)).toEqual(['lunch', 'dinner']);

    // Reordena, cambia una cantidad, reemplaza un ingrediente y un tipo de comida.
    const updated = await service.update(created.id, 'nutri-1', {
      ...ensalada,
      name: 'Ensalada de atún y arroz',
      timeMinutes: null,
      mealTypes: ['lunch', 'afternoon_snack'],
      ingredients: [
        { foodId: 'atun', quantityDescription: '2 latas' },
        { foodId: 'arroz', quantityDescription: '1 taza cocida' },
        { foodId: 'lechuga', quantityDescription: 'A gusto' },
      ],
    });

    expect(updated).toMatchObject({ id: created.id, name: 'Ensalada de atún y arroz', timeMinutes: null });
    expect(updated.ingredients.map(({ order, quantityDescription, food }) => [order, food.id, quantityDescription])).toEqual([
      [1, 'atun', '2 latas'],
      [2, 'arroz', '1 taza cocida'],
      [3, 'lechuga', 'A gusto'],
    ]);
    expect(updated.mealTypes.map(({ mealType }) => mealType)).toEqual(['lunch', 'afternoon_snack']);
    expect(await service.get(created.id, 'nutri-1')).toEqual(updated);
  });

  it('acepta un alimento privado propio como ingrediente', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-1', { ...ensalada, ingredients: [{ foodId: 'kefir-1', quantityDescription: null }] });

    expect(foodIds(created)).toEqual(['kefir-1']);
  });

  it.each([
    ['un alimento inexistente', 'no-existe', 'El alimento no existe'],
    ['un alimento privado de otro nutricionista', 'caballa-2', 'El alimento no existe'],
    ['un alimento dado de baja', 'baja', 'El alimento está dado de baja'],
  ])('rechaza con 400 en ingredients %s', async (_label, foodId, message) => {
    const { service, recipeRepository } = buildService();

    await expect(
      service.create('nutri-1', { ...ensalada, ingredients: [...ensalada.ingredients, { foodId, quantityDescription: null }] }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details: { fields: { ingredients: message } } });
    expect(recipeRepository.store).toHaveLength(0);
  });

  it('un alimento dado de baja que ya estaba en la receta se puede conservar al editar', async () => {
    const { service, recipeRepository } = buildService();
    const created = await service.create('nutri-1', ensalada);
    // Simula que el administrador dio de baja el atún después de cargar la receta.
    recipeRepository.store[0].ingredients[1].food.id = 'baja';
    const withInactive = [ensalada.ingredients[0], { foodId: 'baja', quantityDescription: '1 lata' }];

    const updated = await service.update(created.id, 'nutri-1', { ...ensalada, ingredients: withInactive });

    expect(foodIds(updated)).toEqual(['arroz', 'baja']);
  });
});

describe('recipe.service — aislamiento por nutricionista (RNF-05)', () => {
  it('una receta de otro nutricionista da 404 al leerla y al editarla, y no se modifica', async () => {
    const { service } = buildService();
    const created = await service.create('nutri-1', ensalada);

    await expect(service.get(created.id, 'nutri-2')).rejects.toMatchObject({ status: 404, message: 'Receta no encontrada' });
    await expect(service.update(created.id, 'nutri-2', { ...ensalada, name: 'Pisada' })).rejects.toMatchObject({
      status: 404,
      message: 'Receta no encontrada',
    });
    expect((await service.get(created.id, 'nutri-1')).name).toBe(ensalada.name);
  });

  it('una receta inexistente da el mismo 404', async () => {
    const { service } = buildService();

    await expect(service.get('no-existe', 'nutri-1')).rejects.toMatchObject({ status: 404, message: 'Receta no encontrada' });
  });

  it('el listado trae solo las recetas propias', async () => {
    const { service } = buildService();
    await service.create('nutri-1', ensalada);
    await service.create('nutri-2', { ...ensalada, name: 'Ensalada de la otra' });

    expect(names(await service.list('nutri-1'))).toEqual([ensalada.name]);
    expect(names(await service.list('nutri-2'))).toEqual(['Ensalada de la otra']);
  });

  it('el servicio no expone borrado: la baja es lógica', () => {
    const { service } = buildService();

    expect(Object.keys(service).sort()).toEqual(['create', 'get', 'list', 'setAvailability', 'update', 'upsertCommon']);
  });
});

describe('recipe.service — baja lógica y listado', () => {
  it('cambia solo disponibilidad por PATCH y admite repetir la baja o reactivar', async () => {
    const { service } = buildService();
    const created = await service.create('nutri-1', ensalada);
    const updated = await service.update(created.id, 'nutri-1', { ...ensalada, name: 'Edición más reciente' });

    for (const availableInCatalog of [false, false, true]) {
      expect(await service.setAvailability(created.id, 'nutri-1', { availableInCatalog }))
        .toEqual({ ...updated, availableInCatalog });
      expect(await service.list('nutri-1')).toHaveLength(availableInCatalog ? 1 : 0);
    }
  });

  it('no cambia disponibilidad de una común, ajena o inexistente', async () => {
    const { service, recipeRepository } = buildService();
    const own = await service.create('nutri-1', ensalada);
    const common = await service.upsertCommon(ensalada);
    const before = structuredClone(recipeRepository.store);

    await expect(service.setAvailability(own.id, 'nutri-2', { availableInCatalog: false })).rejects.toMatchObject({ status: 404 });
    await expect(service.setAvailability('no-existe', 'nutri-1', { availableInCatalog: false })).rejects.toMatchObject({ status: 404 });
    await expect(service.setAvailability(common.id, 'nutri-1', { availableInCatalog: false })).rejects.toMatchObject({ status: 403 });
    expect(recipeRepository.store).toEqual(before);
  });

  it('responde 404 si la receta deja de ser propia antes de escribir', async () => {
    const { service, recipeRepository } = buildService();
    const own = await service.create('nutri-1', ensalada);
    vi.spyOn(recipeRepository, 'setAvailabilityOwn').mockResolvedValue(null);

    await expect(service.setAvailability(own.id, 'nutri-1', { availableInCatalog: false })).rejects.toMatchObject({ status: 404 });
  });

  it('la baja por PUT oculta la receta del listado, salvo includeUnavailable, y se puede reactivar', async () => {
    const { service } = buildService();
    const created = await service.create('nutri-1', ensalada);

    const dadaDeBaja = await service.update(created.id, 'nutri-1', { ...ensalada, availableInCatalog: false });

    expect(dadaDeBaja.availableInCatalog).toBe(false);
    expect(await service.list('nutri-1')).toEqual([]);
    expect(names(await service.list('nutri-1', { includeUnavailable: true }))).toEqual([ensalada.name]);
    expect(await service.get(created.id, 'nutri-1')).toMatchObject({ availableInCatalog: false });

    await service.update(created.id, 'nutri-1', { ...ensalada, availableInCatalog: true });
    expect(names(await service.list('nutri-1'))).toEqual([ensalada.name]);
  });

  it('sin availableInCatalog, la edición conserva el valor que tenía', async () => {
    const { service } = buildService();
    const created = await service.create('nutri-1', ensalada);
    await service.update(created.id, 'nutri-1', { ...ensalada, availableInCatalog: false });

    const updated = await service.update(created.id, 'nutri-1', { ...ensalada, name: 'Otra' });

    expect(updated.availableInCatalog).toBe(false);
  });

  it('filtra por tipo de comida: una receta con varios tipos aparece en cada uno', async () => {
    const { service } = buildService();
    await service.create('nutri-1', ensalada);
    await service.create('nutri-1', { ...ensalada, name: 'Avena', mealTypes: ['breakfast'] });

    expect(names(await service.list('nutri-1', { mealType: 'lunch' }))).toEqual([ensalada.name]);
    expect(names(await service.list('nutri-1', { mealType: 'dinner' }))).toEqual([ensalada.name]);
    expect(names(await service.list('nutri-1', { mealType: 'breakfast' }))).toEqual(['Avena']);
    expect(await service.list('nutri-1', { mealType: 'afternoon_snack' })).toEqual([]);
  });
});

describe('recipe.service — filtro por condiciones del paciente (RF-28)', () => {
  async function seed(service) {
    await service.create('nutri-1', ensalada);
    await service.create('nutri-1', {
      ...ensalada,
      name: 'Arroz con verduras',
      ingredients: [
        { foodId: 'arroz', quantityDescription: null },
        { foodId: 'tomate', quantityDescription: null },
      ],
    });
  }

  it('un rechazo a un grupo excluye las recetas con alimentos de sus subgrupos', async () => {
    const { service, patientConditionRepository } = buildService({
      conditions: [{ type: 'rejection', foodId: null, foodGroupId: 'carnes' }],
    });
    await seed(service);

    expect(names(await service.list('nutri-1', { patientId: 'paciente-1' }))).toEqual(['Arroz con verduras']);
    expect(patientConditionRepository.findAllForPatient).toHaveBeenCalledWith('paciente-1', 'nutri-1');
  });

  it('una alergia a un alimento excluye las recetas que lo tienen', async () => {
    const { service } = buildService({ conditions: [{ type: 'allergy', foodId: 'tomate', foodGroupId: null }] });
    await seed(service);

    expect(await service.list('nutri-1', { patientId: 'paciente-1' })).toEqual([]);
  });

  it('un paciente sin condiciones ve todas las recetas', async () => {
    const { service } = buildService();
    await seed(service);

    expect(await service.list('nutri-1', { patientId: 'paciente-1' })).toHaveLength(2);
  });

  it('combina el filtro con el tipo de comida', async () => {
    const { service } = buildService();
    await seed(service);
    await service.create('nutri-1', { ...ensalada, name: 'Avena', mealTypes: ['breakfast'] });

    expect(names(await service.list('nutri-1', { patientId: 'paciente-1', mealType: 'breakfast' }))).toEqual(['Avena']);
  });

  it('un paciente de otro nutricionista o inexistente da 404 y no lee sus condiciones', async () => {
    const { service, patientConditionRepository } = buildService();

    await expect(service.list('nutri-2', { patientId: 'paciente-1' })).rejects.toMatchObject({
      status: 404,
      message: 'Paciente no encontrado',
    });
    await expect(service.list('nutri-1', { patientId: 'no-existe' })).rejects.toMatchObject({ status: 404 });
    expect(patientConditionRepository.findAllForPatient).not.toHaveBeenCalled();
  });
});

describe('recipe.service — recetas básicas comunes (T30)', () => {
  // La común se carga como lo hace el seed: por el servicio.
  async function seedCommon(service, overrides = {}) {
    return service.upsertCommon({ ...ensalada, name: 'Ensalada básica', ...overrides });
  }

  it('una común es visible para los dos nutricionistas, en el listado y por id', async () => {
    const { service } = buildService();
    const common = await seedCommon(service);
    await service.create('nutri-1', ensalada);

    expect(names(await service.list('nutri-1'))).toEqual(['Ensalada básica', ensalada.name]);
    expect(names(await service.list('nutri-2'))).toEqual(['Ensalada básica']);
    expect(await service.get(common.id, 'nutri-1')).toMatchObject({ id: common.id, nutritionistId: null });
    expect(await service.get(common.id, 'nutri-2')).toMatchObject({ id: common.id, nutritionistId: null });
  });

  it('una privada de otro nutricionista sigue dando 404 aunque haya comunes', async () => {
    const { service } = buildService();
    await seedCommon(service);
    const own = await service.create('nutri-1', ensalada);

    await expect(service.get(own.id, 'nutri-2')).rejects.toMatchObject({ status: 404, message: 'Receta no encontrada' });
  });

  it.each([
    ['editarla', { name: 'Ensalada mía' }],
    ['darla de baja', { availableInCatalog: false }],
  ])('%s da 403 y la común no cambia', async (_label, changes) => {
    const { service } = buildService();
    const common = await seedCommon(service);

    for (const nutritionistId of ['nutri-1', 'nutri-2']) {
      await expect(service.update(common.id, nutritionistId, { ...ensalada, ...changes })).rejects.toMatchObject({
        status: 403,
        message: 'Las recetas comunes son de solo lectura',
      });
    }
    expect(await service.get(common.id, 'nutri-1')).toMatchObject({ name: 'Ensalada básica', availableInCatalog: true });
  });

  it('RF-28 excluye una común con un ingrediente restringido, igual que a una propia', async () => {
    const { service } = buildService({ conditions: [{ type: 'allergy', foodId: 'atun', foodGroupId: null }] });
    await seedCommon(service);
    await seedCommon(service, {
      name: 'Arroz con tomate básico',
      ingredients: [
        { foodId: 'arroz', quantityDescription: null },
        { foodId: 'tomate', quantityDescription: null },
      ],
    });
    await service.create('nutri-1', ensalada);

    expect(names(await service.list('nutri-1', { patientId: 'paciente-1' }))).toEqual(['Arroz con tomate básico']);
  });

  it.each([
    ['un alimento privado', 'kefir-1', 'Una receta común solo lleva alimentos comunes'],
    ['un alimento inexistente', 'no-existe', 'Una receta común solo lleva alimentos comunes'],
    ['un alimento dado de baja', 'baja', 'El alimento está dado de baja'],
  ])('una común con %s se rechaza con 400 en ingredients y no se guarda', async (_label, foodId, message) => {
    const { service, recipeRepository } = buildService();

    await expect(
      seedCommon(service, { ingredients: [...ensalada.ingredients, { foodId, quantityDescription: null }] }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details: { fields: { ingredients: message } } });
    expect(recipeRepository.upsertCommon).not.toHaveBeenCalled();
    expect(recipeRepository.store).toHaveLength(0);
  });

  it('con ingredientes comunes, la guarda sin dueño', async () => {
    const { service, recipeRepository } = buildService();

    const common = await seedCommon(service);

    expect(common.nutritionistId).toBeNull();
    expect(recipeRepository.upsertCommon).toHaveBeenCalledWith(
      expect.not.objectContaining({ ingredients: expect.anything() }),
      ensalada.ingredients,
      ensalada.mealTypes,
    );
  });
});
