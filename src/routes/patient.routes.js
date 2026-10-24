const { Router } = require('express');
const patientController = require('../controllers/patient.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { createPatientSchema, updatePatientSchema, patientIdParamsSchema } = require('../schemas/patient.schema');
const { PATIENT_NOT_FOUND_MESSAGE } = require('../services/patient.service');

const router = Router();

// Un id que no es UUID responde 404 y no 400: el mismo error que un paciente
// inexistente o de otro nutricionista, para que la API no distinga los casos.
const byId = { notFoundOnInvalidParams: PATIENT_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /patients:
 *   get:
 *     tags: [Pacientes]
 *     summary: Lista los pacientes del nutricionista autenticado
 *     description: >
 *       Devuelve únicamente los pacientes del nutricionista del token, ordenados por
 *       fecha de última modificación descendente. No acepta parámetros de filtro ni
 *       de paginación.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Listado de pacientes, eventualmente vacío
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Patient' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/patients', requireAuth, validate({ query: emptyQuerySchema }), patientController.getPatients);

/**
 * @openapi
 * /patients/{id}:
 *   get:
 *     tags: [Pacientes]
 *     summary: Obtiene un paciente del nutricionista autenticado
 *     description: >
 *       El paciente se busca filtrando también por el nutricionista del token. Un id
 *       de otro nutricionista devuelve 404 y no 403: la API no revela que ese paciente
 *       exista.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Id del paciente. Un valor que no sea un UUID devuelve 404, no 400.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Paciente encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PatientDetail' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/patients/:id',
  requireAuth,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema }, byId),
  patientController.getPatientById,
);

/**
 * @openapi
 * /patients:
 *   post:
 *     tags: [Pacientes]
 *     summary: Da de alta un paciente
 *     description: >
 *       El paciente queda asociado al nutricionista del token; el body no lleva ni
 *       admite `nutritionistId`. Alcanza con nombre y apellido: el alta parcial es
 *       válida y el resto de los datos se completa después con `PUT`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PatientInput' }
 *           examples:
 *             altaParcial:
 *               summary: Alta mínima, solo con nombre y apellido
 *               value: { firstName: 'Jorge', lastName: 'Ibarra' }
 *             altaCompleta:
 *               summary: Alta de un menor, con los datos del adulto responsable
 *               value:
 *                 firstName: 'Tomás'
 *                 lastName: 'Gómez'
 *                 birthDate: '2012-05-10'
 *                 livesWith: 'Padres'
 *                 goal: 'Mejorar hábitos alimentarios'
 *                 referenceWeight: 45
 *                 guardianName: 'María Gómez'
 *                 guardianRelationship: 'Madre'
 *                 guardianContact: '+54 342 555-0202'
 *                 attendsAccompanied: true
 *                 registrationComplete: true
 *     responses:
 *       '201':
 *         description: Paciente creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Patient' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/patients',
  requireAuth,
  validate({ query: emptyQuerySchema, body: createPatientSchema }),
  patientController.createPatient,
);

/**
 * @openapi
 * /patients/{id}:
 *   put:
 *     tags: [Pacientes]
 *     summary: Edita un paciente del nutricionista autenticado
 *     description: >
 *       Reemplazo completo: el body manda el objeto entero, no un diff, y un campo
 *       omitido se guarda como `null`. La primera vez que `registrationComplete` pasa
 *       de `false` a `true` el servidor sella `dataCompletedAt` y después lo conserva,
 *       incluso si el registro se vuelve a marcar como incompleto.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Id del paciente. Un valor que no sea un UUID devuelve 404, no 400.
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PatientInput' }
 *     responses:
 *       '200':
 *         description: Paciente actualizado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Patient' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/patients/:id',
  requireAuth,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema, body: updatePatientSchema }, byId),
  patientController.updatePatient,
);

module.exports = router;
