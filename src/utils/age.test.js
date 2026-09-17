const { calculateAge, isMinor } = require('./age');

describe('calculateAge', () => {
  it('devuelve null sin fecha de nacimiento', () => {
    expect(calculateAge(null)).toBeNull();
  });

  it('calcula la edad cuando ya pasó el cumpleaños este año', () => {
    const now = new Date('2026-09-16T12:00:00.000Z');
    expect(calculateAge(new Date('1992-03-14T00:00:00.000Z'), now)).toBe(34);
  });

  it('no descuenta el año el mismo día del cumpleaños', () => {
    const now = new Date('2026-03-14T00:00:00.000Z');
    expect(calculateAge(new Date('1992-03-14T00:00:00.000Z'), now)).toBe(34);
  });

  it('descuenta un año si el cumpleaños todavía no llegó este año', () => {
    const now = new Date('2026-03-13T23:59:59.000Z');
    expect(calculateAge(new Date('1992-03-14T00:00:00.000Z'), now)).toBe(33);
  });
});

describe('isMinor', () => {
  it('es true un día antes de cumplir 18', () => {
    const now = new Date('2026-05-09T00:00:00.000Z');
    expect(isMinor(new Date('2008-05-10T00:00:00.000Z'), now)).toBe(true);
  });

  it('es false el día que cumple 18', () => {
    const now = new Date('2026-05-10T00:00:00.000Z');
    expect(isMinor(new Date('2008-05-10T00:00:00.000Z'), now)).toBe(false);
  });

  it('es false sin fecha de nacimiento', () => {
    expect(isMinor(null)).toBe(false);
  });
});
