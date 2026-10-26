const { z } = require('zod');

// Mensajes en castellano para los errores que un schema no personaliza: una
// clave que el .strictObject no admite (en el body o en la query), un campo
// obligatorio que no vino, o uno de otro tipo. Sin esto, la API respondía el
// mensaje por defecto de Zod, en inglés ("Unrecognized key: ..."). El mensaje
// propio de un schema tiene prioridad sobre estos, y estos sobre el locale, que
// cubre el resto de los casos. Es configuración global de Zod: vive acá porque
// todas las rutas cargan este módulo.
const TYPE_MESSAGES = {
  string: 'Debe ser texto',
  number: 'Debe ser un número',
  boolean: 'Debe ser sí o no',
  array: 'Debe ser una lista',
  object: 'Debe ser un objeto',
};

z.config(z.locales.es());
z.config({
  customError(issue) {
    if (issue.code === 'unrecognized_keys') {
      const keys = issue.keys.map((key) => `"${key}"`).join(', ');
      return issue.keys.length === 1 ? `Campo no admitido: ${keys}` : `Campos no admitidos: ${keys}`;
    }
    if (issue.code === 'invalid_type') {
      return issue.input === undefined ? 'Este campo es obligatorio' : TYPE_MESSAGES[issue.expected];
    }
    return undefined;
  },
});

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

// Nombre de un ítem de catálogo (grupo, alimento, patología). Los espacios de más
// se normalizan antes de guardar: "Pan  francés " y "Pan francés" son el mismo
// nombre, y la unicidad (citext en la base) no distingue mayúsculas.
function catalogName(label) {
  return z
    .string(`${label} es obligatorio`)
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, `${label} es obligatorio`).max(100, `${label} no puede superar los 100 caracteres`));
}

// Email de una cuenta. Se guarda y se busca sin espacios y en minúsculas, así
// "Ana@Nutria.com " y "ana@nutria.com" son la misma cuenta al darla de alta y al
// iniciar sesión.
function accountEmail({ required = 'El email es obligatorio', invalid = 'El email no tiene un formato válido' } = {}) {
  return z.string(required).trim().toLowerCase().min(1, required).email(invalid);
}

// Contraseña que define el administrador (alta y restablecimiento) o el script
// del administrador. bcrypt ignora lo que pase de 72 bytes: más largo, dos
// contraseñas distintas validarían igual, así que se rechaza.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const accountPassword = z
  .string('La contraseña es obligatoria')
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES, 'La contraseña es demasiado larga');

// :id de los catálogos. z.guid() y no z.uuid(), por lo mismo que en
// patientIdParamsSchema: el seed y los tests usan ids que no respetan los bits
// de versión del RFC.
const catalogIdParamsSchema = z.strictObject({ id: z.guid() });

module.exports = {
  emptyQuerySchema,
  optionalField,
  pastOrTodayDate,
  catalogName,
  catalogIdParamsSchema,
  accountEmail,
  accountPassword,
};
