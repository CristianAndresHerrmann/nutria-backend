const { createRecommendationService } = require('./recommendation.service');

const PATHOLOGIES = [
  { id: 'celiaquia', name: 'Celiaquía' },
  { id: 'diabetes', name: 'Diabetes' },
];

// Repositorio fake en memoria con el mismo aislamiento que el real: cada
// nutricionista ve las comunes y las suyas, y edita solo las suyas.
function createFakeRecommendationRepository(initial) {
  const store = initial.map((recommendation) => ({ ...recommendation }));
  let nextId = 1;
  const visible = (item, nutritionistId) => item.nutritionistId === null || item.nutritionistId === nutritionistId;

  return {
    store,
    async findVisible(nutritionistId, { pathologyId = null, includeInactive = false } = {}) {
      return store.filter(
        (item) =>
          visible(item, nutritionistId) &&
          (includeInactive || item.active) &&
          (!pathologyId || item.pathologyId === pathologyId),
      );
    },
    async findVisibleById(id, nutritionistId) {
      return store.find((item) => item.id === id && visible(item, nutritionistId)) || null;
    },
    async createPrivate(nutritionistId, data) {
      const recommendation = { active: true, ...data, id: `nueva-${nextId++}`, nutritionistId };
      store.push(recommendation);
      return recommendation;
    },
    async updateOwn(id, nutritionistId, data) {
      const index = store.findIndex((item) => item.id === id && item.nutritionistId === nutritionistId);
      if (index === -1) return null;
      store[index] = { ...store[index], ...data };
      return store[index];
    },
  };
}

function buildService() {
  const recommendationRepository = createFakeRecommendationRepository([
    { id: 'comun', pathologyId: 'celiaquia', nutritionistId: null, title: 'Común', text: 'Texto', active: true },
    { id: 'propia', pathologyId: 'celiaquia', nutritionistId: 'nutri-1', title: 'Propia', text: 'Texto', active: true },
    { id: 'baja', pathologyId: 'diabetes', nutritionistId: 'nutri-1', title: 'De baja', text: 'Texto', active: false },
    { id: 'ajena', pathologyId: 'diabetes', nutritionistId: 'nutri-2', title: 'Ajena', text: 'Texto', active: true },
  ]);
  const pathologyRepository = {
    async findById(id) {
      return PATHOLOGIES.find((pathology) => pathology.id === id) || null;
    },
  };
  return {
    repository: recommendationRepository,
    service: createRecommendationService({ recommendationRepository, pathologyRepository }),
  };
}

const ids = (items) => items.map(({ id }) => id);
const body = { pathologyId: 'diabetes', title: 'Editada', text: 'Texto nuevo' };

describe('recommendation.service — listado y lectura', () => {
  it('lista las comunes y las propias vigentes, nunca las privadas de otro', async () => {
    const { service } = buildService();

    expect(ids(await service.list('nutri-1'))).toEqual(['comun', 'propia']);
    expect(ids(await service.list('nutri-2'))).toEqual(['comun', 'ajena']);
  });

  it('filtra por patología e incluye las dadas de baja si se pide', async () => {
    const { service } = buildService();

    expect(ids(await service.list('nutri-1', { pathologyId: 'diabetes', includeInactive: true }))).toEqual(['baja']);
    expect(ids(await service.list('nutri-1', { pathologyId: 'diabetes' }))).toEqual([]);
  });

  it('obtiene una común o una propia, aunque esté dada de baja', async () => {
    const { service } = buildService();

    expect((await service.get('comun', 'nutri-1')).id).toBe('comun');
    expect((await service.get('baja', 'nutri-1')).id).toBe('baja');
  });

  it('una privada de otro nutricionista da el mismo 404 que una inexistente', async () => {
    const { service } = buildService();
    const notFound = { status: 404, message: 'Recomendación no encontrada' };

    await expect(service.get('ajena', 'nutri-1')).rejects.toMatchObject(notFound);
    await expect(service.get('no-existe', 'nutri-1')).rejects.toMatchObject(notFound);
  });
});

describe('recommendation.service — alta', () => {
  it('la recomendación queda privada del nutricionista del token y nace vigente', async () => {
    const { service } = buildService();

    const created = await service.create('nutri-2', body);

    expect(created).toMatchObject({ ...body, nutritionistId: 'nutri-2', active: true });
    expect(ids(await service.list('nutri-1'))).not.toContain(created.id);
  });

  it('una patología inexistente responde 400 en details.fields.pathologyId', async () => {
    const { service, repository } = buildService();

    await expect(service.create('nutri-1', { ...body, pathologyId: 'no-existe' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { pathologyId: 'La patología no existe' } },
    });
    expect(repository.store).toHaveLength(4);
  });
});

describe('recommendation.service — edición y baja lógica', () => {
  it('edita una propia y conserva active si no viene', async () => {
    const { service } = buildService();

    const updated = await service.update('baja', 'nutri-1', body);

    expect(updated).toMatchObject({ ...body, active: false });
  });

  it('da de baja y reactiva una propia', async () => {
    const { service } = buildService();

    expect((await service.update('propia', 'nutri-1', { ...body, active: false })).active).toBe(false);
    expect((await service.update('propia', 'nutri-1', { ...body, active: true })).active).toBe(true);
  });

  it('una común responde 403 y no se modifica', async () => {
    const { service, repository } = buildService();

    await expect(service.update('comun', 'nutri-1', { ...body, active: false })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Las recomendaciones comunes son de solo lectura',
    });
    expect(repository.store.find(({ id }) => id === 'comun')).toMatchObject({ title: 'Común', active: true });
  });

  it('una privada de otro responde 404 y no se modifica', async () => {
    const { service, repository } = buildService();

    await expect(service.update('ajena', 'nutri-1', { ...body, active: false })).rejects.toMatchObject({
      status: 404,
      message: 'Recomendación no encontrada',
    });
    expect(repository.store.find(({ id }) => id === 'ajena')).toMatchObject({ title: 'Ajena', active: true });
  });

  it('una patología inexistente responde 400 al editar', async () => {
    const { service } = buildService();

    await expect(service.update('propia', 'nutri-1', { ...body, pathologyId: 'no-existe' })).rejects.toMatchObject({
      status: 400,
      details: { fields: { pathologyId: 'La patología no existe' } },
    });
  });
});
