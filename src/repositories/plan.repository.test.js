const { createPlanRepository } = require('./plan.repository');

// Igual que patient.repository.test: verifica que la consulta real a Prisma lleve
// nutritionistId en el where. Si alguna lo perdiera, el aislamiento (RNF-05)
// dependería solo de lo que haga el servicio.
function createFakePrisma({ updateCount = 1 } = {}) {
  return {
    plan: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'plan-1', nutritionistId: 'nutri-1' })),
      create: vi.fn(async ({ data }) => ({ id: 'plan-1', status: 'draft', ...data })),
      updateMany: vi.fn(async () => ({ count: updateCount })),
    },
  };
}

describe('plan.repository — filtro por nutricionista en cada consulta', () => {
  it('findAllForPatient filtra por paciente y nutritionistId a la vez', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.findAllForPatient('p-1', 'nutri-1');

    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: 'p-1', nutritionistId: 'nutri-1' } }),
    );
  });

  it('findByIdForNutritionist filtra por id y nutritionistId a la vez', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.findByIdForNutritionist('plan-1', 'nutri-1');

    expect(prisma.plan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-1', nutritionistId: 'nutri-1' } }),
    );
  });

  it('findByIdForNutritionist trae el plan completo en orden: comidas, opciones, ítems y hallazgos', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.findByIdForNutritionist('plan-1', 'nutri-1');

    const { include } = prisma.plan.findFirst.mock.calls[0][0];
    expect(include.meals.orderBy).toEqual({ mealType: 'asc' });
    expect(include.meals.include.options.orderBy).toEqual({ order: 'asc' });
    expect(include.meals.include.options.include.items.orderBy).toEqual({ order: 'asc' });
    expect(include).toHaveProperty('findings');
  });

  it('create persiste el nutritionistId que recibe del servicio, aunque los datos traigan otro', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.create('nutri-1', { patientId: 'p-1', nutritionistId: 'nutri-ajeno' });

    expect(prisma.plan.create).toHaveBeenCalledWith({ data: { patientId: 'p-1', nutritionistId: 'nutri-1' } });
  });

  it('updateForNutritionist escribe y relee filtrando por id y nutritionistId', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.updateForNutritionist('plan-1', 'nutri-1', { introduction: 'Hola' });

    expect(prisma.plan.updateMany).toHaveBeenCalledWith({
      where: { id: 'plan-1', nutritionistId: 'nutri-1' },
      data: { introduction: 'Hola' },
    });
    expect(prisma.plan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-1', nutritionistId: 'nutri-1' } }),
    );
  });

  it('updateForNutritionist devuelve null sin releer cuando el plan es de otro nutricionista (0 filas)', async () => {
    const prisma = createFakePrisma({ updateCount: 0 });
    const repository = createPlanRepository({ prisma });

    const result = await repository.updateForNutritionist('plan-ajeno', 'nutri-1', { introduction: 'X' });

    expect(result).toBeNull();
    expect(prisma.plan.findFirst).not.toHaveBeenCalled();
  });

  // Prisma ignora un filtro undefined: sin esta barrera, un nutritionistId vacío
  // convertiría cada consulta en una búsqueda sobre los planes de todos.
  describe.each([undefined, null, ''])('con nutritionistId %j', (nutritionistId) => {
    it('ninguna operación llega a Prisma', async () => {
      const prisma = createFakePrisma();
      const repository = createPlanRepository({ prisma });

      expect(() => repository.findAllForPatient('p-1', nutritionistId)).toThrow();
      expect(() => repository.findByIdForNutritionist('plan-1', nutritionistId)).toThrow();
      expect(() => repository.create(nutritionistId, { patientId: 'p-1' })).toThrow();
      await expect(repository.updateForNutritionist('plan-1', nutritionistId, { introduction: 'X' })).rejects.toThrow();

      expect(prisma.plan.findMany).not.toHaveBeenCalled();
      expect(prisma.plan.findFirst).not.toHaveBeenCalled();
      expect(prisma.plan.create).not.toHaveBeenCalled();
      expect(prisma.plan.updateMany).not.toHaveBeenCalled();
    });
  });
});
