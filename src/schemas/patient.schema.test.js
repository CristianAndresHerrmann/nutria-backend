const {
  createPatientSchema,
  CLINICAL_TEXT_FIELDS,
  CLINICAL_BOOLEAN_FIELDS,
  CLINICAL_TEXT_MAX_LENGTH,
} = require('./patient.schema');

describe('patient.schema', () => {
  it('acepta alta parcial con solo nombre y apellido', () => {
    const result = createPatientSchema.safeParse({ firstName: 'Ana', lastName: 'Diaz' });

    expect(result.success).toBe(true);
    expect(result.data.birthDate).toBeNull();
    expect(result.data.registrationComplete).toBe(false);
  });

  it('rechaza campos fuera del schema (ej. nutritionistId del cliente)', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Diaz',
      nutritionistId: 'no-deberia-poder-mandar-esto',
    });

    expect(result.success).toBe(false);
  });

  it('exige los cuatro datos del responsable cuando el paciente es menor', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Tomás',
      lastName: 'Gómez',
      birthDate: '2015-01-01',
    });

    expect(result.success).toBe(false);
    const paths = result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(
      expect.arrayContaining(['guardianName', 'guardianRelationship', 'guardianContact', 'attendsAccompanied']),
    );
  });

  it('acepta un menor cuando vienen los cuatro datos del responsable', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Tomás',
      lastName: 'Gómez',
      birthDate: '2015-01-01',
      guardianName: 'María Gómez',
      guardianRelationship: 'Madre',
      guardianContact: '+54 342 555-0202',
      attendsAccompanied: true,
    });

    expect(result.success).toBe(true);
  });

  it('no exige responsable para un paciente adulto', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Diaz',
      birthDate: '1990-01-01',
    });

    expect(result.success).toBe(true);
  });

  it('normaliza strings vacíos a null en campos opcionales', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Diaz',
      phone: '   ',
      referenceWeight: '',
    });

    expect(result.success).toBe(true);
    expect(result.data.phone).toBeNull();
    expect(result.data.referenceWeight).toBeNull();
  });

  it('rechaza un email con formato inválido', () => {
    const result = createPatientSchema.safeParse({ firstName: 'Ana', lastName: 'Diaz', email: 'no-es-un-email' });

    expect(result.success).toBe(false);
  });

  it.each(['2023-02-30', '2023-02-29', '2023-13-01'])('rechaza la fecha inexistente %s', (birthDate) => {
    const result = createPatientSchema.safeParse({ firstName: 'Ana', lastName: 'Diaz', birthDate });

    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path[0])).toContain('birthDate');
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    const result = createPatientSchema.safeParse({ firstName: 'Ana', lastName: 'Diaz', birthDate: '2004-02-29' });

    expect(result.success).toBe(true);
    expect(result.data.birthDate.toISOString()).toBe('2004-02-29T00:00:00.000Z');
  });

  it('rechaza una fecha de nacimiento futura', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = createPatientSchema.safeParse({ firstName: 'Ana', lastName: 'Diaz', birthDate: tomorrow });

    expect(result.success).toBe(false);
    const issue = result.error.issues.find((i) => i.path[0] === 'birthDate');
    expect(issue.message).toBe('La fecha de nacimiento no puede ser futura');
  });

  it('acepta la fecha de hoy (recién nacido, con responsable)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = createPatientSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Diaz',
      birthDate: today,
      guardianName: 'María Diaz',
      guardianRelationship: 'Madre',
      guardianContact: '+54 342 555-0202',
      attendsAccompanied: true,
    });

    expect(result.success).toBe(true);
  });

  it('rechaza nombre y apellido vacíos', () => {
    const result = createPatientSchema.safeParse({ firstName: '  ', lastName: 'Diaz' });

    expect(result.success).toBe(false);
  });
});

describe('patient.schema — datos clínicos y contextuales (T16)', () => {
  function issueFor(result, field) {
    return result.error.issues.find((issue) => issue.path[0] === field);
  }

  it('acepta una ficha con solo algunos datos clínicos y deja el resto en null', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Diaz',
      medicalHistory: 'Hipotiroidismo familiar',
      cooks: false,
    });

    expect(result.success).toBe(true);
    expect(result.data.medicalHistory).toBe('Hipotiroidismo familiar');
    expect(result.data.cooks).toBe(false);
    for (const field of [...CLINICAL_TEXT_FIELDS, ...CLINICAL_BOOLEAN_FIELDS]) {
      if (field !== 'medicalHistory' && field !== 'cooks') expect(result.data[field]).toBeNull();
    }
  });

  it('acepta todos los campos clínicos completos', () => {
    const body = { firstName: 'Ana', lastName: 'Diaz' };
    for (const field of CLINICAL_TEXT_FIELDS) body[field] = `Dato de ${field}`;
    for (const field of CLINICAL_BOOLEAN_FIELDS) body[field] = true;

    const result = createPatientSchema.safeParse(body);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject(body);
  });

  it('normaliza vacíos a null y recorta espacios en los textos clínicos', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Diaz',
      medication: '   ',
      occupation: '  Docente  ',
      likesCooking: '',
    });

    expect(result.success).toBe(true);
    expect(result.data.medication).toBeNull();
    expect(result.data.occupation).toBe('Docente');
    expect(result.data.likesCooking).toBeNull();
  });

  it('rechaza un texto clínico más largo que el máximo, con el error en su campo', () => {
    const result = createPatientSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Diaz',
      medicalHistory: 'a'.repeat(CLINICAL_TEXT_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    expect(issueFor(result, 'medicalHistory').message).toBe('No puede superar los 2000 caracteres');
  });

  it('rechaza un texto clínico que no es string', () => {
    const result = createPatientSchema.safeParse({ firstName: 'Ana', lastName: 'Diaz', smoking: 3 });

    expect(result.success).toBe(false);
    expect(issueFor(result, 'smoking').message).toBe('Debe ser texto');
  });

  it.each(CLINICAL_BOOLEAN_FIELDS)('rechaza "%s" si no es booleano', (field) => {
    const result = createPatientSchema.safeParse({ firstName: 'Ana', lastName: 'Diaz', [field]: 'si' });

    expect(result.success).toBe(false);
    expect(issueFor(result, field).message).toBe('Debe ser sí o no');
  });
});
