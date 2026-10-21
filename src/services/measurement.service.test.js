const { createMeasurementService } = require('./measurement.service');

const OWN_PATIENT = '11111111-1111-1111-1111-111111111111';
const OTHER_PATIENT = '22222222-2222-2222-2222-222222222222';
const OWN_CONSULTATION = '44444444-4444-4444-4444-444444444444';
const OTHERS_CONSULTATION = '55555555-5555-5555-5555-555555555555';

const patients = [
  { id: OWN_PATIENT, nutritionistId: 'nutri-1' },
  { id: OTHER_PATIENT, nutritionistId: 'nutri-2' },
];
const consultations = [
  { id: OWN_CONSULTATION, patientId: OWN_PATIENT },
  { id: OTHERS_CONSULTATION, patientId: OTHER_PATIENT },
];

const day = (value) => new Date(`${value}T00:00:00.000Z`);

// Repositorios en memoria que filtran por nutricionista como los reales. Los
// valores se guardan como string, igual que el Decimal de Prisma, para que el
// test cubra la conversión a número. touchedPatients registra a qué paciente se
// le movió updatedAt.
function buildService(initialMeasurements = []) {
  const measurements = initialMeasurements.map((measurement) => ({ ...measurement }));
  const touchedPatients = [];
  let nextId = 1;

  const owns = (patientId, nutritionistId) =>
    patients.some((patient) => patient.id === patientId && patient.nutritionistId === nutritionistId);
  const ownMeasurement = (id, patientId, nutritionistId) =>
    owns(patientId, nutritionistId)
      ? measurements.find((measurement) => measurement.id === id && measurement.patientId === patientId) || null
      : null;
  const stored = (data) => ({ ...data, value: String(data.value) });

  const measurementRepository = {
    findAllForPatient: vi.fn(async (patientId, nutritionistId) =>
      owns(patientId, nutritionistId)
        ? measurements.filter((measurement) => measurement.patientId === patientId).sort((a, b) => b.date - a.date)
        : [],
    ),
    findByIdForPatient: vi.fn(async (id, patientId, nutritionistId) => ownMeasurement(id, patientId, nutritionistId)),
    create: vi.fn(async (patientId, nutritionistId, data) => {
      const measurement = { id: `m-${nextId}`, patientId, ...stored(data) };
      nextId += 1;
      measurements.push(measurement);
      touchedPatients.push(patientId);
      return measurement;
    }),
    updateForPatient: vi.fn(async (id, patientId, nutritionistId, data) => {
      const measurement = ownMeasurement(id, patientId, nutritionistId);
      if (!measurement) return false;
      Object.assign(measurement, stored(data));
      touchedPatients.push(patientId);
      return true;
    }),
    deleteForPatient: vi.fn(async (id, patientId, nutritionistId) => {
      const measurement = ownMeasurement(id, patientId, nutritionistId);
      if (!measurement) return false;
      measurements.splice(measurements.indexOf(measurement), 1);
      touchedPatients.push(patientId);
      return true;
    }),
  };

  const service = createMeasurementService({
    patientRepository: {
      findByIdForNutritionist: async (id, nutritionistId) =>
        patients.find((patient) => patient.id === id && patient.nutritionistId === nutritionistId) || null,
    },
    measurementRepository,
    consultationRepository: {
      findByIdForPatient: async (id, patientId, nutritionistId) =>
        owns(patientId, nutritionistId)
          ? consultations.find((consultation) => consultation.id === id && consultation.patientId === patientId) || null
          : null,
    },
  });

  return { service, repository: measurementRepository, measurements, touchedPatients };
}

// Lo que deja el schema Zod: los opcionales que no vienen, en null.
function input(data) {
  return { detail: null, unit: null, consultationId: null, ...data };
}

const othersWeight = { id: 'm-other', patientId: OTHER_PATIENT, type: 'weight', value: '80', unit: 'kg', date: day('2026-09-01') };
const ownWeight = input({ type: 'weight', value: 70.2, unit: 'kg', date: day('2026-09-01') });

describe('measurement.service — aislamiento por nutricionista', () => {
  it.each([
    ['list', (service) => service.list(OTHER_PATIENT, 'nutri-1')],
    ['create', (service) => service.create(OTHER_PATIENT, 'nutri-1', ownWeight)],
    ['update', (service) => service.update('m-other', OTHER_PATIENT, 'nutri-1', ownWeight)],
    ['remove', (service) => service.remove('m-other', OTHER_PATIENT, 'nutri-1')],
  ])('%s sobre un paciente de otro nutricionista responde 404 sin tocar sus mediciones', async (_op, run) => {
    const { service, repository, measurements, touchedPatients } = buildService([othersWeight]);

    await expect(run(service)).rejects.toMatchObject({ status: 404, message: 'Paciente no encontrado' });
    Object.values(repository).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(measurements).toEqual([othersWeight]);
    expect(touchedPatients).toEqual([]);
  });

  it.each([
    ['update', (service) => service.update('m-other', OWN_PATIENT, 'nutri-1', ownWeight)],
    ['remove', (service) => service.remove('m-other', OWN_PATIENT, 'nutri-1')],
  ])('%s con el id de una medición de otro paciente responde 404', async (_op, run) => {
    const { service, measurements, touchedPatients } = buildService([othersWeight]);

    await expect(run(service)).rejects.toMatchObject({ status: 404, message: 'Medición no encontrada' });
    expect(measurements).toEqual([othersWeight]);
    expect(touchedPatients).toEqual([]);
  });

  it.each([
    ['de otro paciente', OTHERS_CONSULTATION],
    ['inexistente', '66666666-6666-6666-6666-666666666666'],
  ])('una consulta %s responde 400 en consultationId sin guardar nada', async (_caso, consultationId) => {
    const { service, repository } = buildService();

    await expect(service.create(OWN_PATIENT, 'nutri-1', { ...ownWeight, consultationId })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fields: { consultationId: 'La consulta no existe' } },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('el PUT tampoco acepta una consulta de otro paciente', async () => {
    const { service, repository } = buildService();
    const created = await service.create(OWN_PATIENT, 'nutri-1', ownWeight);

    await expect(
      service.update(created.id, OWN_PATIENT, 'nutri-1', { ...ownWeight, consultationId: OTHERS_CONSULTATION }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.updateForPatient).not.toHaveBeenCalled();
  });
});

describe('measurement.service — histórico de mediciones y laboratorio', () => {
  it('registra peso, talla y un valor de laboratorio en una consulta, y el histórico trae el IMC del peso', async () => {
    const { service } = buildService([othersWeight]);
    const inConsultation = { consultationId: OWN_CONSULTATION, date: day('2026-09-01') };

    await service.create(OWN_PATIENT, 'nutri-1', { ...ownWeight, ...inConsultation });
    await service.create(OWN_PATIENT, 'nutri-1', input({ type: 'height', value: 165, unit: 'cm', ...inConsultation }));
    await service.create(OWN_PATIENT, 'nutri-1', input({ type: 'glucose', value: 98, unit: 'mg/dL', ...inConsultation }));

    const history = await service.list(OWN_PATIENT, 'nutri-1');

    expect(history.map(({ type, value, bmi }) => ({ type, value, bmi }))).toEqual([
      { type: 'weight', value: 70.2, bmi: 25.8 },
      { type: 'height', value: 165, bmi: null },
      { type: 'glucose', value: 98, bmi: null },
    ]);
    expect(history.every((measurement) => measurement.patientId === OWN_PATIENT)).toBe(true);
  });

  it('un peso con una talla de una fecha anterior trae el IMC; uno sin talla previa, null', async () => {
    const { service } = buildService();

    await service.create(OWN_PATIENT, 'nutri-1', input({ type: 'weight', value: 72, unit: 'kg', date: day('2026-01-10') }));
    await service.create(OWN_PATIENT, 'nutri-1', input({ type: 'height', value: 165, unit: 'cm', date: day('2026-03-01') }));
    await service.create(OWN_PATIENT, 'nutri-1', ownWeight);

    const history = await service.list(OWN_PATIENT, 'nutri-1');

    expect(history.find((m) => m.value === 70.2).bmi).toBe(25.8);
    expect(history.find((m) => m.value === 72).bmi).toBeNull();
  });

  it('la respuesta del alta trae el IMC calculado contra el histórico', async () => {
    const { service } = buildService();
    await service.create(OWN_PATIENT, 'nutri-1', input({ type: 'height', value: 165, unit: 'cm', date: day('2026-03-01') }));

    const created = await service.create(OWN_PATIENT, 'nutri-1', ownWeight);

    expect(created).toMatchObject({ type: 'weight', value: 70.2, bmi: 25.8 });
  });

  it('un paciente sin mediciones ni laboratorio devuelve un histórico vacío (RF-12)', async () => {
    const { service } = buildService([othersWeight]);

    expect(await service.list(OWN_PATIENT, 'nutri-1')).toEqual([]);
  });

  it('una medición suelta, sin consulta, se guarda', async () => {
    const { service, repository } = buildService();

    const created = await service.create(OWN_PATIENT, 'nutri-1', ownWeight);

    expect(repository.create).toHaveBeenCalledWith(OWN_PATIENT, 'nutri-1', ownWeight);
    expect(created.consultationId).toBeNull();
  });

  it('el PUT reemplaza la medición completa y recalcula el IMC', async () => {
    const { service } = buildService();
    await service.create(OWN_PATIENT, 'nutri-1', input({ type: 'height', value: 165, unit: 'cm', date: day('2026-03-01') }));
    const created = await service.create(OWN_PATIENT, 'nutri-1', ownWeight);

    const updated = await service.update(created.id, OWN_PATIENT, 'nutri-1', { ...ownWeight, value: 68.1 });

    expect(updated).toMatchObject({ id: created.id, value: 68.1, bmi: 25 });
  });

  it('guardar, editar o eliminar una medición actualiza al paciente (última actualización)', async () => {
    const { service, touchedPatients } = buildService();

    const created = await service.create(OWN_PATIENT, 'nutri-1', ownWeight);
    await service.update(created.id, OWN_PATIENT, 'nutri-1', { ...ownWeight, value: 69 });
    await service.remove(created.id, OWN_PATIENT, 'nutri-1');

    expect(touchedPatients).toEqual([OWN_PATIENT, OWN_PATIENT, OWN_PATIENT]);
  });

  it('remove elimina la medición propia', async () => {
    const { service, measurements } = buildService([othersWeight]);
    const created = await service.create(OWN_PATIENT, 'nutri-1', ownWeight);

    await service.remove(created.id, OWN_PATIENT, 'nutri-1');

    expect(measurements).toEqual([othersWeight]);
  });
});
