const { createPatientConditionRepository } = require('./patientCondition.repository');

// Los tests de patientCondition.service usan repositorios fake. Estos verifican
// que cada consulta real a Prisma lleve el paciente y su nutricionista en el
// where: si alguna lo perdiera, el aislamiento dependería solo del servicio.
const PATIENT_ID = 'p-1';
const OWNED = { patientId: PATIENT_ID, patient: { nutritionistId: 'nutri-1' } };

function createFakePrisma({ count = 1 } = {}) {
  return {
    patientCondition: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'c-1' })),
      create: vi.fn(async ({ data }) => ({ id: 'c-1', ...data })),
      updateMany: vi.fn(async () => ({ count })),
      deleteMany: vi.fn(async () => ({ count })),
    },
  };
}

describe('patientCondition.repository — filtro por paciente y nutricionista en cada consulta', () => {
  it('findAllForPatient filtra por paciente y nutricionista', async () => {
    const prisma = createFakePrisma();

    await createPatientConditionRepository({ prisma }).findAllForPatient(PATIENT_ID, 'nutri-1');

    expect(prisma.patientCondition.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: OWNED }));
  });

  it('findByIdForPatient filtra por id, paciente y nutricionista', async () => {
    const prisma = createFakePrisma();

    await createPatientConditionRepository({ prisma }).findByIdForPatient('c-1', PATIENT_ID, 'nutri-1');

    expect(prisma.patientCondition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-1', ...OWNED } }),
    );
  });

  it('findDuplicate busca el mismo tipo y destino, y excluye la propia condición al editar', async () => {
    const prisma = createFakePrisma();
    const target = { type: 'allergy', pathologyId: null, foodId: 'f-1', foodGroupId: null };

    await createPatientConditionRepository({ prisma }).findDuplicate(PATIENT_ID, 'nutri-1', target, 'c-1');

    expect(prisma.patientCondition.findFirst).toHaveBeenCalledWith({
      where: { ...OWNED, ...target, id: { not: 'c-1' } },
    });
  });

  it('updateForPatient escribe y relee filtrando por id, paciente y nutricionista', async () => {
    const prisma = createFakePrisma();

    await createPatientConditionRepository({ prisma }).updateForPatient('c-1', PATIENT_ID, 'nutri-1', {
      observations: 'x',
    });

    expect(prisma.patientCondition.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-1', ...OWNED },
      data: { observations: 'x' },
    });
    expect(prisma.patientCondition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-1', ...OWNED } }),
    );
  });

  it('updateForPatient devuelve null sin releer cuando no actualizó ninguna fila', async () => {
    const prisma = createFakePrisma({ count: 0 });

    const result = await createPatientConditionRepository({ prisma }).updateForPatient('c-1', PATIENT_ID, 'nutri-1', {});

    expect(result).toBeNull();
    expect(prisma.patientCondition.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    [1, true],
    [0, false],
  ])('deleteForPatient filtra por id, paciente y nutricionista (%i filas → %s)', async (count, expected) => {
    const prisma = createFakePrisma({ count });

    const result = await createPatientConditionRepository({ prisma }).deleteForPatient('c-1', PATIENT_ID, 'nutri-1');

    expect(prisma.patientCondition.deleteMany).toHaveBeenCalledWith({ where: { id: 'c-1', ...OWNED } });
    expect(result).toBe(expected);
  });

  describe.each([undefined, null, ''])('con nutritionistId %j', (nutritionistId) => {
    it('ninguna operación llega a Prisma', async () => {
      const prisma = createFakePrisma();
      const repository = createPatientConditionRepository({ prisma });
      const target = { type: 'allergy', pathologyId: null, foodId: 'f-1', foodGroupId: null };

      expect(() => repository.findAllForPatient(PATIENT_ID, nutritionistId)).toThrow(/sin nutritionistId/);
      expect(() => repository.findByIdForPatient('c-1', PATIENT_ID, nutritionistId)).toThrow(/sin nutritionistId/);
      expect(() => repository.findDuplicate(PATIENT_ID, nutritionistId, target)).toThrow(/sin nutritionistId/);
      await expect(repository.updateForPatient('c-1', PATIENT_ID, nutritionistId, {})).rejects.toThrow(
        /sin nutritionistId/,
      );
      await expect(repository.deleteForPatient('c-1', PATIENT_ID, nutritionistId)).rejects.toThrow(
        /sin nutritionistId/,
      );

      Object.values(prisma.patientCondition).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    });
  });
});
