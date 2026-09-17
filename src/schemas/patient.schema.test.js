const { createPatientSchema } = require('./patient.schema');

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

  it('rechaza nombre y apellido vacíos', () => {
    const result = createPatientSchema.safeParse({ firstName: '  ', lastName: 'Diaz' });

    expect(result.success).toBe(false);
  });
});
