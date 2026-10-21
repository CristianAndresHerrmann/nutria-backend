const { measurementSchema, consultationMeasurementSchema } = require('./measurement.schema');

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

  it.each([
    ['weight', 'kg'],
    ['height', 'cm'],
    ['skinfold', 'mm'],
    ['circumference', 'cm'],
    ['cholesterol', 'mg/dL'],
    ['triglycerides', 'mg/dL'],
    ['glucose', 'mg/dL'],
  ])('completa la unidad fija de %s cuando no viene', (type, unit) => {
    const result = measurementSchema.safeParse({ type, detail: 'Detalle', value: 70, date: '2026-09-01' });

    expect(result.success).toBe(true);
    expect(result.data.unit).toBe(unit);
  });

  it('acepta la unidad fija sin distinguir mayúsculas y la normaliza', () => {
    const result = measurementSchema.safeParse({ type: 'weight', value: 70, unit: 'KG', date: '2026-09-01' });

    expect(result.data.unit).toBe('kg');
  });

  it.each([
    ['weight', 'lb', 'La unidad del peso es kg'],
    ['height', 'm', 'La unidad de la talla es cm'],
    ['skinfold', 'cm', 'La unidad del pliegue es mm'],
    ['glucose', 'mmol/L', 'La unidad de la glucemia es mg/dL'],
  ])('rechaza %s en %s', (type, unit, message) => {
    const result = measurementSchema.safeParse({ type, detail: 'Detalle', value: 70, unit, date: '2026-09-01' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toEqual({ unit: message });
  });

  it('en otro acepta una unidad de la lista, escrita como en la lista', () => {
    const result = measurementSchema.safeParse({ type: 'other', detail: 'HbA1c', value: 6.1, unit: '%', date: '2026-09-01' });
    const anyCase = measurementSchema.safeParse({ type: 'other', detail: 'TSH', value: 2, unit: 'µuI/ml', date: '2026-09-01' });

    expect(result.data.unit).toBe('%');
    expect(anyCase.data.unit).toBe('µUI/mL');
  });

  it('en otro la unidad es opcional', () => {
    const result = measurementSchema.safeParse({ type: 'other', detail: 'Índice HOMA', value: 2.1, date: '2026-09-01' });

    expect(result.success).toBe(true);
    expect(result.data.unit).toBeNull();
  });

  it('en otro rechaza una unidad que no está en la lista', () => {
    const result = measurementSchema.safeParse({ type: 'other', detail: 'HbA1c', value: 6.1, unit: 'porciento', date: '2026-09-01' });

    expect(issuesByField(result)).toEqual({ unit: 'Elegí una unidad de la lista' });
  });

  it('rechaza una clave desconocida, como nutritionistId', () => {
    const result = measurementSchema.safeParse({ type: 'weight', value: 70, date: '2026-09-01', nutritionistId: 'x' });

    expect(result.success).toBe(false);
  });
});

describe('consultationMeasurementSchema — medición cargada con la consulta', () => {
  it('acepta tipo, valor, detalle y unidad, con las mismas reglas', () => {
    const result = consultationMeasurementSchema.safeParse({ type: 'height', value: '165' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type: 'height', value: 165, detail: null, unit: 'cm' });
  });

  it('exige detalle para una circunferencia', () => {
    const result = consultationMeasurementSchema.safeParse({ type: 'circumference', value: 82 });

    expect(issuesByField(result)).toHaveProperty('detail');
  });

  it.each([
    ['date', '2026-09-01'],
    ['consultationId', CONSULTATION_ID],
  ])('rechaza %s: lo pone el servidor a partir de la consulta', (key, value) => {
    const result = consultationMeasurementSchema.safeParse({ type: 'weight', value: 70, [key]: value });

    expect(result.success).toBe(false);
  });
});
