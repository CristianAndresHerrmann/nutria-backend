const { z } = require('zod');
const { isMinor } = require('../utils/age');

// Normaliza "" / null / undefined a null antes de validar el tipo real, para
// que el alta parcial (solo nombre y apellido) no tenga que mandar cada campo
// opcional explícitamente como null.
function optionalField(schema) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return typeof value === 'string' ? value.trim() : value;
  }, schema.nullable());
}

const birthDateField = optionalField(
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento debe tener formato AAAA-MM-DD')
    .transform((value, ctx) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'La fecha de nacimiento no es válida' });
        return z.NEVER;
      }
      return date;
    }),
);

const basePatientFields = {
  firstName: z.string().trim().min(1, 'El nombre es obligatorio'),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio'),
  birthDate: birthDateField,
  phone: optionalField(z.string().max(50)),
  email: optionalField(z.string().email('El email no tiene un formato válido')),
  livesWith: optionalField(z.string().max(255)),
  goal: optionalField(z.string().max(255)),
  referenceWeight: optionalField(z.coerce.number('El peso de referencia debe ser un número').positive('El peso de referencia debe ser mayor a cero')),
  guardianName: optionalField(z.string().max(255)),
  guardianRelationship: optionalField(z.string().max(255)),
  guardianContact: optionalField(z.string().max(255)),
  attendsAccompanied: optionalField(z.boolean()),
  registrationComplete: z.boolean().default(false),
};

const GUARDIAN_FIELDS = ['guardianName', 'guardianRelationship', 'guardianContact', 'attendsAccompanied'];

function requireGuardianForMinors(data, ctx) {
  if (!isMinor(data.birthDate)) return;

  for (const field of GUARDIAN_FIELDS) {
    if (data[field] === null || data[field] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: 'Dato del adulto responsable obligatorio: el paciente es menor de edad',
      });
    }
  }
}

// Alta y edición comparten el mismo formulario en el frontend (mismo modo,
// misma forma de body), así que comparten también el schema: ambas mandan el
// objeto completo, no un diff parcial de campos.
const patientSchema = z.strictObject(basePatientFields).superRefine(requireGuardianForMinors);

module.exports = { createPatientSchema: patientSchema, updatePatientSchema: patientSchema, GUARDIAN_FIELDS };
