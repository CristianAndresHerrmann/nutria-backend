const { calculateBmi, withBmi } = require('./bmi');

const day = (value) => new Date(`${value}T00:00:00.000Z`);
const weight = (id, date, value) => ({ id, type: 'weight', value, date: day(date) });
const height = (id, date, value) => ({ id, type: 'height', value, date: day(date) });

function bmiOf(rows, id) {
  return withBmi(rows).find((row) => row.id === id).bmi;
}

describe('calculateBmi', () => {
  it('divide el peso en kg por la talla en metros al cuadrado, con un decimal', () => {
    expect(calculateBmi(70, 175)).toBe(22.9);
    expect(calculateBmi(70.2, 165)).toBe(25.8);
  });
});

describe('withBmi — IMC calculado a partir de peso y talla (RF-11)', () => {
  it('con peso y talla del mismo día calcula el IMC', () => {
    expect(bmiOf([weight('w', '2026-09-01', 70.2), height('h', '2026-09-01', 165)], 'w')).toBe(25.8);
  });

  it('sin talla el IMC es null', () => {
    expect(bmiOf([weight('w', '2026-09-01', 70.2)], 'w')).toBeNull();
  });

  it('con una talla de una fecha anterior usa esa talla', () => {
    expect(bmiOf([height('h', '2026-06-01', 165), weight('w', '2026-09-01', 70.2)], 'w')).toBe(25.8);
  });

  it('una talla posterior al peso no cuenta', () => {
    expect(bmiOf([weight('w', '2026-06-01', 70.2), height('h', '2026-09-01', 165)], 'w')).toBeNull();
  });

  it('con varias tallas anteriores usa la más reciente', () => {
    const rows = [height('h-1', '2025-01-01', 150), height('h-2', '2026-06-01', 165), weight('w', '2026-09-01', 70.2)];

    expect(bmiOf(rows, 'w')).toBe(25.8);
  });

  it('cada peso usa la talla vigente en su fecha', () => {
    const rows = [
      height('h-1', '2026-01-01', 150),
      weight('w-1', '2026-02-01', 45),
      height('h-2', '2026-06-01', 152),
      weight('w-2', '2026-07-01', 45.4),
    ];

    expect(bmiOf(rows, 'w-1')).toBe(calculateBmi(45, 150));
    expect(bmiOf(rows, 'w-2')).toBe(calculateBmi(45.4, 152));
  });

  it('dos tallas del mismo día se desempatan siempre igual, sin importar el orden de las filas', () => {
    const rows = [height('h-a', '2026-06-01', 160), height('h-b', '2026-06-01', 165), weight('w', '2026-09-01', 70.2)];

    expect(bmiOf(rows, 'w')).toBe(bmiOf([...rows].reverse(), 'w'));
  });

  it('las mediciones que no son peso llevan bmi null y no cambian', () => {
    const glucose = { id: 'g', type: 'glucose', value: 98, unit: 'mg/dL', date: day('2026-09-01') };
    const [result] = withBmi([glucose, height('h', '2026-09-01', 165)]);

    expect(result).toEqual({ ...glucose, bmi: null });
  });
});
