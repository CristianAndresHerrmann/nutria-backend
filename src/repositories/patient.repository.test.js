const { createPatientRepository } = require('./patient.repository');

// Los tests de patient.service usan un repositorio fake que ya filtra por
// nutricionista. Estos verifican la otra mitad: que la consulta real a Prisma
// lleve nutritionistId en el where. Si alguna lo perdiera, el aislamiento
// dependería solo de lo que haga el servicio.
function createFakePrisma({ updateCount = 1 } = {}) {
  return {
    patient: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'p-1', nutritionistId: 'nutri-1' })),
      create: vi.fn(async ({ data }) => ({ id: 'p-1', ...data })),
      updateMany: vi.fn(async () => ({ count: updateCount })),
    },
    patientCondition: {
      count: vi.fn(async () => 0),
    },
  };
}

describe('patient.repository — filtro por nutricionista en cada consulta', () => {
  it('findAllByNutritionist filtra por nutritionistId', async () => {
    const prisma = createFakePrisma();
    const repository = createPatientRepository({ prisma });

    await repository.findAllByNutritionist('nutri-1');

    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nutritionistId: 'nutri-1' } }),
    );
  });

  it('findByIdForNutritionist filtra por id y nutritionistId a la vez', async () => {
    const prisma = createFakePrisma();
    const repository = createPatientRepository({ prisma });

    await repository.findByIdForNutritionist('p-1', 'nutri-1');

    expect(prisma.patient.findFirst).toHaveBeenCalledWith({ where: { id: 'p-1', nutritionistId: 'nutri-1' } });
  });

  it('updateForNutritionist escribe y relee filtrando por id y nutritionistId', async () => {
    const prisma = createFakePrisma();
    const repository = createPatientRepository({ prisma });

    await repository.updateForNutritionist('p-1', 'nutri-1', { firstName: 'Ana' });

    expect(prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', nutritionistId: 'nutri-1' },
      data: { firstName: 'Ana' },
    });
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({ where: { id: 'p-1', nutritionistId: 'nutri-1' } });
  });

  it('updateForNutritionist devuelve null sin releer cuando el paciente es de otro nutricionista (0 filas)', async () => {
    const prisma = createFakePrisma({ updateCount: 0 });
    const repository = createPatientRepository({ prisma });

    const result = await repository.updateForNutritionist('p-ajeno', 'nutri-1', { firstName: 'Hackeado' });

    expect(result).toBeNull();
    expect(prisma.patient.findFirst).not.toHaveBeenCalled();
  });

  it('countConditionsForNutritionist filtra por paciente, tipos y nutricionista del paciente', async () => {
    const prisma = createFakePrisma();
    const repository = createPatientRepository({ prisma });

    await repository.countConditionsForNutritionist('p-1', 'nutri-1', ['pathology', 'allergy']);

    expect(prisma.patientCondition.count).toHaveBeenCalledWith({
      where: { patientId: 'p-1', type: { in: ['pathology', 'allergy'] }, patient: { nutritionistId: 'nutri-1' } },
    });
  });

  // Prisma ignora un filtro undefined: sin esta barrera, un nutritionistId vacío
  // convertiría cada consulta en una búsqueda sobre todos los pacientes.
  describe.each([undefined, null, ''])('con nutritionistId %j', (nutritionistId) => {
    it('ninguna operación llega a Prisma', async () => {
      const prisma = createFakePrisma();
      const repository = createPatientRepository({ prisma });

      expect(() => repository.findAllByNutritionist(nutritionistId)).toThrow();
      expect(() => repository.findByIdForNutritionist('p-1', nutritionistId)).toThrow();
      expect(() => repository.create({ firstName: 'Ana', lastName: 'Diaz', nutritionistId })).toThrow();
      await expect(repository.updateForNutritionist('p-1', nutritionistId, { firstName: 'X' })).rejects.toThrow();
      expect(() => repository.countConditionsForNutritionist('p-1', nutritionistId, ['pathology'])).toThrow();

      expect(prisma.patient.findMany).not.toHaveBeenCalled();
      expect(prisma.patient.findFirst).not.toHaveBeenCalled();
      expect(prisma.patient.create).not.toHaveBeenCalled();
      expect(prisma.patient.updateMany).not.toHaveBeenCalled();
      expect(prisma.patientCondition.count).not.toHaveBeenCalled();
    });
  });

  it('create persiste el nutritionistId que recibe del servicio', async () => {
    const prisma = createFakePrisma();
    const repository = createPatientRepository({ prisma });

    await repository.create({ firstName: 'Ana', lastName: 'Diaz', nutritionistId: 'nutri-1' });

    expect(prisma.patient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nutritionistId: 'nutri-1' }),
    });
  });
});
