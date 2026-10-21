const { createConsultationRepository } = require('./consultation.repository');

// Los tests de consultation.service usan repositorios fake. Estos verifican que
// cada consulta real a Prisma lleve el paciente y su nutricionista en el where,
// y que guardar una consulta toque al paciente dentro de la misma transacción.
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
    consultation: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'q-1', habitsSet: [] })),
      create: vi.fn(async ({ data }) => ({ id: 'q-1', ...data })),
      updateMany: vi.fn(async () => ({ count })),
    },
    measurement: { createMany: vi.fn(async ({ data }) => ({ count: data.length })) },
    patient: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  prisma.$transaction = vi.fn(async (callback) => callback(prisma));
  return prisma;
}

describe('consultation.repository — filtro por paciente y nutricionista en cada consulta', () => {
  it('findAllForPatient filtra por paciente y nutricionista, de la más reciente a la más antigua', async () => {
    const prisma = createFakePrisma();

    await createConsultationRepository({ prisma }).findAllForPatient(PATIENT_ID, 'nutri-1');

    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: OWNED, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    );
  });

  it('findByIdForPatient filtra por id, paciente y nutricionista', async () => {
    const prisma = createFakePrisma();

    await createConsultationRepository({ prisma }).findByIdForPatient('q-1', PATIENT_ID, 'nutri-1');

    expect(prisma.consultation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q-1', ...OWNED } }),
    );
  });

  it('create guarda la consulta con sus hábitos y toca al paciente en la misma transacción', async () => {
    const prisma = createFakePrisma();
    const habits = [{ description: 'Caminar' }];

    await createConsultationRepository({ prisma }).create(PATIENT_ID, 'nutri-1', { type: 'first' }, habits);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { type: 'first', patientId: PATIENT_ID, habitsSet: { create: habits } } }),
    );
    expect(prisma.measurement.createMany).not.toHaveBeenCalled();
    expect(prisma.patient.updateMany).toHaveBeenCalledWith(TOUCH_PATIENT);
  });

  it('create guarda las mediciones en la misma transacción, con el paciente, la consulta y su fecha', async () => {
    const prisma = createFakePrisma();
    const date = new Date('2026-10-01T00:00:00.000Z');
    const measurements = [
      { type: 'weight', value: 70.2, unit: 'kg', detail: null },
      { type: 'height', value: 165, unit: 'cm', detail: null },
    ];

    await createConsultationRepository({ prisma }).create(PATIENT_ID, 'nutri-1', { type: 'first', date }, [], measurements);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.measurement.createMany).toHaveBeenCalledWith({
      data: measurements.map((measurement) => ({ ...measurement, patientId: PATIENT_ID, consultationId: 'q-1', date })),
    });
    expect(prisma.patient.updateMany).toHaveBeenCalledWith(TOUCH_PATIENT);
  });

  it('updateForPatient escribe, toca al paciente y relee filtrando por id, paciente y nutricionista', async () => {
    const prisma = createFakePrisma();

    await createConsultationRepository({ prisma }).updateForPatient('q-1', PATIENT_ID, 'nutri-1', {
      observations: 'x',
    });

    expect(prisma.consultation.updateMany).toHaveBeenCalledWith({
      where: { id: 'q-1', ...OWNED },
      data: { observations: 'x' },
    });
    expect(prisma.patient.updateMany).toHaveBeenCalledWith(TOUCH_PATIENT);
    expect(prisma.consultation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q-1', ...OWNED } }),
    );
  });

  it('updateForPatient devuelve null sin tocar al paciente cuando no actualizó ninguna fila', async () => {
    const prisma = createFakePrisma({ count: 0 });

    const result = await createConsultationRepository({ prisma }).updateForPatient('q-1', PATIENT_ID, 'nutri-1', {});

    expect(result).toBeNull();
    expect(prisma.patient.updateMany).not.toHaveBeenCalled();
    expect(prisma.consultation.findFirst).not.toHaveBeenCalled();
  });

  describe.each([undefined, null, ''])('sin nutricionista (%j)', (nutritionistId) => {
    it.each([
      ['findAllForPatient', (repository) => repository.findAllForPatient(PATIENT_ID, nutritionistId)],
      ['findByIdForPatient', (repository) => repository.findByIdForPatient('q-1', PATIENT_ID, nutritionistId)],
      ['create', (repository) => repository.create(PATIENT_ID, nutritionistId, {}, [])],
      ['updateForPatient', (repository) => repository.updateForPatient('q-1', PATIENT_ID, nutritionistId, {})],
    ])('%s corta antes de llegar a Prisma', async (_op, run) => {
      const prisma = createFakePrisma();

      await expect(async () => run(createConsultationRepository({ prisma }))).rejects.toThrow(
        'consulta sin nutritionistId',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.consultation.findMany).not.toHaveBeenCalled();
      expect(prisma.consultation.findFirst).not.toHaveBeenCalled();
      expect(prisma.consultation.updateMany).not.toHaveBeenCalled();
    });
  });
});
