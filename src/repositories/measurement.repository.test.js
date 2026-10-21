const { createMeasurementRepository } = require('./measurement.repository');

// Los tests de measurement.service usan repositorios fake. Estos verifican que
// cada consulta real a Prisma lleve el paciente y su nutricionista en el where,
// y que cada escritura toque al paciente dentro de la misma transacción.
const PATIENT_ID = 'p-1';
const OWNED = { patientId: PATIENT_ID, patient: { nutritionistId: 'nutri-1' } };
const TOUCH_PATIENT = {
  where: { id: PATIENT_ID, nutritionistId: 'nutri-1' },
  data: { updatedAt: expect.any(Date) },
};

// $transaction corre el callback con el mismo cliente fake, así los tests ven
// qué se ejecutó adentro.
function createFakePrisma({ count = 1 } = {}) {
  const prisma = {
    measurement: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'm-1' })),
      create: vi.fn(async ({ data }) => ({ id: 'm-1', ...data })),
      updateMany: vi.fn(async () => ({ count })),
      deleteMany: vi.fn(async () => ({ count })),
    },
    patient: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  prisma.$transaction = vi.fn(async (callback) => callback(prisma));
  return prisma;
}

describe('measurement.repository — filtro por paciente y nutricionista en cada consulta', () => {
  it('findAllForPatient filtra por paciente y nutricionista, de la más reciente a la más antigua', async () => {
    const prisma = createFakePrisma();

    await createMeasurementRepository({ prisma }).findAllForPatient(PATIENT_ID, 'nutri-1');

    expect(prisma.measurement.findMany).toHaveBeenCalledWith({
      where: OWNED,
      orderBy: [{ date: 'desc' }, { type: 'asc' }, { id: 'asc' }],
    });
  });

  it('findByIdForPatient filtra por id, paciente y nutricionista', async () => {
    const prisma = createFakePrisma();

    await createMeasurementRepository({ prisma }).findByIdForPatient('m-1', PATIENT_ID, 'nutri-1');

    expect(prisma.measurement.findFirst).toHaveBeenCalledWith({ where: { id: 'm-1', ...OWNED } });
  });

  it('create guarda la medición del paciente y lo toca en la misma transacción', async () => {
    const prisma = createFakePrisma();

    await createMeasurementRepository({ prisma }).create(PATIENT_ID, 'nutri-1', { type: 'weight', value: 70 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.measurement.create).toHaveBeenCalledWith({ data: { type: 'weight', value: 70, patientId: PATIENT_ID } });
    expect(prisma.patient.updateMany).toHaveBeenCalledWith(TOUCH_PATIENT);
  });

  it.each([
    ['updateForPatient', 'updateMany', (repository) => repository.updateForPatient('m-1', PATIENT_ID, 'nutri-1', { value: 71 })],
    ['deleteForPatient', 'deleteMany', (repository) => repository.deleteForPatient('m-1', PATIENT_ID, 'nutri-1')],
  ])('%s filtra por id, paciente y nutricionista y toca al paciente', async (_op, method, run) => {
    const prisma = createFakePrisma();

    expect(await run(createMeasurementRepository({ prisma }))).toBe(true);
    expect(prisma.measurement[method]).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm-1', ...OWNED } }));
    expect(prisma.patient.updateMany).toHaveBeenCalledWith(TOUCH_PATIENT);
  });

  it.each([
    ['updateForPatient', (repository) => repository.updateForPatient('m-1', PATIENT_ID, 'nutri-1', {})],
    ['deleteForPatient', (repository) => repository.deleteForPatient('m-1', PATIENT_ID, 'nutri-1')],
  ])('%s devuelve false sin tocar al paciente cuando no afectó ninguna fila', async (_op, run) => {
    const prisma = createFakePrisma({ count: 0 });

    expect(await run(createMeasurementRepository({ prisma }))).toBe(false);
    expect(prisma.patient.updateMany).not.toHaveBeenCalled();
  });

  describe.each([undefined, null, ''])('sin nutricionista (%j)', (nutritionistId) => {
    it.each([
      ['findAllForPatient', (repository) => repository.findAllForPatient(PATIENT_ID, nutritionistId)],
      ['findByIdForPatient', (repository) => repository.findByIdForPatient('m-1', PATIENT_ID, nutritionistId)],
      ['create', (repository) => repository.create(PATIENT_ID, nutritionistId, {})],
      ['updateForPatient', (repository) => repository.updateForPatient('m-1', PATIENT_ID, nutritionistId, {})],
      ['deleteForPatient', (repository) => repository.deleteForPatient('m-1', PATIENT_ID, nutritionistId)],
    ])('%s corta antes de llegar a Prisma', async (_op, run) => {
      const prisma = createFakePrisma();

      await expect(async () => run(createMeasurementRepository({ prisma }))).rejects.toThrow('consulta sin nutritionistId');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      Object.values(prisma.measurement).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    });
  });
});
