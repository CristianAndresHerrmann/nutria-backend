const { createPlanValidationService, PLAN_NOT_FOUND_MESSAGE } = require('./planValidation.service');

const GROUPS = [{ id: 'lacteos', parentId: null }, { id: 'cereales', parentId: null }];

const FOODS = [
  { id: 'leche', name: 'Leche', foodGroupId: 'lacteos', active: true, nutritionistId: null, categories: [{ category: 'protein' }] },
  { id: 'pan', name: 'Pan', foodGroupId: 'cereales', active: true, nutritionistId: null, categories: [{ category: 'carbohydrate' }] },
];

const PLAN = {
  id: 'plan-1',
  patientId: 'p-1',
  nutritionistId: 'nutri-1',
  meals: [
    {
      mealType: 'breakfast',
      options: [
        {
          id: 'o-1',
          order: 1,
          items: [
            { id: 'i-leche', order: 1, type: 'food', foodId: 'leche', foodName: 'Leche', foodCategories: ['protein'] },
            { id: 'i-x', order: 2, type: 'unrecognized', originalText: 'mate cocido' },
          ],
        },
      ],
    },
  ],
};

const LACTOSE_INTOLERANCE = { id: 'c-1', patientId: 'p-1', type: 'intolerance', foodId: null, foodGroupId: 'lacteos', food: null, foodGroup: { name: 'Lácteos' } };
const DIABETES = { id: 'c-2', patientId: 'p-1', type: 'pathology', pathologyId: 'diabetes', foodId: null, foodGroupId: null, pathology: { name: 'Diabetes' } };

const rule = (id, severity, source = 'Fuente de prueba, p. 1') => ({ id, pathologyId: 'diabetes', foodId: 'leche', foodGroupId: null, severity, source });

// Repositorio de planes fake con el mismo aislamiento que el real: solo
// encuentra y escribe planes del nutricionista. Guarda los hallazgos por plan y
// los devuelve con el plan, como PLAN_INCLUDE.
function createFakePlanRepository() {
  const findingsByPlan = new Map();
  const owns = (planId, nutritionistId) => planId === PLAN.id && nutritionistId === PLAN.nutritionistId;

  return {
    findingsByPlan,
    async findByIdForPatient(id, patientId, nutritionistId) {
      if (!owns(id, nutritionistId) || patientId !== PLAN.patientId) return null;
      return { ...PLAN, findings: findingsByPlan.get(id) ?? [] };
    },
    replaceFindings: vi.fn(async (planId, nutritionistId, findings) => {
      if (!owns(planId, nutritionistId)) return null;
      const saved = findings.map((finding, index) => ({ ...finding, id: `f-${index}`, planId }));
      findingsByPlan.set(planId, saved);
      return saved;
    }),
  };
}

function setup({ conditions = [LACTOSE_INTOLERANCE], rules = [] } = {}) {
  const planRepository = createFakePlanRepository();
  const patientConditionRepository = { findAllForPatient: vi.fn(async () => conditions) };
  const foodRepository = { findAllVisible: vi.fn(async () => FOODS) };
  const recipeRepository = { findVisible: vi.fn(async () => []) };
  const clinicalRuleRepository = { findActiveForPathologies: vi.fn(async () => rules) };
  const service = createPlanValidationService({
    planRepository,
    patientConditionRepository,
    foodRepository,
    foodGroupRepository: { findAll: async () => GROUPS },
    recipeRepository,
    clinicalRuleRepository,
  });
  return { service, planRepository, patientConditionRepository, foodRepository, recipeRepository, clinicalRuleRepository };
}

describe('planValidation.service.revalidate (RF-46)', () => {
  it('corre el motor con las condiciones del paciente del plan y guarda los hallazgos', async () => {
    const { service, planRepository, patientConditionRepository } = setup();

    const { findings } = await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(patientConditionRepository.findAllForPatient).toHaveBeenCalledWith('p-1', 'nutri-1');
    expect(findings.map(({ type, planId }) => [type, planId])).toEqual([
      ['direct_condition', 'plan-1'],
      ['unrecognized_item', 'plan-1'],
      ['composition', 'plan-1'],
    ]);
    expect(planRepository.findingsByPlan.get('plan-1')).toEqual(findings);
  });

  it('arma el catálogo con lo que ve el nutricionista, incluidas bajas y recetas no disponibles', async () => {
    const { service, foodRepository, recipeRepository } = setup();

    await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(foodRepository.findAllVisible).toHaveBeenCalledWith('nutri-1');
    expect(recipeRepository.findVisible).toHaveBeenCalledWith('nutri-1', { includeUnavailable: true });
  });

  it('revalidar reemplaza los hallazgos, no los acumula', async () => {
    const { service, planRepository } = setup();

    await service.revalidate('p-1', 'plan-1', 'nutri-1');
    await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(planRepository.findingsByPlan.get('plan-1')).toHaveLength(3);
  });

  it('abrir de nuevo un plan sin cambios no reescribe los hallazgos y conserva sus ids', async () => {
    const { service, planRepository } = setup();

    const first = await service.revalidate('p-1', 'plan-1', 'nutri-1');
    const second = await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(planRepository.replaceFindings).toHaveBeenCalledTimes(1);
    expect(second.findings.map(({ id }) => id)).toEqual(first.findings.map(({ id }) => id));
  });

  it('cuando se corrige lo que producía un hallazgo, deja de existir', async () => {
    const conditions = [LACTOSE_INTOLERANCE];
    const { service, planRepository } = setup({ conditions });

    await service.revalidate('p-1', 'plan-1', 'nutri-1');
    conditions.pop();
    await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(planRepository.replaceFindings).toHaveBeenCalledTimes(2);

    expect(planRepository.findingsByPlan.get('plan-1').map(({ type }) => type)).toEqual(['unrecognized_item', 'composition']);
  });

  it('carga las reglas de las patologías del paciente y las evalúa (T35)', async () => {
    const rules = [rule('r-1', 'moderate')];
    const { service, clinicalRuleRepository } = setup({ conditions: [LACTOSE_INTOLERANCE, DIABETES], rules });

    const { findings } = await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(clinicalRuleRepository.findActiveForPathologies).toHaveBeenCalledWith(['diabetes']);
    expect(findings.map(({ type, severity, clinicalRuleId }) => [type, severity, clinicalRuleId])).toEqual([
      ['direct_condition', 'blocking', undefined],
      ['pathology_rule', 'warning', 'r-1'],
      ['unrecognized_item', 'blocking', undefined],
      ['composition', 'warning', undefined],
    ]);
  });

  it('dos hallazgos que difieren solo en la regla son distintos: se reescriben', async () => {
    const rules = [rule('r-1', 'moderate')];
    const { service, planRepository } = setup({ conditions: [DIABETES], rules });

    await service.revalidate('p-1', 'plan-1', 'nutri-1');
    rules[0] = rule('r-2', 'moderate');
    await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(planRepository.replaceFindings).toHaveBeenCalledTimes(2);
    expect(planRepository.findingsByPlan.get('plan-1').find(({ type }) => type === 'pathology_rule').clinicalRuleId).toBe('r-2');
  });

  it('un plan de otro nutricionista da 404 y no escribe nada', async () => {
    const { service, planRepository } = setup();

    await expect(service.revalidate('p-1', 'plan-1', 'nutri-2')).rejects.toMatchObject({ status: 404, message: PLAN_NOT_FOUND_MESSAGE });
    expect(planRepository.replaceFindings).not.toHaveBeenCalled();
  });

  it('un plan de otro paciente del mismo nutricionista da 404', async () => {
    const { service, planRepository } = setup();

    await expect(service.revalidate('p-2', 'plan-1', 'nutri-1')).rejects.toMatchObject({ status: 404 });
    expect(planRepository.replaceFindings).not.toHaveBeenCalled();
  });

  it('devuelve el plan con los hallazgos recién calculados', async () => {
    const { service } = setup();

    const plan = await service.revalidate('p-1', 'plan-1', 'nutri-1');

    expect(plan).toMatchObject({ id: 'plan-1', meals: PLAN.meals });
    expect(plan.findings).toHaveLength(3);
  });
});

describe('planValidation.service.computeFindings', () => {
  it('valida un plan en memoria sin escribir nada', async () => {
    const { service, planRepository } = setup();

    const inputs = await service.loadInputs('p-1', 'nutri-1');
    const findings = service.computeFindings(PLAN, inputs);

    expect(findings.map(({ type }) => type)).toEqual(['direct_condition', 'unrecognized_item', 'composition']);
    expect(planRepository.replaceFindings).not.toHaveBeenCalled();
  });
});
