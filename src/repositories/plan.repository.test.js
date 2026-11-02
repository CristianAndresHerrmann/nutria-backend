const { createPlanRepository } = require('./plan.repository');

// Igual que patient.repository.test: verifica que la consulta real a Prisma lleve
// nutritionistId en el where. Si alguna lo perdiera, el aislamiento (RNF-05)
// dependería solo de lo que haga el servicio.
function createFakePrisma({ updateCount = 1, planFound = true } = {}) {
  const prisma = {
    $queryRaw: vi.fn(async () => (planFound ? [{ id: 'plan-1' }] : [])),
    plan: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => (planFound ? { id: 'plan-1', nutritionistId: 'nutri-1' } : null)),
      create: vi.fn(async () => ({ id: 'plan-1' })),
      updateMany: vi.fn(async () => ({ count: updateCount })),
    },
    planMeal: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async ({ data }) => data),
    },
    finding: {
      deleteMany: vi.fn(async () => ({ count: 2 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      createManyAndReturn: vi.fn(async ({ data }) => data),
    },
    aiGeneration: {
      create: vi.fn(async ({ data }) => data),
    },
  };
  prisma.$transaction = vi.fn(async (callback) => callback(prisma));
  return prisma;
}

const MEALS = [
  {
    id: 'm-1',
    mealType: 'lunch',
    instructions: null,
    options: [
      {
        id: 'o-1',
        order: 1,
        description: null,
        items: [{ id: 'i-1', order: 1, type: 'food', foodId: 'pollo', foodName: 'Pollo', foodCategories: ['protein'] }],
      },
    ],
  },
];

const FINDINGS = [
  { type: 'composition', severity: 'warning', optionId: 'o-1', optionItemId: null, patientConditionId: null, message: 'X' },
];

const GENERATION = {
  contextSent: { meal_types: ['lunch'] },
  provider: 'fake',
  model: 'fake-1',
  templateVersion: 'v1',
  rawResponse: '{}',
  durationMs: 12,
  result: 'success',
  validationResult: 'warnings',
};

describe('plan.repository — filtro por nutricionista en cada consulta', () => {
  it('findAllForPatient filtra por paciente y nutritionistId a la vez, y trae solo el resumen', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.findAllForPatient('p-1', 'nutri-1');

    const [query] = prisma.plan.findMany.mock.calls[0];
    expect(query.where).toEqual({ patientId: 'p-1', nutritionistId: 'nutri-1' });
    expect(Object.keys(query.select)).toEqual(['id', 'patientId', 'status', 'createdAt', 'updatedAt']);
  });

  it('findByIdForPatient filtra por id, paciente y nutritionistId a la vez', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.findByIdForPatient('plan-1', 'p-1', 'nutri-1');

    expect(prisma.plan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-1', patientId: 'p-1', nutritionistId: 'nutri-1' } }),
    );
  });

  it('findByIdForPatient trae el plan completo en orden y solo el resumen de la última generación', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.findByIdForPatient('plan-1', 'p-1', 'nutri-1');

    const { include } = prisma.plan.findFirst.mock.calls[0][0];
    expect(include.meals.orderBy).toEqual({ mealType: 'asc' });
    expect(include.meals.include.options.orderBy).toEqual({ order: 'asc' });
    expect(include.meals.include.options.include.items.orderBy).toEqual({ order: 'asc' });
    expect(include.meals.include.options.include.items.include.recipe.select).toEqual({
      id: true,
      name: true,
      availableInCatalog: true,
    });
    expect(include).toHaveProperty('findings');
    expect(include.aiGenerations).toMatchObject({ orderBy: { generatedAt: 'desc' }, take: 1 });
    expect(include.aiGenerations.select).not.toHaveProperty('contextSent');
    expect(include.aiGenerations.select).not.toHaveProperty('rawResponse');
  });

  it('createGenerated escribe plan, contenido, hallazgos y generación en una sola transacción', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.createGenerated('nutri-1', {
      patientId: 'p-1',
      fields: { introduction: 'Hola' },
      meals: MEALS,
      findings: FINDINGS,
      generation: GENERATION,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const { data } = prisma.plan.create.mock.calls[0][0];
    expect(data).toMatchObject({ introduction: 'Hola', patientId: 'p-1', nutritionistId: 'nutri-1' });
    expect(data.meals.create[0]).toMatchObject({ id: 'm-1', mealType: 'lunch' });
    expect(data.meals.create[0].options.create[0]).toMatchObject({ id: 'o-1', order: 1, items: { create: MEALS[0].options[0].items } });
    expect(prisma.finding.createMany).toHaveBeenCalledWith({ data: [{ ...FINDINGS[0], planId: 'plan-1' }] });
    expect(prisma.aiGeneration.create).toHaveBeenCalledWith({
      data: { ...GENERATION, planId: 'plan-1', patientId: 'p-1', nutritionistId: 'nutri-1' },
    });
    expect(prisma.plan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-1', patientId: 'p-1', nutritionistId: 'nutri-1' } }),
    );
  });

  it('createGenerated usa el nutritionistId del servicio aunque los campos traigan otro', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.createGenerated('nutri-1', {
      patientId: 'p-1',
      fields: { nutritionistId: 'nutri-ajeno' },
      meals: [],
      findings: [],
      generation: GENERATION,
    });

    expect(prisma.plan.create.mock.calls[0][0].data.nutritionistId).toBe('nutri-1');
    expect(prisma.finding.createMany).not.toHaveBeenCalled();
  });

  it('recordFailedGeneration registra la traza sin plan, con el paciente y el nutricionista', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });
    const failed = { ...GENERATION, result: 'timeout', rawResponse: null, validationResult: undefined };

    await repository.recordFailedGeneration('p-1', 'nutri-1', failed);

    expect(prisma.aiGeneration.create).toHaveBeenCalledWith({ data: { ...failed, patientId: 'p-1', nutritionistId: 'nutri-1' } });
    expect(prisma.plan.create).not.toHaveBeenCalled();
  });

  it('replaceDraft reemplaza contenido y hallazgos en una transacción, filtrando por plan, paciente, nutricionista y estado', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    await repository.replaceDraft('plan-1', 'p-1', 'nutri-1', { fields: { introduction: 'Nueva' }, meals: MEALS, findings: FINDINGS });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.plan.updateMany).toHaveBeenCalledWith({
      where: { id: 'plan-1', patientId: 'p-1', nutritionistId: 'nutri-1', status: 'draft' },
      data: { introduction: 'Nueva' },
    });
    expect(prisma.finding.deleteMany).toHaveBeenCalledWith({ where: { planId: 'plan-1' } });
    expect(prisma.planMeal.deleteMany).toHaveBeenCalledWith({ where: { planId: 'plan-1' } });
    expect(prisma.planMeal.create.mock.calls[0][0].data).toMatchObject({ id: 'm-1', planId: 'plan-1' });
    expect(prisma.finding.createMany).toHaveBeenCalledWith({ data: [{ ...FINDINGS[0], planId: 'plan-1' }] });
  });

  it('replaceDraft no toca nada cuando el plan es ajeno (0 filas)', async () => {
    const prisma = createFakePrisma({ updateCount: 0 });
    const repository = createPlanRepository({ prisma });

    const result = await repository.replaceDraft('plan-ajeno', 'p-1', 'nutri-1', { fields: {}, meals: MEALS, findings: FINDINGS });

    expect(result).toBeNull();
    expect(prisma.finding.deleteMany).not.toHaveBeenCalled();
    expect(prisma.planMeal.deleteMany).not.toHaveBeenCalled();
    expect(prisma.planMeal.create).not.toHaveBeenCalled();
  });

  it('replaceFindings bloquea el borrador propio antes de borrar y crear sus hallazgos en una transacción', async () => {
    const prisma = createFakePrisma();
    const repository = createPlanRepository({ prisma });

    const saved = await repository.replaceFindings('plan-1', 'nutri-1', FINDINGS);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [parts, ...values] = prisma.$queryRaw.mock.calls[0];
    expect(values).toEqual(['plan-1', 'nutri-1', 'draft']);
    const sql = parts.join('?');
    expect(sql).toContain('"id" = ?::uuid');
    expect(sql).toContain('"nutritionist_id" = ?::uuid');
    expect(sql).toContain('"status" = ?::"plan_status"');
    expect(sql).toContain('FOR UPDATE');
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.finding.deleteMany.mock.invocationCallOrder[0]);
    expect(prisma.finding.deleteMany).toHaveBeenCalledWith({ where: { planId: 'plan-1' } });
    expect(prisma.finding.createManyAndReturn).toHaveBeenCalledWith({ data: [{ ...FINDINGS[0], planId: 'plan-1' }] });
    expect(saved).toEqual([{ ...FINDINGS[0], planId: 'plan-1' }]);
  });

  it('replaceFindings devuelve null sin borrar ni escribir si no hay un borrador propio', async () => {
    const prisma = createFakePrisma({ planFound: false });
    const repository = createPlanRepository({ prisma });

    const result = await repository.replaceFindings('plan-ajeno', 'nutri-1', []);

    expect(result).toBeNull();
    expect(prisma.finding.deleteMany).not.toHaveBeenCalled();
    expect(prisma.finding.createManyAndReturn).not.toHaveBeenCalled();
  });

  // Prisma ignora un filtro undefined: sin esta barrera, un nutritionistId vacío
  // convertiría cada consulta en una búsqueda sobre los planes de todos.
  describe.each([undefined, null, ''])('con nutritionistId %j', (nutritionistId) => {
    it('ninguna operación llega a Prisma', () => {
      const prisma = createFakePrisma();
      const repository = createPlanRepository({ prisma });
      const content = { patientId: 'p-1', fields: {}, meals: [], findings: [], generation: GENERATION };

      expect(() => repository.findAllForPatient('p-1', nutritionistId)).toThrow();
      expect(() => repository.findByIdForPatient('plan-1', 'p-1', nutritionistId)).toThrow();
      expect(() => repository.createGenerated(nutritionistId, content)).toThrow();
      expect(() => repository.recordFailedGeneration('p-1', nutritionistId, GENERATION)).toThrow();
      expect(() => repository.replaceDraft('plan-1', 'p-1', nutritionistId, content)).toThrow();
      expect(() => repository.replaceFindings('plan-1', nutritionistId, [])).toThrow();

      expect(prisma.plan.findMany).not.toHaveBeenCalled();
      expect(prisma.plan.findFirst).not.toHaveBeenCalled();
      expect(prisma.aiGeneration.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
