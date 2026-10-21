const { z } = require('zod');
const { MeasurementType } = require('@prisma/client');
const { optionalField, pastOrTodayDate } = require('./common.schema');

// Tipos que necesitan precisar qué se midió: qué pliegue, qué circunferencia,
// qué parámetro de laboratorio. Misma lista que el CHECK measurement_detail_chk
// de la migración.
const TYPES_REQUIRING_DETAIL = [
  MeasurementType.skinfold,
  MeasurementType.circumference,
  MeasurementType.other,
];

// Cada tipo tiene una unidad fija, salvo `other`. En peso y talla es
// imprescindible porque el IMC se calcula con ellos (RF-11): un peso en libras
// daría un IMC sin sentido. En el resto evita que el mismo dato quede en
// unidades distintas a lo largo del histórico. El frontend las ofrece en un
// desplegable (espejo en src/pages/patientMeasurements.js del frontend).
const FIXED_UNITS = {
  [MeasurementType.weight]: { unit: 'kg', message: 'La unidad del peso es kg' },
  [MeasurementType.height]: { unit: 'cm', message: 'La unidad de la talla es cm' },
  [MeasurementType.skinfold]: { unit: 'mm', message: 'La unidad del pliegue es mm' },
  [MeasurementType.circumference]: { unit: 'cm', message: 'La unidad de la circunferencia es cm' },
  [MeasurementType.cholesterol]: { unit: 'mg/dL', message: 'La unidad del colesterol es mg/dL' },
  [MeasurementType.triglycerides]: { unit: 'mg/dL', message: 'La unidad de los triglicéridos es mg/dL' },
  [MeasurementType.glucose]: { unit: 'mg/dL', message: 'La unidad de la glucemia es mg/dL' },
};

// `other` es cualquier otro parámetro (HbA1c, hemoglobina, TSH, ferritina), así
// que su unidad se elige de una lista de unidades de laboratorio, o no lleva.
// Si un análisis trae una que no está, se agrega acá y en el frontend.
const OTHER_UNITS = ['%', 'g/dL', 'mg/dL', 'mg/L', 'µg/dL', 'ng/mL', 'pg/mL', 'mmol/L', 'mEq/L', 'UI/L', 'µUI/mL'];
const OTHER_UNIT_MESSAGE = 'Elegí una unidad de la lista';

function findUnit(units, unit) {
  return units.find((candidate) => candidate.toLowerCase() === unit.toLowerCase());
}

function requireDetailByType(data, ctx) {
  if (TYPES_REQUIRING_DETAIL.includes(data.type) && data.detail === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['detail'],
      message: 'Indicá qué se midió (por ejemplo, qué pliegue o qué circunferencia)',
    });
  }
}

// Sin unidad se toma la fija; con otra distinta (sin distinguir mayúsculas) es
// un error en vez de una conversión, para no guardar un valor que el
// profesional no escribió.
function requireValidUnit(data, ctx) {
  if (data.unit === null) return;
  const fixed = FIXED_UNITS[data.type];
  if (fixed && !findUnit([fixed.unit], data.unit)) {
    ctx.addIssue({ code: 'custom', path: ['unit'], message: fixed.message });
  }
  if (!fixed && !findUnit(OTHER_UNITS, data.unit)) {
    ctx.addIssue({ code: 'custom', path: ['unit'], message: OTHER_UNIT_MESSAGE });
  }
}

function validateMeasurement(data, ctx) {
  requireDetailByType(data, ctx);
  requireValidUnit(data, ctx);
}

// Deja la unidad escrita como en la lista ("MG/DL" pasa a "mg/dL").
function withCanonicalUnit(data) {
  const fixed = FIXED_UNITS[data.type];
  if (fixed) return { ...data, unit: fixed.unit };
  return data.unit === null ? data : { ...data, unit: findUnit(OTHER_UNITS, data.unit) };
}

// Solo validaciones técnicas (valor positivo, tipo válido, detalle): ningún
// umbral clínico. Ningún tipo es obligatorio, así que un paciente sin
// laboratorio es un caso válido (RF-12).
const baseFields = {
  type: z.enum(Object.values(MeasurementType), 'El tipo de medición no es válido'),
  detail: optionalField(z.string().max(255)),
  value: z.coerce
    .number('El valor debe ser un número')
    .positive('El valor debe ser mayor a cero')
    .max(999999.99, 'El valor es demasiado grande'),
  unit: optionalField(z.string().max(50)),
};

function measurementObject(fields) {
  return z.strictObject(fields).superRefine(validateMeasurement).transform(withCanonicalUnit);
}

// POST y PUT /patients/:id/measurements.
const measurementSchema = measurementObject({
  ...baseFields,
  date: pastOrTodayDate('La fecha de la medición'),
  // Una medición puede cargarse fuera de una consulta (RF-11, RF-12).
  consultationId: optionalField(z.guid('La consulta no es válida')),
});

// Medición cargada junto con la consulta (POST /patients/:id/consultations):
// la fecha y la consulta las pone el servidor, así que mandarlas da 400.
const consultationMeasurementSchema = measurementObject(baseFields);

// /patients/:id/measurements/:measurementId. z.guid() por lo mismo que
// patientIdParamsSchema: el seed y los tests usan ids sin los bits de versión.
const measurementParamsSchema = z.strictObject({ id: z.guid(), measurementId: z.guid() });

module.exports = {
  measurementSchema,
  consultationMeasurementSchema,
  measurementParamsSchema,
  TYPES_REQUIRING_DETAIL,
  FIXED_UNITS,
  OTHER_UNITS,
};
