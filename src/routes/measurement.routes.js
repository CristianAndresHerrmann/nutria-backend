const { Router } = require('express');
const measurementController = require('../controllers/measurement.controller');
const { requireNutritionist } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { patientIdParamsSchema } = require('../schemas/patient.schema');
const { measurementSchema, measurementParamsSchema } = require('../schemas/measurement.schema');
const { PATIENT_NOT_FOUND_MESSAGE } = require('../services/patient.service');
const { MEASUREMENT_NOT_FOUND_MESSAGE } = require('../services/measurement.service');

const router = Router();

// Un id que no es UUID responde 404 y no 400, igual que un paciente o una
// medición inexistentes o de otro nutricionista.
const byPatient = { notFoundOnInvalidParams: PATIENT_NOT_FOUND_MESSAGE };
const byMeasurement = { notFoundOnInvalidParams: MEASUREMENT_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /patients/{id}/measurements:
 *   get:
 *     tags: [Pacientes]
 *     summary: Lista las mediciones y el laboratorio de un paciente
 *     description: >
 *       Histórico de mediciones antropométricas y de laboratorio del paciente (RF-11, RF-12), de la
 *       más reciente a la más antigua, cargadas en una consulta o fuera de ella. Cada peso trae su
 *       IMC calculado (`bmi`) cuando hay una talla de fecha igual o anterior. El paciente se busca
 *       filtrando por el nutricionista del token: uno de otro nutricionista devuelve 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     responses:
 *       '200':
 *         description: Mediciones del paciente, eventualmente ninguna
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Measurement' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/patients/:id/measurements',
  requireNutritionist,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema }, byPatient),
  measurementController.listMeasurements,
);

/**
 * @openapi
 * /patients/{id}/measurements:
 *   post:
 *     tags: [Pacientes]
 *     summary: Registra una medición o un valor de laboratorio del paciente
 *     description: >
 *       Para cargar una medición fuera de una consulta, o asociarla a una existente con
 *       `consultationId`. Las que se toman al registrar una consulta van en su `POST`. Guardarla
 *       actualiza la "última actualización" del paciente (`updatedAt`).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MeasurementInput' }
 *           examples:
 *             peso:
 *               summary: Peso suelto (la unidad se completa)
 *               value: { type: 'weight', value: 68.4, date: '2026-10-19' }
 *             circunferencia:
 *               summary: Circunferencia, con su detalle
 *               value: { type: 'circumference', detail: 'Cintura', value: 82, unit: 'cm', date: '2026-10-19' }
 *             laboratorio:
 *               summary: Otro parámetro de laboratorio
 *               value: { type: 'other', detail: 'Hemoglobina glicosilada', value: 6.1, unit: '%', date: '2026-10-01' }
 *     responses:
 *       '201':
 *         description: Medición registrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Measurement' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/patients/:id/measurements',
  requireNutritionist,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema, body: measurementSchema }, byPatient),
  measurementController.createMeasurement,
);

/**
 * @openapi
 * /patients/{id}/measurements/{measurementId}:
 *   put:
 *     tags: [Pacientes]
 *     summary: Edita una medición del paciente
 *     description: >
 *       Reemplazo completo: un campo opcional omitido (`detail`, `unit`, `consultationId`) se
 *       guarda como `null`. Actualiza la "última actualización" del paciente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/MeasurementId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MeasurementInput' }
 *     responses:
 *       '200':
 *         description: Medición actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Measurement' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/MeasurementNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/patients/:id/measurements/:measurementId',
  requireNutritionist,
  validate({ params: measurementParamsSchema, query: emptyQuerySchema, body: measurementSchema }, byMeasurement),
  measurementController.updateMeasurement,
);

/**
 * @openapi
 * /patients/{id}/measurements/{measurementId}:
 *   delete:
 *     tags: [Pacientes]
 *     summary: Elimina una medición del paciente
 *     description: Actualiza la "última actualización" del paciente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/MeasurementId'
 *     responses:
 *       '204':
 *         description: Medición eliminada
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/MeasurementNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.delete(
  '/patients/:id/measurements/:measurementId',
  requireNutritionist,
  validate({ params: measurementParamsSchema, query: emptyQuerySchema }, byMeasurement),
  measurementController.deleteMeasurement,
);

module.exports = router;
