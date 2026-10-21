const { z } = require('zod');
const { ConsultationType } = require('@prisma/client');
const { optionalField, pastOrTodayDate } = require('./common.schema');
const { consultationMeasurementSchema } = require('./measurement.schema');

// Como en los datos clínicos del paciente: el mensaje no nombra el campo porque
// viaja como clave en details.fields y el frontend lo muestra debajo del input.
function textField(maxLength) {
  return optionalField(
    z.string('Debe ser texto').max(maxLength, `No puede superar los ${maxLength} caracteres`),
  );
}

const HABIT_DESCRIPTION_MAX_LENGTH = 500;
const MAX_HABITS_PER_CONSULTATION = 20;
const MAX_MEASUREMENTS_PER_CONSULTATION = 30;

// Fecha y tipo obligatorios; el resto es opcional, así una consulta se guarda
// aunque falten datos (RNF-09). Motivación, origen de la decisión, obstáculo y
// hábito principal son de RF-13; las observaciones libres, de RF-18.
const consultationFields = {
  date: pastOrTodayDate('La fecha de la consulta'),
  type: z.enum(Object.values(ConsultationType), 'El tipo de consulta debe ser primera o seguimiento'),
  motivation: textField(2000),
  decisionOrigin: textField(2000),
  perceivedObstacle: textField(2000),
  mainHabit: textField(2000),
  observations: textField(5000),
};

// PUT: solo los campos de la consulta. Los hábitos pautados se cargan al crearla
// y no se editan hasta su evaluación (Incremento 5), así que `habits` acá da 400
// como cualquier clave desconocida. Lo mismo `measurements`: después del alta,
// cada medición se edita por /patients/:id/measurements/:measurementId.
const consultationSchema = z.strictObject(consultationFields);

// Hábito pautado al cierre de la consulta (RF-22): lo redacta el profesional, sin
// catálogo. Es un objeto y no un string para poder sumarle campos en el
// Incremento 5 sin cambiar el contrato. El estado inicial (pending) lo pone la base.
const prescribedHabitSchema = z.strictObject({
  description: z
    .string('La descripción del hábito es obligatoria')
    .trim()
    .min(1, 'La descripción del hábito es obligatoria')
    .max(
      HABIT_DESCRIPTION_MAX_LENGTH,
      `La descripción del hábito no puede superar los ${HABIT_DESCRIPTION_MAX_LENGTH} caracteres`,
    ),
});

// POST: los campos de la consulta más los hábitos y las mediciones, ambos
// opcionales (0 o más). Las mediciones toman la fecha de la consulta (T20).
const createConsultationSchema = z.strictObject({
  ...consultationFields,
  habits: z
    .array(prescribedHabitSchema, 'Los hábitos pautados deben ser una lista')
    .max(MAX_HABITS_PER_CONSULTATION, `No se pueden pautar más de ${MAX_HABITS_PER_CONSULTATION} hábitos por consulta`)
    .default([]),
  measurements: z
    .array(consultationMeasurementSchema, 'Las mediciones deben ser una lista')
    .max(
      MAX_MEASUREMENTS_PER_CONSULTATION,
      `No se pueden cargar más de ${MAX_MEASUREMENTS_PER_CONSULTATION} mediciones por consulta`,
    )
    .default([]),
});

// /patients/:id/consultations/:consultationId. z.guid() por lo mismo que
// patientIdParamsSchema: el seed y los tests usan ids sin los bits de versión.
const consultationParamsSchema = z.strictObject({ id: z.guid(), consultationId: z.guid() });

module.exports = { consultationSchema, createConsultationSchema, consultationParamsSchema };
