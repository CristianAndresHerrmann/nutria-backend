const {
  consultationSchema,
  createConsultationSchema,
  consultationParamsSchema,
} = require('./consultation.schema');

function issuesByField(result) {
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

function isoDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

describe('consultation.schema — fecha y tipo', () => {
  it('acepta una consulta con solo fecha y tipo, sin mediciones ni hábitos (RNF-09)', () => {
    const result = createConsultationSchema.safeParse({ date: '2026-10-01', type: 'follow_up' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      date: new Date('2026-10-01T00:00:00.000Z'),
      type: 'follow_up',
      motivation: null,
      decisionOrigin: null,
      perceivedObstacle: null,
      mainHabit: null,
      observations: null,
      habits: [],
      measurements: [],
    });
  });

  it('acepta la fecha de hoy', () => {
    expect(createConsultationSchema.safeParse({ date: isoDate(0), type: 'first' }).success).toBe(true);
  });

  it.each([
    ['sin fecha', undefined, 'La fecha de la consulta es obligatoria'],
    ['con otro formato', '01/10/2026', 'La fecha de la consulta debe tener formato AAAA-MM-DD'],
    ['inexistente', '2026-02-30', 'La fecha de la consulta no es válida'],
    ['futura', isoDate(1), 'La fecha de la consulta no puede ser futura'],
  ])('rechaza una fecha %s', (_case, date, message) => {
    const result = createConsultationSchema.safeParse({ date, type: 'first' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toEqual({ date: message });
  });

  it.each([
    ['sin tipo', undefined],
    ['con un tipo que no existe', 'control'],
    ['con el tipo en castellano', 'primera'],
  ])('rechaza una consulta %s', (_case, type) => {
    const result = createConsultationSchema.safeParse({ date: '2026-10-01', type });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toEqual({ type: 'El tipo de consulta debe ser primera o seguimiento' });
  });

  it('el PUT valida fecha y tipo igual que el alta', () => {
    const result = consultationSchema.safeParse({ date: '2026-02-30', type: 'control' });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toEqual({
      date: 'La fecha de la consulta no es válida',
      type: 'El tipo de consulta debe ser primera o seguimiento',
    });
  });
});

describe('consultation.schema — campos de texto', () => {
  it('guarda los campos de RF-13 y RF-18 recortados, y los vacíos como null', () => {
    const result = createConsultationSchema.safeParse({
      date: '2026-10-01',
      type: 'first',
      motivation: '  Sentirse con más energía ',
      decisionOrigin: 'Propia',
      perceivedObstacle: '   ',
      mainHabit: '',
      observations: 'Viene derivada por su médica.',
    });

    expect(result.data).toMatchObject({
      motivation: 'Sentirse con más energía',
      decisionOrigin: 'Propia',
      perceivedObstacle: null,
      mainHabit: null,
      observations: 'Viene derivada por su médica.',
    });
  });

  it('rechaza un campo de texto demasiado largo', () => {
    const result = createConsultationSchema.safeParse({ date: '2026-10-01', type: 'first', motivation: 'a'.repeat(2001) });

    expect(issuesByField(result)).toEqual({ motivation: 'No puede superar los 2000 caracteres' });
  });

  it.each(['nutritionistId', 'patientId'])('rechaza %s en el body', (key) => {
    const result = createConsultationSchema.safeParse({ date: '2026-10-01', type: 'first', [key]: 'x' });

    expect(result.success).toBe(false);
  });
});

describe('consultation.schema — hábitos pautados', () => {
  it('acepta varios hábitos y recorta su descripción', () => {
    const result = createConsultationSchema.safeParse({
      date: '2026-10-01',
      type: 'first',
      habits: [{ description: ' Caminar 30 minutos ' }, { description: 'Tomar agua en el trabajo' }],
    });

    expect(result.data.habits).toEqual([
      { description: 'Caminar 30 minutos' },
      { description: 'Tomar agua en el trabajo' },
    ]);
  });

  it.each([
    ['vacía', [{ description: '   ' }], 'La descripción del hábito es obligatoria'],
    ['ausente', [{}], 'La descripción del hábito es obligatoria'],
    ['demasiado larga', [{ description: 'a'.repeat(501) }], 'La descripción del hábito no puede superar los 500 caracteres'],
  ])('rechaza un hábito con descripción %s, señalado en el campo habits', (_case, habits, message) => {
    const result = createConsultationSchema.safeParse({ date: '2026-10-01', type: 'first', habits });

    expect(issuesByField(result)).toEqual({ habits: message });
  });

  it('rechaza un estado de cumplimiento en el alta: los hábitos nacen pendientes', () => {
    const result = createConsultationSchema.safeParse({
      date: '2026-10-01',
      type: 'first',
      habits: [{ description: 'Caminar', compliance: 'met' }],
    });

    expect(result.success).toBe(false);
  });

  it('rechaza más de 20 hábitos', () => {
    const habits = Array.from({ length: 21 }, (_, index) => ({ description: `Hábito ${index}` }));

    expect(createConsultationSchema.safeParse({ date: '2026-10-01', type: 'first', habits }).success).toBe(false);
  });

  it('el PUT no acepta hábitos', () => {
    const result = consultationSchema.safeParse({ date: '2026-10-01', type: 'first', habits: [] });

    expect(result.success).toBe(false);
  });
});

describe('consultation.schema — mediciones tomadas en la consulta (T20)', () => {
  const base = { date: '2026-10-01', type: 'first' };

  it('acepta peso, talla y un valor de laboratorio, con la unidad fija completada', () => {
    const result = createConsultationSchema.safeParse({
      ...base,
      measurements: [
        { type: 'weight', value: 70.2 },
        { type: 'height', value: '165' },
        { type: 'glucose', value: 98, unit: 'mg/dL' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data.measurements).toEqual([
      { type: 'weight', value: 70.2, unit: 'kg', detail: null },
      { type: 'height', value: 165, unit: 'cm', detail: null },
      { type: 'glucose', value: 98, unit: 'mg/dL', detail: null },
    ]);
  });

  it.each([
    ['un pliegue sin detalle', { type: 'skinfold', value: 12 }],
    ['un valor en cero', { type: 'weight', value: 0 }],
    ['un peso en libras', { type: 'weight', value: 150, unit: 'lb' }],
    ['una fecha propia', { type: 'weight', value: 70, date: '2026-09-01' }],
  ])('rechaza %s, señalado en el campo measurements', (_case, measurement) => {
    const result = createConsultationSchema.safeParse({ ...base, measurements: [measurement] });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('measurements');
  });

  it('el PUT no acepta mediciones', () => {
    expect(consultationSchema.safeParse({ ...base, measurements: [] }).success).toBe(false);
  });
});

describe('consultation.schema — params', () => {
  it('exige id de paciente y de consulta', () => {
    const id = '11111111-1111-1111-1111-111111111111';

    expect(consultationParamsSchema.safeParse({ id, consultationId: id }).success).toBe(true);
    expect(consultationParamsSchema.safeParse({ id, consultationId: 'no-es-un-uuid' }).success).toBe(false);
  });
});
