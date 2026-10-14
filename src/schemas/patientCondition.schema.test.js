const { patientConditionSchema } = require('./patientCondition.schema');

const PATHOLOGY_ID = '11111111-1111-1111-1111-111111111111';
const FOOD_ID = '22222222-2222-2222-2222-222222222222';
const FOOD_GROUP_ID = '33333333-3333-3333-3333-333333333333';

function issuesByField(result) {
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

describe('patientCondition.schema', () => {
  it('acepta una patología con su pathologyId', () => {
    const result = patientConditionSchema.safeParse({ type: 'pathology', pathologyId: PATHOLOGY_ID });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ foodId: null, foodGroupId: null, registeredAt: null });
  });

  it('acepta una intolerancia a un alimento sin patología asociada (RF-07)', () => {
    const result = patientConditionSchema.safeParse({ type: 'intolerance', foodId: FOOD_ID });

    expect(result.success).toBe(true);
  });

  it('acepta un rechazo a un grupo de alimentos', () => {
    const result = patientConditionSchema.safeParse({ type: 'rejection', foodGroupId: FOOD_GROUP_ID });

    expect(result.success).toBe(true);
  });

  it('rechaza una patología sin pathologyId', () => {
    const result = patientConditionSchema.safeParse({ type: 'pathology' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('pathologyId');
  });

  it('rechaza pathologyId en una condición que no es patología', () => {
    const result = patientConditionSchema.safeParse({
      type: 'allergy',
      pathologyId: PATHOLOGY_ID,
      foodId: FOOD_ID,
    });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('pathologyId');
  });

  it('rechaza alimento y grupo a la vez (excluyentes)', () => {
    const result = patientConditionSchema.safeParse({
      type: 'allergy',
      foodId: FOOD_ID,
      foodGroupId: FOOD_GROUP_ID,
    });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('foodGroupId');
  });

  it('rechaza una patología que además referencia un alimento', () => {
    const result = patientConditionSchema.safeParse({
      type: 'pathology',
      pathologyId: PATHOLOGY_ID,
      foodId: FOOD_ID,
    });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('foodId');
  });

  it('rechaza una condición que no es patología sin alimento ni grupo', () => {
    const result = patientConditionSchema.safeParse({ type: 'preference', observations: 'Prefiere comidas frías' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('foodId');
  });

  it('trata strings vacíos como ausencia de dato', () => {
    const result = patientConditionSchema.safeParse({
      type: 'allergy',
      pathologyId: '',
      foodId: FOOD_ID,
      foodGroupId: '',
    });

    expect(result.success).toBe(true);
    expect(result.data.pathologyId).toBeNull();
  });

  it('rechaza un tipo desconocido y campos fuera del schema', () => {
    expect(patientConditionSchema.safeParse({ type: 'otro', foodId: FOOD_ID }).success).toBe(false);
    expect(
      patientConditionSchema.safeParse({ type: 'allergy', foodId: FOOD_ID, patientId: FOOD_ID }).success,
    ).toBe(false);
  });
});
