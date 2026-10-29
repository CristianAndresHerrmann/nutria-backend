const { createPlanService } = require('./plan.service');
const { createPlanValidationService, PLAN_NOT_FOUND_MESSAGE } = require('./planValidation.service');

const GROUPS = [
  { id: 'carnes', name: 'Carnes', parentId: null },
  { id: 'frutas', name: 'Frutas', parentId: null },
];

const FOODS = [
  { id: 'pollo', name: 'Pollo', foodGroupId: 'carnes', active: true, categories: [{ category: 'protein' }] },
  { id: 'pera', name: 'Pera', foodGroupId: 'frutas', active: false, categories: [{ category: 'fiber' }] },
];

const RECIPES = [
  { id: 'tarta', name: 'Tarta', availableInCatalog: true, ingredients: [], mealTypes: [{ mealType: 'lunch' }] },
  { id: 'vieja', name: 'Vieja', availableInCatalog: false, ingredients: [], mealTypes: [{ mealType: 'lunch' }] },
];

// Un plan guardado que ya usa la pera (dada de baja después) y la receta vieja.
const STORED_PLAN = {
  id: 'plan-1',
  patientId: 'p-1',
  nutritionistId: 'nutri-1',
  meals: [
    {
      mealType: 'lunch',
      options: [
        {
          id: 'o-1',
          order: 1,
          items: [
            { id: 'i-1', order: 1, type: 'food', foodId: 'pera', foodName: 'Pera', foodCategories: ['fiber'] },
            { id: 'i-2', order: 2, type: 'recipe', recipeId: 'vieja' },
          ],
        },
      ],
    },
  ],
  findings: [],
};

const lunch = (items) => [{ mealType: 'lunch', instructions: null, options: [{ description: null, items }] }];

function setup({ conditions = [] } = {}) {
  const owns = (id, patientId, nutritionistId) => id === 'plan-1' && patientId === 'p-1' && nutritionistId === 'nutri-1';
  const planRepository = {
    findAllForPatient: vi.fn(async () => [{ id: 'plan-1', status: 'draft' }]),
    findByIdForPatient: vi.fn(async (id, patientId, nutritionistId) => (owns(id, patientId, nutritionistId) ? STORED_PLAN : null)),
    replaceFindings: vi.fn(async (planId, nutritionistId, findings) => findings.map((finding) => ({ ...finding, planId }))),
    replaceDraft: vi.fn(async (id, patientId, nutritionistId, data) => (owns(id, patientId, nutritionistId) ? { id, ...data } : null)),
  };
  const validation = createPlanValidationService({
    planRepository,
    patientConditionRepository: { findAllForPatient: async () => conditions },
    foodRepository: { findAllVisible: async () => FOODS },
    foodGroupRepository: { findAll: async () => GROUPS },
    recipeRepository: { findVisible: async () => RECIPES },
  });
  const patientRepository = {
    findByIdForNutritionist: async (id, nutritionistId) => (id === 'p-1' && nutritionistId === 'nutri-1' ? { id } : null),
  };
  const service = createPlanService({ planRepository, patientRepository, planValidationService: validation });
  return { service, planRepository };
}

describe('plan.service.list', () => {
  it('lista los planes del paciente del nutricionista', async () => {
    const { service, planRepository } = setup();

    await expect(service.list('p-1', 'nutri-1')).resolves.toEqual([{ id: 'plan-1', status: 'draft' }]);
    expect(planRepository.findAllForPatient).toHaveBeenCalledWith('p-1', 'nutri-1');
  });

  it('un paciente de otro nutricionista da 404', async () => {
    const { service, planRepository } = setup();

    await expect(service.list('p-1', 'nutri-2')).rejects.toMatchObject({ status: 404 });
    expect(planRepository.findAllForPatient).not.toHaveBeenCalled();
  });
});

describe('plan.service.get — el borrador se revalida al abrirlo (RF-46)', () => {
  it('recalcula los hallazgos con las condiciones actuales del paciente', async () => {
    const allergy = { id: 'c-1', type: 'allergy', foodId: 'pera', foodGroupId: null, food: { name: 'Pera' }, foodGroup: null };
    const { service, planRepository } = setup({ conditions: [allergy] });

    const plan = await service.get('p-1', 'plan-1', 'nutri-1');

    expect(planRepository.replaceFindings).toHaveBeenCalledTimes(1);
    expect(plan.findings.map(({ type, patientConditionId }) => [type, patientConditionId])).toEqual([
      ['direct_condition', 'c-1'],
      ['composition', null],
    ]);
  });

  it.each([
    ['de otro nutricionista', 'p-1', 'nutri-2'],
    ['de otro paciente', 'p-2', 'nutri-1'],
  ])('un plan %s da 404 sin escribir nada', async (_, patientId, nutritionistId) => {
    const { service, planRepository } = setup();

    await expect(service.get(patientId, 'plan-1', nutritionistId)).rejects.toMatchObject({
      status: 404,
      message: PLAN_NOT_FOUND_MESSAGE,
    });
    expect(planRepository.replaceFindings).not.toHaveBeenCalled();
  });
});

describe('plan.service.update — edición del borrador', () => {
  const TEXTS = { introduction: 'Nueva introducción', clinicalRecommendations: null };

  it('guarda el contenido con las copias del catálogo y los hallazgos en una sola escritura', async () => {
    const { service, planRepository } = setup();
    const meals = lunch([
      { type: 'food', foodId: 'pollo' },
      { type: 'food_group', foodGroupId: 'frutas' },
      { type: 'recipe', recipeId: 'tarta' },
      { type: 'unrecognized', originalText: 'Mate cocido' },
    ]);

    await service.update('p-1', 'plan-1', 'nutri-1', { ...TEXTS, meals });

    expect(planRepository.replaceDraft).toHaveBeenCalledTimes(1);
    const [id, patientId, nutritionistId, data] = planRepository.replaceDraft.mock.calls[0];
    expect([id, patientId, nutritionistId]).toEqual(['plan-1', 'p-1', 'nutri-1']);
    expect(data.fields).toEqual(TEXTS);

    const items = data.meals[0].options[0].items.map(({ id: _id, ...item }) => item);
    expect(items).toEqual([
      { order: 1, type: 'food', foodId: 'pollo', foodName: 'Pollo', foodCategories: ['protein'] },
      { order: 2, type: 'food_group', foodGroupId: 'frutas', foodGroupName: 'Frutas' },
      { order: 3, type: 'recipe', recipeId: 'tarta' },
      { order: 4, type: 'unrecognized', originalText: 'Mate cocido' },
    ]);
    expect(data.findings.map(({ type }) => type)).toEqual(['unrecognized_item', 'composition']);
    expect(data.findings[0].optionItemId).toBe(data.meals[0].options[0].items[3].id);
  });

  it('un guardado parcial se conserva tal cual, sin completar nada (borrador)', async () => {
    const { service, planRepository } = setup();
    const meals = [
      { mealType: 'lunch', instructions: null, options: [{ description: 'Opción vacía', items: [] }] },
      { mealType: 'dinner', instructions: 'Liviana', options: [] },
    ];

    await service.update('p-1', 'plan-1', 'nutri-1', { ...TEXTS, meals });

    const [, , , data] = planRepository.replaceDraft.mock.calls[0];
    expect(data.meals.map(({ mealType, instructions, options }) => [mealType, instructions, options.length])).toEqual([
      ['lunch', null, 1],
      ['dinner', 'Liviana', 0],
    ]);
    expect(data.meals[0].options[0]).toMatchObject({ description: 'Opción vacía', items: [] });
  });

  it('conserva un alimento y una receta dados de baja que ya estaban en el plan', async () => {
    const { service, planRepository } = setup();

    await service.update('p-1', 'plan-1', 'nutri-1', {
      ...TEXTS,
      meals: lunch([
        { type: 'food', foodId: 'pera' },
        { type: 'recipe', recipeId: 'vieja' },
      ]),
    });

    expect(planRepository.replaceDraft).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['un alimento que no ve el nutricionista', { type: 'food', foodId: 'privado-de-otro' }, 'el alimento no existe'],
    ['un grupo inexistente', { type: 'food_group', foodGroupId: 'no-existe' }, 'el grupo de alimentos no existe'],
    ['una receta ajena', { type: 'recipe', recipeId: 'receta-de-otro' }, 'la receta no existe'],
  ])('rechaza %s con 400 en details.fields.meals y no escribe', async (_, item, reason) => {
    const { service, planRepository } = setup();
    const meals = lunch([{ type: 'food', foodId: 'pollo' }, item]);

    const error = await service.update('p-1', 'plan-1', 'nutri-1', { ...TEXTS, meals }).catch((caught) => caught);

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(error.details.fields.meals).toBe(`Opción 1 del almuerzo, ítem 2: ${reason}`);
    expect(planRepository.replaceDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['un alimento', { type: 'food', foodId: 'pera' }, 'el alimento está dado de baja'],
    ['una receta', { type: 'recipe', recipeId: 'vieja' }, 'la receta está dada de baja'],
  ])('no deja agregar %s dado de baja a un plan que no lo tenía', async (_, item, reason) => {
    const { service, planRepository } = setup();
    planRepository.findByIdForPatient.mockResolvedValueOnce({ ...STORED_PLAN, meals: [] });

    await expect(service.update('p-1', 'plan-1', 'nutri-1', { ...TEXTS, meals: lunch([item]) })).rejects.toMatchObject({
      status: 400,
      details: { fields: { meals: `Opción 1 del almuerzo, ítem 1: ${reason}` } },
    });
    expect(planRepository.replaceDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['de otro nutricionista', 'p-1', 'nutri-2'],
    ['de otro paciente', 'p-2', 'nutri-1'],
  ])('un plan %s da 404 sin escribir nada', async (_, patientId, nutritionistId) => {
    const { service, planRepository } = setup();

    await expect(service.update(patientId, 'plan-1', nutritionistId, { ...TEXTS, meals: [] })).rejects.toMatchObject({
      status: 404,
    });
    expect(planRepository.replaceDraft).not.toHaveBeenCalled();
  });
});
