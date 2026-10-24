const { z } = require('zod');
const { emptyQuerySchema, pastOrTodayDate } = require('./common.schema');

// Cargar common.schema configura los mensajes por defecto de Zod en castellano.
describe('mensajes por defecto de Zod', () => {
  it('una clave no admitida nombra la clave, en castellano', () => {
    expect(emptyQuerySchema.safeParse({ page: '2' }).error.issues[0].message).toBe('Campo no admitido: "page"');
    expect(emptyQuerySchema.safeParse({ page: '2', sort: 'x' }).error.issues[0].message).toBe(
      'Campos no admitidos: "page", "sort"',
    );
  });

  it('un campo obligatorio que no vino dice que es obligatorio', () => {
    const result = z.strictObject({ name: z.string() }).safeParse({});

    expect(result.error.issues[0]).toMatchObject({ path: ['name'], message: 'Este campo es obligatorio' });
  });

  it.each([
    [z.string(), 1, 'Debe ser texto'],
    [z.number(), 'x', 'Debe ser un número'],
    [z.boolean(), 'si', 'Debe ser sí o no'],
    [z.array(z.string()), 'x', 'Debe ser una lista'],
    [z.object({}), 'x', 'Debe ser un objeto'],
  ])('un valor de otro tipo dice qué tipo espera (%#)', (schema, value, message) => {
    expect(schema.safeParse(value).error.issues[0].message).toBe(message);
  });

  it('el mensaje propio de un schema tiene prioridad', () => {
    expect(z.string('El nombre es obligatorio').safeParse(undefined).error.issues[0].message).toBe(
      'El nombre es obligatorio',
    );
  });

  it('el resto de los casos sale del locale en castellano, no en inglés', () => {
    const message = z.enum(['a', 'b']).safeParse('c').error.issues[0].message;

    expect(message).not.toMatch(/invalid|expected/i);
  });
});

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
