const { z } = require('zod');
const { isMinor } = require('../utils/age');
const { optionalField, pastOrTodayDate } = require('./common.schema');

// Hoy se acepta (recién nacido).
const birthDateField = optionalField(pastOrTodayDate('La fecha de nacimiento'));

// Datos clínicos y contextuales (RF-04 a RF-14, T16). Todos opcionales: la
// ficha se puede guardar con solo algunos y completarse después (RNF-03,
// RNF-09). El mensaje no nombra el campo porque viaja como clave en
// details.fields y el frontend lo muestra debajo del input.
const CLINICAL_TEXT_MAX_LENGTH = 2000;

const CLINICAL_TEXT_FIELDS = [
  'medicalHistory',
  'medication',
  'externalTreatment',
  'physicalActivity',
  'smoking',
  'alcohol',
  'mealSchedule',
  'sleepSchedule',
  'intakePatterns',
  'cookingTime',
  'homeEquipment',
  'usualShoppingPlace',
  'mealsOutsideHome',
  'outsideEquipment',
  'occupation',
  'workContext',
];

const CLINICAL_BOOLEAN_FIELDS = ['cooks', 'likesCooking'];

const clinicalTextField = optionalField(
  z
    .string('Debe ser texto')
    .max(CLINICAL_TEXT_MAX_LENGTH, `No puede superar los ${CLINICAL_TEXT_MAX_LENGTH} caracteres`),
);
const clinicalBooleanField = optionalField(z.boolean('Debe ser sí o no'));

const clinicalPatientFields = {
  ...Object.fromEntries(CLINICAL_TEXT_FIELDS.map((field) => [field, clinicalTextField])),
  ...Object.fromEntries(CLINICAL_BOOLEAN_FIELDS.map((field) => [field, clinicalBooleanField])),
};

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
  ...clinicalPatientFields,
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

// z.guid() y no z.uuid(): z.uuid() exige los bits de versión del RFC y
// rechazaría ids con la forma 8-4-4-4-12 que el servicio sí acepta
// (UUID_REGEX en patient.service.js). Las dos validaciones tienen que coincidir.
const patientIdParamsSchema = z.strictObject({ id: z.guid() });

module.exports = {
  createPatientSchema: patientSchema,
  updatePatientSchema: patientSchema,
  patientIdParamsSchema,
  GUARDIAN_FIELDS,
  CLINICAL_TEXT_FIELDS,
  CLINICAL_BOOLEAN_FIELDS,
  CLINICAL_TEXT_MAX_LENGTH,
};
