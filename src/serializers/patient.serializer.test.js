const { serializePatient } = require('./patient.serializer');

describe('serializePatient', () => {
  it('omite nutritionistId y convierte referenceWeight a number', () => {
    const result = serializePatient({
      id: 'p1',
      nutritionistId: 'nutri-1',
      firstName: 'Lucía',
      birthDate: new Date('1992-03-14T00:00:00.000Z'),
      referenceWeight: '68.5',
    });

    expect(result.nutritionistId).toBeUndefined();
    expect(result.referenceWeight).toBe(68.5);
    expect(typeof result.referenceWeight).toBe('number');
  });

  it('agrega age calculada a partir de birthDate', () => {
    const result = serializePatient({
      id: 'p1',
      nutritionistId: 'nutri-1',
      birthDate: new Date('1992-03-14T00:00:00.000Z'),
      referenceWeight: null,
    });

    expect(result.age).toBeGreaterThan(0);
  });

  it('age es null sin birthDate', () => {
    const result = serializePatient({
      id: 'p1',
      nutritionistId: 'nutri-1',
      birthDate: null,
      referenceWeight: null,
    });

    expect(result.age).toBeNull();
  });

  it('referenceWeight es null cuando no hay dato', () => {
    const result = serializePatient({
      id: 'p1',
      nutritionistId: 'nutri-1',
      birthDate: null,
      referenceWeight: null,
    });

    expect(result.referenceWeight).toBeNull();
  });
});
