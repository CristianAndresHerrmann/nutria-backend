const { validatePlan, validationResult } = require('./validatePlan');

const GROUPS = [
  { id: 'carnes', parentId: null },
  { id: 'verduras', parentId: null },
  { id: 'cereales', parentId: null },
  { id: 'lacteos', parentId: null },
];

const food = (id, name, foodGroupId, categories, extra = {}) => ({
  id,
  name,
  foodGroupId,
  active: true,
  nutritionistId: null,
  categories: categories.map((category) => ({ category })),
  ...extra,
});

const FOODS = [
  food('pollo', 'Pollo', 'carnes', ['protein']),
  food('tomate', 'Tomate', 'verduras', ['vegetable']),
  food('arroz', 'Arroz', 'cereales', ['carbohydrate']),
  food('pan', 'Pan', 'cereales', ['carbohydrate']),
  food('leche', 'Leche', 'lacteos', ['protein']),
  food('yogur', 'Yogur', 'lacteos', ['protein']),
  food('ricota', 'Ricota casera', 'lacteos', ['protein'], { nutritionistId: 'nutri-1' }),
];

const RECIPES = [
  {
    id: 'ensalada',
    name: 'Ensalada de pollo',
    ingredients: [{ food: { id: 'pollo', name: 'Pollo', foodGroupId: 'carnes' } }, { food: { id: 'tomate', name: 'Tomate', foodGroupId: 'verduras' } }],
  },
];

const CATALOG = { foods: FOODS, groups: GROUPS, recipes: RECIPES };

const foodItem = (id, foodId, order = 1) => {
  const { name, categories } = FOODS.find((row) => row.id === foodId);
  return { id, order, type: 'food', foodId, foodName: name, foodCategories: categories.map(({ category }) => category) };
};
const groupItem = (id, foodGroupId, foodGroupName, order = 1) => ({ id, order, type: 'food_group', foodGroupId, foodGroupName });
const recipeItem = (id, recipeId, order = 1) => ({ id, order, type: 'recipe', recipeId });
const unrecognizedItem = (id, originalText, order = 1) => ({ id, order, type: 'unrecognized', originalText });

const option = (id, items, order = 1) => ({ id, order, items: items.map((item, index) => ({ ...item, order: index + 1 })) });
const plan = (meals) => ({ id: 'plan-1', meals });

const COMPLETE_LUNCH = [foodItem('i-tomate', 'tomate'), foodItem('i-pollo', 'pollo'), foodItem('i-arroz', 'arroz')];

describe('validatePlan — motor de reglas v1', () => {
  describe('ítem no reconocido (DA-30)', () => {
    it('dispara un bloqueo sobre el ítem', () => {
      const findings = validatePlan({
        plan: plan([{ mealType: 'lunch', options: [option('o-1', [...COMPLETE_LUNCH, unrecognizedItem('i-x', 'tarta de acelga')])] }]),
        conditions: [],
        catalog: CATALOG,
      });

      expect(findings).toEqual([
        {
          type: 'unrecognized_item',
          severity: 'blocking',
          optionId: null,
          optionItemId: 'i-x',
          patientConditionId: null,
          message: '"tarta de acelga" no está en el catálogo y no se puede validar hasta reemplazarlo por un alimento, un grupo o una receta',
        },
      ]);
    });

    it('no dispara con ítems del catálogo', () => {
      const findings = validatePlan({
        plan: plan([{ mealType: 'lunch', options: [option('o-1', COMPLETE_LUNCH)] }]),
        conditions: [],
        catalog: CATALOG,
      });

      expect(findings).toEqual([]);
    });

    it('no aporta categorías: la opción puede quedar además incompleta', () => {
      const items = [foodItem('i-tomate', 'tomate'), foodItem('i-pollo', 'pollo'), unrecognizedItem('i-x', 'fideos')];

      const findings = validatePlan({ plan: plan([{ mealType: 'lunch', options: [option('o-1', items)] }]), conditions: [], catalog: CATALOG });

      expect(findings.map(({ type }) => type)).toEqual(['unrecognized_item', 'composition']);
    });
  });

  describe('composición (RF-44)', () => {
    it('opción con composición completa: sin hallazgos', () => {
      const findings = validatePlan({
        plan: plan([{ mealType: 'dinner', options: [option('o-1', COMPLETE_LUNCH)] }]),
        conditions: [],
        catalog: CATALOG,
      });

      expect(findings).toEqual([]);
    });

    it('opción incompleta: advertencia sobre la opción, sin ítem, con lo que falta', () => {
      const findings = validatePlan({
        plan: plan([{ mealType: 'dinner', options: [option('o-1', [foodItem('i-pollo', 'pollo')])] }]),
        conditions: [],
        catalog: CATALOG,
      });

      expect(findings).toEqual([
        {
          type: 'composition',
          severity: 'warning',
          optionId: 'o-1',
          optionItemId: null,
          patientConditionId: null,
          message: 'Opción 1 de la cena: falta verdura y hidrato',
        },
      ]);
    });

    it('un ítem de grupo ("un lácteo") y pan completan el desayuno', () => {
      const items = [groupItem('i-lacteo', 'lacteos', 'Lácteos'), foodItem('i-pan', 'pan')];

      const findings = validatePlan({ plan: plan([{ mealType: 'breakfast', options: [option('o-1', items)] }]), conditions: [], catalog: CATALOG });

      expect(findings).toEqual([]);
    });

    it('una receta aporta las categorías de sus ingredientes', () => {
      const items = [recipeItem('i-ensalada', 'ensalada'), foodItem('i-arroz', 'arroz')];

      const findings = validatePlan({ plan: plan([{ mealType: 'lunch', options: [option('o-1', items)] }]), conditions: [], catalog: CATALOG });

      expect(findings).toEqual([]);
    });

    it('cada opción se evalúa por separado y el mensaje la numera dentro de su comida', () => {
      const findings = validatePlan({
        plan: plan([
          {
            mealType: 'afternoon_snack',
            options: [option('o-2', [foodItem('i-pan', 'pan')], 20), option('o-1', [foodItem('i-leche', 'leche'), foodItem('i-pan2', 'pan')], 10)],
          },
        ]),
        conditions: [],
        catalog: CATALOG,
      });

      expect(findings.map(({ optionId, message }) => [optionId, message])).toEqual([['o-2', 'Opción 2 de la merienda: falta proteína']]);
    });
  });

  describe('condición directa dentro del plan', () => {
    const allergyToRicota = { id: 'c-1', type: 'allergy', foodId: 'ricota', foodGroupId: null, food: { name: 'Ricota casera' }, foodGroup: null };
    const preferenceForMilk = { id: 'c-2', type: 'preference', foodId: 'leche', foodGroupId: null, food: { name: 'Leche' }, foodGroup: null };

    it('bloquea un alimento privado restringido, sin optionId (finding_origin_chk)', () => {
      const items = [foodItem('i-ricota', 'ricota'), foodItem('i-pan', 'pan')];

      const findings = validatePlan({
        plan: plan([{ mealType: 'breakfast', options: [option('o-1', items)] }]),
        conditions: [allergyToRicota],
        catalog: CATALOG,
      });

      expect(findings).toEqual([expect.objectContaining({ type: 'direct_condition', optionId: null, optionItemId: 'i-ricota', patientConditionId: 'c-1' })]);
    });

    it('una preferencia no genera hallazgos', () => {
      const items = [foodItem('i-leche', 'leche'), foodItem('i-pan', 'pan')];

      const findings = validatePlan({ plan: plan([{ mealType: 'breakfast', options: [option('o-1', items)] }]), conditions: [preferenceForMilk], catalog: CATALOG });

      expect(findings).toEqual([]);
    });
  });

  it('orden determinístico: comidas por tipo, opciones e ítems por posición, composición al final de la opción', () => {
    const lactoseIntolerance = { id: 'c-1', type: 'intolerance', foodId: null, foodGroupId: 'lacteos', food: null, foodGroup: { name: 'Lácteos' } };

    const findings = validatePlan({
      plan: plan([
        { mealType: 'dinner', options: [option('o-cena', [foodItem('i-tomate', 'tomate')])] },
        {
          mealType: 'breakfast',
          options: [
            {
              id: 'o-desayuno',
              order: 1,
              items: [
                { ...unrecognizedItem('i-x', 'mate cocido'), order: 2 },
                { ...foodItem('i-leche', 'leche'), order: 1 },
              ],
            },
          ],
        },
      ]),
      conditions: [lactoseIntolerance],
      catalog: CATALOG,
    });

    expect(findings.map(({ type, optionId, optionItemId }) => [type, optionId ?? optionItemId])).toEqual([
      ['direct_condition', 'i-leche'],
      ['unrecognized_item', 'i-x'],
      ['composition', 'o-desayuno'],
      ['composition', 'o-cena'],
    ]);
  });

  it('cada hallazgo respeta finding_origin_chk', () => {
    const conditions = [{ id: 'c-1', type: 'rejection', foodId: 'pollo', foodGroupId: null, food: { name: 'Pollo' }, foodGroup: null }];
    const findings = validatePlan({
      plan: plan([{ mealType: 'lunch', options: [option('o-1', [foodItem('i-pollo', 'pollo'), unrecognizedItem('i-x', 'fideos')])] }]),
      conditions,
      catalog: CATALOG,
    });

    const SHAPES = {
      direct_condition: { optionId: null, optionItemId: expect.any(String), patientConditionId: expect.any(String) },
      unrecognized_item: { optionId: null, optionItemId: expect.any(String), patientConditionId: null },
      composition: { optionId: expect.any(String), optionItemId: null, patientConditionId: null },
    };
    expect(findings.map(({ type }) => type).sort()).toEqual(['composition', 'direct_condition', 'unrecognized_item']);
    for (const finding of findings) {
      expect(finding).toMatchObject(SHAPES[finding.type]);
      expect(finding).not.toHaveProperty('clinicalRuleId');
    }
  });

  it('un plan sin comidas no tiene hallazgos', () => {
    expect(validatePlan({ plan: plan([]), conditions: [], catalog: CATALOG })).toEqual([]);
  });
});

describe('validationResult (RF-41)', () => {
  it('sin hallazgos, solo advertencias o con algún bloqueo', () => {
    expect(validationResult([])).toBe('no_findings');
    expect(validationResult([{ severity: 'warning' }])).toBe('warnings');
    expect(validationResult([{ severity: 'warning' }, { severity: 'blocking' }])).toBe('blocking');
  });
});
