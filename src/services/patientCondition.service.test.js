const { createPatientConditionService } = require('./patientCondition.service');

const OWN_PATIENT = '11111111-1111-1111-1111-111111111111';
const OTHER_PATIENT = '22222222-2222-2222-2222-222222222222';
const PATHOLOGY_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const GROUP_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const FOOD_ID = 'aaaaaaaa-0000-0000-0000-000000000003';
const INACTIVE_FOOD_ID = 'aaaaaaaa-0000-0000-0000-000000000004';
const OTHERS_PRIVATE_FOOD_ID = 'aaaaaaaa-0000-0000-0000-000000000005';
const MISSING_ID = 'aaaaaaaa-0000-0000-0000-0000000000ff';

const patients = [
  { id: OWN_PATIENT, nutritionistId: 'nutri-1' },
  { id: OTHER_PATIENT, nutritionistId: 'nutri-2' },
];
const foods = [
  { id: FOOD_ID, active: true, nutritionistId: null },
  { id: INACTIVE_FOOD_ID, active: false, nutritionistId: null },
  { id: OTHERS_PRIVATE_FOOD_ID, active: true, nutritionistId: 'nutri-2' },
];

// Repositorios en memoria que filtran por nutricionista como los reales.
function buildService(initialConditions = []) {
  const conditions = initialConditions.map((condition) => ({ ...condition }));
  let nextId = 1;

  const owns = (patientId, nutritionistId) =>
    patients.some((patient) => patient.id === patientId && patient.nutritionistId === nutritionistId);
  const ownCondition = (id, patientId, nutritionistId) =>
    owns(patientId, nutritionistId)
      ? conditions.find((condition) => condition.id === id && condition.patientId === patientId) || null
      : null;

  const patientConditionRepository = {
    findAllForPatient: vi.fn(async (patientId, nutritionistId) =>
      owns(patientId, nutritionistId) ? conditions.filter((condition) => condition.patientId === patientId) : [],
    ),
    findByIdForPatient: vi.fn(async (id, patientId, nutritionistId) => ownCondition(id, patientId, nutritionistId)),
    findDuplicate: vi.fn(async (patientId, nutritionistId, target, excludeId) => {
      if (!owns(patientId, nutritionistId)) return null;
      return (
        conditions.find(
          (condition) =>
            condition.patientId === patientId &&
            condition.id !== excludeId &&
            ['type', 'pathologyId', 'foodId', 'foodGroupId'].every((key) => condition[key] === target[key]),
        ) || null
      );
    }),
    create: vi.fn(async (patientId, data) => {
      const condition = { id: `c-${nextId++}`, patientId, registeredAt: new Date('2026-10-19'), ...data };
      conditions.push(condition);
      return condition;
    }),
    updateForPatient: vi.fn(async (id, patientId, nutritionistId, data) => {
      const condition = ownCondition(id, patientId, nutritionistId);
      if (!condition) return null;
      return Object.assign(condition, data);
    }),
    deleteForPatient: vi.fn(async (id, patientId, nutritionistId) => {
      const condition = ownCondition(id, patientId, nutritionistId);
      if (!condition) return false;
      conditions.splice(conditions.indexOf(condition), 1);
      return true;
    }),
  };

  const service = createPatientConditionService({
    patientRepository: {
      findByIdForNutritionist: async (id, nutritionistId) =>
        patients.find((patient) => patient.id === id && patient.nutritionistId === nutritionistId) || null,
    },
    patientConditionRepository,
    foodRepository: {
      findVisibleById: async (id, nutritionistId) =>
        foods.find(
          (food) => food.id === id && (food.nutritionistId === null || food.nutritionistId === nutritionistId),
        ) || null,
    },
    foodGroupRepository: { findById: async (id) => (id === GROUP_ID ? { id } : null) },
    pathologyRepository: { findById: async (id) => (id === PATHOLOGY_ID ? { id } : null) },
  });

  return { service, repository: patientConditionRepository, conditions };
}

// Lo que deja el schema Zod: los destinos que no vienen, en null.
function input(data) {
  return { pathologyId: null, foodId: null, foodGroupId: null, registeredAt: null, observations: null, ...data };
}

const allergy = input({ type: 'allergy', foodId: FOOD_ID });
const existingAllergy = { id: 'c-own', patientId: OWN_PATIENT, ...allergy, registeredAt: new Date('2026-09-01') };
const othersCondition = { id: 'c-other', patientId: OTHER_PATIENT, ...allergy };

describe('patientCondition.service — aislamiento por nutricionista', () => {
  it('lista solo las condiciones del paciente propio', async () => {
    const { service } = buildService([existingAllergy, othersCondition]);

    expect(await service.list(OWN_PATIENT, 'nutri-1')).toEqual([existingAllergy]);
  });

  it.each([
    ['list', (service) => service.list(OTHER_PATIENT, 'nutri-1')],
    ['create', (service) => service.create(OTHER_PATIENT, 'nutri-1', allergy)],
    ['update', (service) => service.update('c-other', OTHER_PATIENT, 'nutri-1', allergy)],
    ['remove', (service) => service.remove('c-other', OTHER_PATIENT, 'nutri-1')],
  ])('%s sobre un paciente de otro nutricionista responde 404 sin tocar sus condiciones', async (_op, run) => {
    const { service, repository, conditions } = buildService([othersCondition]);

    await expect(run(service)).rejects.toMatchObject({ status: 404, message: 'Paciente no encontrado' });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateForPatient).not.toHaveBeenCalled();
    expect(repository.deleteForPatient).not.toHaveBeenCalled();
    expect(conditions).toEqual([othersCondition]);
  });

  it.each([
    ['update', (service) => service.update('c-other', OWN_PATIENT, 'nutri-1', allergy)],
    ['remove', (service) => service.remove('c-other', OWN_PATIENT, 'nutri-1')],
  ])('%s con el id de una condición de otro paciente responde 404', async (_op, run) => {
    const { service, conditions } = buildService([othersCondition]);

    await expect(run(service)).rejects.toMatchObject({ status: 404, message: 'Condición no encontrada' });
    expect(conditions).toEqual([othersCondition]);
  });
});

describe('patientCondition.service — alta', () => {
  it.each([
    ['una alergia a un alimento', input({ type: 'allergy', foodId: FOOD_ID })],
    ['un rechazo a un grupo', input({ type: 'rejection', foodGroupId: GROUP_ID })],
    ['una patología', input({ type: 'pathology', pathologyId: PATHOLOGY_ID })],
    ['una intolerancia sin patología asociada (RF-07)', input({ type: 'intolerance', foodId: FOOD_ID })],
  ])('registra %s', async (_caso, data) => {
    const { service } = buildService();

    const created = await service.create(OWN_PATIENT, 'nutri-1', data);

    expect(created).toMatchObject({ patientId: OWN_PATIENT, type: data.type });
  });

  it('sin fecha de registro deja que la ponga la base', async () => {
    const { service, repository } = buildService();

    await service.create(OWN_PATIENT, 'nutri-1', allergy);

    expect(repository.create.mock.calls[0][1]).not.toHaveProperty('registeredAt');
  });

  it.each([
    ['una patología inexistente', input({ type: 'pathology', pathologyId: MISSING_ID }), 'pathologyId'],
    ['un grupo inexistente', input({ type: 'rejection', foodGroupId: MISSING_ID }), 'foodGroupId'],
    ['un alimento inexistente', input({ type: 'allergy', foodId: MISSING_ID }), 'foodId'],
    ['un alimento privado de otro nutricionista', input({ type: 'allergy', foodId: OTHERS_PRIVATE_FOOD_ID }), 'foodId'],
    ['un alimento dado de baja', input({ type: 'allergy', foodId: INACTIVE_FOOD_ID }), 'foodId'],
  ])('rechaza %s con 400 VALIDATION_ERROR en su campo', async (_caso, data, field) => {
    const { service, repository } = buildService();

    const error = await service.create(OWN_PATIENT, 'nutri-1', data).catch((e) => e);

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(error.details.fields).toHaveProperty(field);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ['la misma alergia', existingAllergy, allergy, 'foodId'],
    [
      'el mismo rechazo a un grupo',
      { id: 'c-g', patientId: OWN_PATIENT, ...input({ type: 'rejection', foodGroupId: GROUP_ID }) },
      input({ type: 'rejection', foodGroupId: GROUP_ID }),
      'foodGroupId',
    ],
    [
      'la misma patología',
      { id: 'c-p', patientId: OWN_PATIENT, ...input({ type: 'pathology', pathologyId: PATHOLOGY_ID }) },
      input({ type: 'pathology', pathologyId: PATHOLOGY_ID }),
      'pathologyId',
    ],
  ])('rechaza %s repetida con 409 CONFLICT en el campo del destino', async (_caso, existing, data, field) => {
    const { service, repository } = buildService([existing]);

    const error = await service.create(OWN_PATIENT, 'nutri-1', data).catch((e) => e);

    expect(error).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(error.details.fields[field]).toBe('El paciente ya tiene registrada esta condición');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('no es duplicado otro tipo sobre el mismo alimento, ni el mismo tipo en otro paciente', async () => {
    const { service } = buildService([existingAllergy, { ...othersCondition, type: 'intolerance' }]);

    await expect(service.create(OWN_PATIENT, 'nutri-1', { ...allergy, type: 'intolerance' })).resolves.toBeDefined();
  });
});

describe('patientCondition.service — edición y baja', () => {
  it('reemplaza la condición y conserva la fecha de registro si no viene', async () => {
    const { service, repository } = buildService([existingAllergy]);
    const data = input({ type: 'rejection', foodGroupId: GROUP_ID, observations: 'No le gusta' });

    const updated = await service.update('c-own', OWN_PATIENT, 'nutri-1', data);

    expect(updated).toMatchObject({ type: 'rejection', foodId: null, foodGroupId: GROUP_ID, observations: 'No le gusta' });
    expect(updated.registeredAt).toEqual(new Date('2026-09-01'));
    expect(repository.updateForPatient.mock.calls[0][3]).not.toHaveProperty('registeredAt');
  });

  it('la propia condición no cuenta como duplicado al editarla', async () => {
    const { service } = buildService([existingAllergy]);

    await expect(
      service.update('c-own', OWN_PATIENT, 'nutri-1', { ...allergy, observations: 'Urticaria' }),
    ).resolves.toMatchObject({ observations: 'Urticaria' });
  });

  it('rechaza con 409 convertirla en otra condición que ya existe', async () => {
    const intolerance = { ...existingAllergy, id: 'c-int', type: 'intolerance' };
    const { service } = buildService([existingAllergy, intolerance]);

    await expect(
      service.update('c-int', OWN_PATIENT, 'nutri-1', { ...allergy }),
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });

  it('una condición con un alimento ya dado de baja se puede seguir editando, pero no se puede pasar a uno', async () => {
    const old = { ...existingAllergy, id: 'c-old', foodId: INACTIVE_FOOD_ID };
    const { service } = buildService([old, existingAllergy]);
    const keep = input({ type: 'allergy', foodId: INACTIVE_FOOD_ID, observations: 'Sigue igual' });

    await expect(service.update('c-old', OWN_PATIENT, 'nutri-1', keep)).resolves.toMatchObject({
      observations: 'Sigue igual',
    });
    await expect(service.update('c-own', OWN_PATIENT, 'nutri-1', { ...keep, type: 'rejection' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('elimina una condición propia', async () => {
    const { service, conditions } = buildService([existingAllergy]);

    await service.remove('c-own', OWN_PATIENT, 'nutri-1');

    expect(conditions).toEqual([]);
  });

  it('eliminar una condición inexistente responde 404', async () => {
    const { service } = buildService();

    await expect(service.remove(MISSING_ID, OWN_PATIENT, 'nutri-1')).rejects.toMatchObject({
      status: 404,
      message: 'Condición no encontrada',
    });
  });
});
