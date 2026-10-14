const { z } = require('zod');

// Para rutas que no aceptan parámetros de query: un parámetro desconocido da
// 400, igual que una clave desconocida en el body de un .strictObject.
const emptyQuerySchema = z.strictObject({});

// Normaliza "" / null / undefined a null antes de validar el tipo real, para
// que el alta parcial no tenga que mandar cada campo opcional explícitamente
// como null.
function optionalField(schema) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return typeof value === 'string' ? value.trim() : value;
  }, schema.nullable());
}

// Fecha AAAA-MM-DD que no puede ser futura (hoy se acepta), parseada a Date en
// UTC. `label` encabeza los mensajes: "La fecha de nacimiento debe tener...".
function pastOrTodayDate(label) {
  return z
    .string(`${label} es obligatoria`)
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} debe tener formato AAAA-MM-DD`)
    .transform((value, ctx) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      // Date desborda en vez de fallar: "2023-02-30" da 2023-03-02. Si al
      // volver a formatearla no coincide con lo recibido, la fecha no existe.
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        ctx.addIssue({ code: 'custom', message: `${label} no es válida` });
        return z.NEVER;
      }
      // En UTC, igual que el cálculo de edad.
      const now = new Date();
      const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      if (date.getTime() > todayUtc) {
        ctx.addIssue({ code: 'custom', message: `${label} no puede ser futura` });
        return z.NEVER;
      }
      return date;
    });
}

module.exports = { emptyQuerySchema, optionalField, pastOrTodayDate };
