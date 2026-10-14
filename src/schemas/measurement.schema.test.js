const { measurementSchema } = require('./measurement.schema');

const CONSULTATION_ID = '44444444-4444-4444-4444-444444444444';

function issuesByField(result) {
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

describe('measurement.schema', () => {
  it('acepta un peso sin detalle ni consulta (medición suelta)', () => {
    const result = measurementSchema.safeParse({ type: 'weight', value: 68.4, unit: 'kg', date: '2026-09-01' });

    expect(result.success).toBe(true);
    expect(result.data.consultationId).toBeNull();
    expect(result.data.detail).toBeNull();
    expect(result.data.date).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('acepta un valor de laboratorio asociado a una consulta', () => {
    const result = measurementSchema.safeParse({
      type: 'glucose',
      value: '98',
      unit: 'mg/dL',
      date: '2026-09-01',
      consultationId: CONSULTATION_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data.value).toBe(98);
  });

  it.each(['skinfold', 'circumference', 'other'])('exige detalle para el tipo %s', (type) => {
    const result = measurementSchema.safeParse({ type, value: 10, date: '2026-09-01' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('detail');
  });

  it('acepta una circunferencia con detalle', () => {
    const result = measurementSchema.safeParse({
      type: 'circumference',
      detail: 'Cintura',
      value: 82,
      unit: 'cm',
      date: '2026-09-01',
    });

    expect(result.success).toBe(true);
  });

  it.each([0, -3])('rechaza el valor %s', (value) => {
    const result = measurementSchema.safeParse({ type: 'weight', value, date: '2026-09-01' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('value');
  });

  it('exige fecha y rechaza fechas futuras o inexistentes', () => {
    const base = { type: 'weight', value: 70 };

    expect(issuesByField(measurementSchema.safeParse(base))).toHaveProperty('date');
    expect(measurementSchema.safeParse({ ...base, date: '2999-01-01' }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...base, date: '2026-02-30' }).success).toBe(false);
  });

  it('rechaza un tipo desconocido', () => {
    const result = measurementSchema.safeParse({ type: 'imc', value: 24, date: '2026-09-01' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('type');
  });
});
