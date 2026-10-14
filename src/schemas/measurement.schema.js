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

function requireDetailByType(data, ctx) {
  if (TYPES_REQUIRING_DETAIL.includes(data.type) && data.detail === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['detail'],
      message: 'Indicá qué se midió (por ejemplo, qué pliegue o qué circunferencia)',
    });
  }
}

const measurementSchema = z
  .strictObject({
    type: z.enum(Object.values(MeasurementType), 'El tipo de medición no es válido'),
    detail: optionalField(z.string().max(255)),
    value: z.coerce
      .number('El valor debe ser un número')
      .positive('El valor debe ser mayor a cero')
      .max(999999.99, 'El valor es demasiado grande'),
    unit: optionalField(z.string().max(50)),
    date: pastOrTodayDate('La fecha de la medición'),
    // Una medición puede cargarse fuera de una consulta (RF-11, RF-12).
    consultationId: optionalField(z.guid('La consulta no es válida')),
  })
  .superRefine(requireDetailByType);

module.exports = { measurementSchema, TYPES_REQUIRING_DETAIL };
