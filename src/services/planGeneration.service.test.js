const { createPlanGenerationService } = require('./planGeneration.service');
const { createPlanValidationService } = require('./planValidation.service');
const { iaUnavailable } = require('../clients/ia.client');

// Datos ficticios. El motor de reglas y el armado del contexto son los reales:
// solo los repositorios y el cliente de IA son fakes.
const PATIENT = { id: 'p-1', nutritionistId: 'nutri-1', firstName: 'Ficticia', lastName: 'Prueba', cooks: true };

const GROUPS = [
  { id: 'verduras', name: 'Verduras', parentId: null },
  { id: 'carnes', name: 'Carnes', parentId: null },
  { id: 'lacteos', name: 'Lácteos', parentId: null },
];

const FOODS = [
  { id: 'zanahoria', name: 'Zanahoria', foodGroupId: 'verduras', active: true, categories: [{ category: 'vegetable' }] },
  { id: 'pollo', name: 'Pollo', foodGroupId: 'carnes', active: true, categories: [{ category: 'protein' }] },
  { id: 'leche', name: 'Leche', foodGroupId: 'lacteos', active: true, categories: [{ category: 'protein' }] },
];

const LACTOSE_ALLERGY = {
  id: 'c-1',
  type: 'allergy',
  foodId: 'leche',
  foodGroupId: null,
  pathologyId: null,
  food: { id: 'leche', name: 'Leche' },
  foodGroup: null,
};

const GENERATION = {
  provider: 'fake',
  model: 'fake-deterministic',
  template_version: 'plan_proposal_v1',
  duration_ms: 7,
  input_tokens: null,
  output_tokens: null,
  raw_response: '{"meals": []}',
};

// Como el proveedor simulado de nutria-ia: arma una propuesta válida con los
// códigos del contexto que recibe. El almuerzo trae un texto libre, así la
// propuesta tiene un bloqueo (DA-30).
function proposalFor(context) {
  const foodCode = (name) => context.catalog.foods.find((food) => food.name === name).code;
  return {
    proposal: {
      situational_diagnosis: 'Diagnóstico de ejemplo',
      introduction: 'Introducción de ejemplo',
      objectives: 'Objetivos de ejemplo',
      general_recommendations: 'Generales de ejemplo',
      contextual_recommendations: 'Contextuales de ejemplo',
      thematic_recommendations: 'Temáticas de ejemplo',
      meals: context.meal_types.map((mealType) => ({
        meal_type: mealType,
        instructions: null,
        options: [
          {
            description: null,
            items: [
              { type: 'food', code: foodCode('Pollo') },
              { type: 'food', code: foodCode('Zanahoria') },
              { type: 'free_text', text: 'Mate cocido' },
            ],
          },
        ],
      })),
    },
    generation: GENERATION,
  };
}

function controlledError(reason, generation = GENERATION) {
  const error = iaUnavailable(reason);
  error.generation = generation;
  return error;
}

function setup({ conditions = [], postJson, recordFailedGeneration } = {}) {
  const validation = createPlanValidationService({
    planRepository: {},
    patientConditionRepository: { findAllForPatient: async () => conditions },
    foodRepository: { findAllVisible: async () => FOODS },
    foodGroupRepository: { findAll: async () => GROUPS },
    recipeRepository: { findVisible: async () => [] },
  });
  const planRepository = {
    createGenerated: vi.fn(async (nutritionistId, data) => ({ id: 'plan-1', nutritionistId, ...data })),
    recordFailedGeneration: recordFailedGeneration ?? vi.fn(async () => ({})),
  };
  const iaClient = { postJson: postJson ?? vi.fn(async (path, context) => proposalFor(context)) };
  const clinicalRuleRepository = { findActiveProhibitedForPathologies: vi.fn(async () => []) };
  const service = createPlanGenerationService({
    planRepository,
    patientRepository: {
      findByIdForNutritionist: async (id, nutritionistId) =>
        id === PATIENT.id && nutritionistId === PATIENT.nutritionistId ? PATIENT : null,
    },
    clinicalRuleRepository,
    planValidationService: validation,
    iaClient,
    generationTimeoutMs: 1234,
  });
  return { service, planRepository, iaClient, clinicalRuleRepository };
}

const LUNCH_ONLY = { mealTypes: ['lunch'] };

describe('planGeneration.service.generate — de punta a punta con el proveedor simulado', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('crea el borrador con sus ítems, sus hallazgos y la traza de la generación en una sola escritura', async () => {
    const { service, planRepository, iaClient } = setup();

    await service.generate('p-1', 'nutri-1', LUNCH_ONLY);

    expect(planRepository.createGenerated).toHaveBeenCalledTimes(1);
    const [nutritionistId, data] = planRepository.createGenerated.mock.calls[0];
    expect(nutritionistId).toBe('nutri-1');
    expect(data.patientId).toBe('p-1');
    expect(data.fields).toMatchObject({ introduction: 'Introducción de ejemplo', clinicalRecommendations: null });

    const items = data.meals[0].options[0].items;
    expect(items.map(({ type, foodId, originalText }) => [type, foodId ?? originalText])).toEqual([
      ['food', 'pollo'],
      ['food', 'zanahoria'],
      ['unrecognized', 'Mate cocido'],
    ]);

    // El almuerzo tiene proteína y verdura pero no hidrato: advertencia de
    // composición. El texto libre bloquea.
    expect(data.findings.map(({ type, severity }) => [type, severity])).toEqual([
      ['unrecognized_item', 'blocking'],
      ['composition', 'warning'],
    ]);
    expect(data.findings[0].optionItemId).toBe(items[2].id);

    const [, contextSent] = iaClient.postJson.mock.calls[0];
    expect(data.generation).toEqual({
      contextSent,
      provider: 'fake',
      model: 'fake-deterministic',
      templateVersion: 'plan_proposal_v1',
      durationMs: 7,
      inputTokens: null,
      outputTokens: null,
      rawResponse: '{"meals": []}',
      result: 'success',
      validationResult: 'blocking',
    });
  });

  it('llama al servicio de IA por POST /plan-proposals con el tope propio de la generación', async () => {
    const { service, iaClient } = setup();

    await service.generate('p-1', 'nutri-1', LUNCH_ONLY);

    expect(iaClient.postJson).toHaveBeenCalledWith('/plan-proposals', expect.any(Object), { timeoutMs: 1234 });
  });

  it('el contexto enviado no tiene datos identificatorios ni ids, y no ofrece lo que el paciente no puede comer', async () => {
    const { service, iaClient } = setup({ conditions: [LACTOSE_ALLERGY] });

    await service.generate('p-1', 'nutri-1', LUNCH_ONLY);

    const [, context] = iaClient.postJson.mock.calls[0];
    const serialized = JSON.stringify(context);
    for (const value of ['Ficticia', 'Prueba', 'p-1', 'nutri-1', 'c-1', 'pollo', 'zanahoria']) {
      expect(serialized).not.toContain(`"${value}"`);
    }
    expect(context.catalog.foods.map(({ name }) => name)).toEqual(['Pollo', 'Zanahoria']);
    expect(context.conditions).toEqual([{ type: 'allergy', name: 'Leche' }]);
  });

  it('consulta las reglas prohibitivas de las patologías del paciente', async () => {
    const celiac = { id: 'c-2', type: 'pathology', pathologyId: 'celiaquia', pathology: { name: 'Celiaquía' } };
    const { service, clinicalRuleRepository } = setup({ conditions: [celiac] });

    await service.generate('p-1', 'nutri-1', LUNCH_ONLY);

    expect(clinicalRuleRepository.findActiveProhibitedForPathologies).toHaveBeenCalledWith(['celiaquia']);
  });

  it('un paciente de otro nutricionista da 404 sin llamar a la IA ni escribir nada', async () => {
    const { service, planRepository, iaClient } = setup();

    await expect(service.generate('p-1', 'nutri-2', LUNCH_ONLY)).rejects.toMatchObject({ status: 404 });
    expect(iaClient.postJson).not.toHaveBeenCalled();
    expect(planRepository.createGenerated).not.toHaveBeenCalled();
    expect(planRepository.recordFailedGeneration).not.toHaveBeenCalled();
  });

  it.each([
    ['provider_timeout', 'timeout'],
    ['provider_error', 'provider_error'],
    ['invalid_output', 'invalid_response'],
  ])('una falla %s responde 503 sin crear el plan y deja la traza %s sin plan', async (reason, result) => {
    const postJson = vi.fn(async () => {
      throw controlledError(reason);
    });
    const { service, planRepository } = setup({ postJson });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({
      status: 503,
      code: 'IA_UNAVAILABLE',
      details: { reason },
    });
    expect(planRepository.createGenerated).not.toHaveBeenCalled();
    expect(planRepository.recordFailedGeneration).toHaveBeenCalledWith(
      'p-1',
      'nutri-1',
      expect.objectContaining({ result, provider: 'fake', contextSent: expect.any(Object) }),
    );
    expect(planRepository.recordFailedGeneration.mock.calls[0][2]).not.toHaveProperty('planId');
  });

  it.each(['unreachable', 'timeout'])('con el servicio %s responde 503 sin escribir nada', async (reason) => {
    const postJson = vi.fn(async () => {
      throw iaUnavailable(reason);
    });
    const { service, planRepository } = setup({ postJson });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({ status: 503, details: { reason } });
    expect(planRepository.createGenerated).not.toHaveBeenCalled();
    expect(planRepository.recordFailedGeneration).not.toHaveBeenCalled();
  });

  it('una falla sin datos del proveedor deja una línea JSON en el log, sin datos del paciente', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const postJson = vi.fn(async () => {
      throw iaUnavailable('unreachable');
    });
    const { service } = setup({ postJson });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({ status: 503 });

    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warn.mock.calls[0][0]);
    expect(line).toEqual({ event: 'ai_generation_untraced', reason: 'unreachable', patientId: 'p-1', durationMs: expect.any(Number) });
  });

  it('una falla con traza no deja la línea de falla sin traza', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const postJson = vi.fn(async () => {
      throw controlledError('provider_error');
    });
    const { service } = setup({ postJson });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({ status: 503 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('una respuesta 200 fuera del contrato es una salida inválida: 503 sin plan, con su traza', async () => {
    const postJson = vi.fn(async (path, context) => {
      const response = proposalFor(context);
      response.proposal.meals[0].options[0].items[0].grams = 150;
      return response;
    });
    const { service, planRepository } = setup({ postJson });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({
      status: 503,
      details: { reason: 'invalid_output' },
    });
    expect(planRepository.createGenerated).not.toHaveBeenCalled();
    expect(planRepository.recordFailedGeneration).toHaveBeenCalledWith(
      'p-1',
      'nutri-1',
      expect.objectContaining({ result: 'invalid_response', rawResponse: '{"meals": []}' }),
    );
  });

  it('una propuesta con comidas distintas de las pedidas es una salida inválida', async () => {
    const postJson = vi.fn(async (path, context) => proposalFor({ ...context, meal_types: ['dinner'] }));
    const { service, planRepository } = setup({ postJson });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({
      status: 503,
      details: { reason: 'invalid_output' },
    });
    expect(planRepository.createGenerated).not.toHaveBeenCalled();
  });

  it('si no se puede escribir la traza de la falla, el cliente recibe igual el 503 de la IA', async () => {
    const postJson = vi.fn(async () => {
      throw controlledError('provider_error');
    });
    const recordFailedGeneration = vi.fn(async () => {
      throw new Error('base caída');
    });
    const { service } = setup({ postJson, recordFailedGeneration });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({
      status: 503,
      details: { reason: 'provider_error' },
    });
  });

  it('una salida inválida sin respuesta cruda no se registra (ai_generation_response_chk)', async () => {
    const postJson = vi.fn(async () => {
      throw controlledError('invalid_output', { ...GENERATION, raw_response: null });
    });
    const { service, planRepository } = setup({ postJson });

    await expect(service.generate('p-1', 'nutri-1', LUNCH_ONLY)).rejects.toMatchObject({ status: 503 });
    expect(planRepository.recordFailedGeneration).not.toHaveBeenCalled();
  });
});
