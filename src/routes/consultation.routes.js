const { Router } = require('express');
const consultationController = require('../controllers/consultation.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { patientIdParamsSchema } = require('../schemas/patient.schema');
const {
  consultationSchema,
  createConsultationSchema,
  consultationParamsSchema,
} = require('../schemas/consultation.schema');
const { PATIENT_NOT_FOUND_MESSAGE } = require('../services/patient.service');
const { CONSULTATION_NOT_FOUND_MESSAGE } = require('../services/consultation.service');

const router = Router();

// Un id que no es UUID responde 404 y no 400, igual que un paciente o una
// consulta inexistentes o de otro nutricionista.
const byPatient = { notFoundOnInvalidParams: PATIENT_NOT_FOUND_MESSAGE };
const byConsultation = { notFoundOnInvalidParams: CONSULTATION_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /patients/{id}/consultations:
 *   get:
 *     tags: [Pacientes]
 *     summary: Lista las consultas de un paciente
 *     description: >
 *       Historial de consultas del paciente, de la más reciente a la más antigua, cada una con
 *       sus hábitos pautados. El paciente se busca filtrando por el nutricionista del token: uno
 *       de otro nutricionista devuelve 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     responses:
 *       '200':
 *         description: Consultas del paciente, eventualmente ninguna
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Consultation' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/patients/:id/consultations',
  requireAuth,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema }, byPatient),
  consultationController.listConsultations,
);

/**
 * @openapi
 * /patients/{id}/consultations:
 *   post:
 *     tags: [Pacientes]
 *     summary: Registra una consulta del paciente
 *     description: >
 *       Registra la consulta junto con los hábitos pautados al cierre y las mediciones tomadas
 *       en ella, en una sola operación. Hábitos y mediciones son opcionales. Guardarla actualiza
 *       la "última actualización" del paciente (`updatedAt`).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ConsultationCreateInput' }
 *           examples:
 *             primera:
 *               summary: Primera consulta con hábitos pautados y mediciones
 *               value:
 *                 date: '2026-10-19'
 *                 type: 'first'
 *                 motivation: 'Sentirse con más energía'
 *                 mainHabit: 'Picoteo por la tarde'
 *                 habits:
 *                   - { description: 'Caminar 30 minutos tres veces por semana' }
 *                   - { description: 'Incorporar una fruta en la merienda' }
 *                 measurements:
 *                   - { type: 'weight', value: 68.4 }
 *                   - { type: 'height', value: 165 }
 *                   - { type: 'glucose', value: 98, unit: 'mg/dL' }
 *             seguimiento:
 *               summary: Seguimiento con solo los datos obligatorios
 *               value: { date: '2026-10-19', type: 'follow_up' }
 *     responses:
 *       '201':
 *         description: Consulta registrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Consultation' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/patients/:id/consultations',
  requireAuth,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema, body: createConsultationSchema }, byPatient),
  consultationController.createConsultation,
);

/**
 * @openapi
 * /patients/{id}/consultations/{consultationId}:
 *   get:
 *     tags: [Pacientes]
 *     summary: Obtiene una consulta del paciente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/ConsultationId'
 *     responses:
 *       '200':
 *         description: La consulta, con sus hábitos pautados
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Consultation' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/ConsultationNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/patients/:id/consultations/:consultationId',
  requireAuth,
  validate({ params: consultationParamsSchema, query: emptyQuerySchema }, byConsultation),
  consultationController.getConsultation,
);

/**
 * @openapi
 * /patients/{id}/consultations/{consultationId}:
 *   put:
 *     tags: [Pacientes]
 *     summary: Edita una consulta del paciente
 *     description: >
 *       Reemplazo completo de los campos de la consulta: un campo opcional omitido se guarda como
 *       `null`. Los hábitos pautados y las mediciones no se editan acá (mandar `habits` o
 *       `measurements` da 400). Actualiza la "última actualización" del paciente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/ConsultationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ConsultationInput' }
 *     responses:
 *       '200':
 *         description: Consulta actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Consultation' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/ConsultationNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/patients/:id/consultations/:consultationId',
  requireAuth,
  validate({ params: consultationParamsSchema, query: emptyQuerySchema, body: consultationSchema }, byConsultation),
  consultationController.updateConsultation,
);

module.exports = router;
