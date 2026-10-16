const { pastOrTodayDate } = require('./common.schema');

// Helper compartido por todas las fechas de la API (nacimiento, medición,
// registro de condición y, desde T19, consulta). Los schemas que lo usan solo
// prueban su campo; acá se cubre el helper en sí.
const dateSchema = pastOrTodayDate('La fecha X');

function messageOf(result) {
  return result.error.issues[0].message;
}

function isoDaysFromTodayUtc(days) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
    .toISOString()
    .slice(0, 10);
}

describe('pastOrTodayDate', () => {
  it.each(['2023-02-30', '2023-02-29', '2023-04-31', '2023-13-01', '2023-00-10', '2023-01-00'])(
    'rechaza la fecha inexistente %s',
    (value) => {
      const result = dateSchema.safeParse(value);

      expect(result.success).toBe(false);
      expect(messageOf(result)).toBe('La fecha X no es válida');
    },
  );

  it.each(['2024-02-29', '2000-02-29'])('acepta el 29 de febrero de un año bisiesto (%s)', (value) => {
    const result = dateSchema.safeParse(value);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(new Date(`${value}T00:00:00.000Z`));
  });

  it('devuelve la fecha en medianoche UTC, sin corrimiento por zona horaria', () => {
    const result = dateSchema.safeParse('1992-03-14');

    expect(result.data.toISOString()).toBe('1992-03-14T00:00:00.000Z');
  });

  it.each(['30/02/2023', '2023-2-3', '', '2023-02-30T00:00:00Z'])('rechaza el formato %j', (value) => {
    const result = dateSchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(messageOf(result)).toBe('La fecha X debe tener formato AAAA-MM-DD');
  });

  it('exige un string', () => {
    const result = dateSchema.safeParse(undefined);

    expect(result.success).toBe(false);
    expect(messageOf(result)).toBe('La fecha X es obligatoria');
  });

  it('rechaza una fecha futura y acepta hoy', () => {
    const tomorrow = dateSchema.safeParse(isoDaysFromTodayUtc(1));
    const today = dateSchema.safeParse(isoDaysFromTodayUtc(0));

    expect(tomorrow.success).toBe(false);
    expect(messageOf(tomorrow)).toBe('La fecha X no puede ser futura');
    expect(today.success).toBe(true);
  });
});
