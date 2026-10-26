const { Router } = require('express');
const patientConditionController = require('../controllers/patientCondition.controller');
const { requireNutritionist } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { patientIdParamsSchema } = require('../schemas/patient.schema');
const { patientConditionSchema, patientConditionParamsSchema } = require('../schemas/patientCondition.schema');
const { PATIENT_NOT_FOUND_MESSAGE } = require('../services/patient.service');
const { CONDITION_NOT_FOUND_MESSAGE } = require('../services/patientCondition.service');

const router = Router();

// Un id que no es UUID responde 404 y no 400, igual que un paciente o una
// condición inexistentes o de otro nutricionista.
const byPatient = { notFoundOnInvalidParams: PATIENT_NOT_FOUND_MESSAGE };
const byCondition = { notFoundOnInvalidParams: CONDITION_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /patients/{id}/conditions:
 *   get:
 *     tags: [Pacientes]
 *     summary: Lista las condiciones alimentarias de un paciente
 *     description: >
 *       Patologías, alergias, intolerancias, rechazos y preferencias del paciente (RF-04,
 *       RF-07), ordenadas por fecha de registro. El paciente se busca filtrando por el
 *       nutricionista del token: uno de otro nutricionista devuelve 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     responses:
 *       '200':
 *         description: Condiciones del paciente, eventualmente ninguna
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/PatientCondition' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/patients/:id/conditions',
  requireNutritionist,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema }, byPatient),
  patientConditionController.listConditions,
);

/**
 * @openapi
 * /patients/{id}/conditions:
 *   post:
 *     tags: [Pacientes]
 *     summary: Registra una condición alimentaria del paciente
 *     description: >
 *       Una patología referencia una patología del catálogo; las demás condiciones referencian
 *       exactamente un alimento o un grupo de alimentos. Una intolerancia no necesita una
 *       patología asociada. El mismo tipo con el mismo destino no se puede registrar dos veces.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PatientConditionInput' }
 *           examples:
 *             alergia:
 *               summary: Alergia a un alimento
 *               value: { type: 'allergy', foodId: '6f1c2a5e-0000-4000-8000-000000000001' }
 *             rechazo:
 *               summary: Rechazo a un grupo de alimentos
 *               value: { type: 'rejection', foodGroupId: '6f1c2a5e-0000-4000-8000-000000000002', observations: 'No le gusta la textura' }
 *             patologia:
 *               summary: Patología diagnosticada
 *               value: { type: 'pathology', pathologyId: '6f1c2a5e-0000-4000-8000-000000000003' }
 *     responses:
 *       '201':
 *         description: Condición registrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PatientCondition' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '409': { $ref: '#/components/responses/PatientConditionConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/patients/:id/conditions',
  requireNutritionist,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema, body: patientConditionSchema }, byPatient),
  patientConditionController.createCondition,
);

/**
 * @openapi
 * /patients/{id}/conditions/{conditionId}:
 *   put:
 *     tags: [Pacientes]
 *     summary: Edita una condición alimentaria del paciente
 *     description: >
 *       Reemplazo completo, con las mismas reglas que el alta: el tipo y el destino pueden
 *       cambiar, y `observations` omitido se guarda como `null`. Si no se manda
 *       `registeredAt`, se conserva la fecha de registro original.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/ConditionId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PatientConditionInput' }
 *     responses:
 *       '200':
 *         description: Condición actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PatientCondition' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientConditionNotFound' }
 *       '409': { $ref: '#/components/responses/PatientConditionConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/patients/:id/conditions/:conditionId',
  requireNutritionist,
  validate(
    { params: patientConditionParamsSchema, query: emptyQuerySchema, body: patientConditionSchema },
    byCondition,
  ),
  patientConditionController.updateCondition,
);

/**
 * @openapi
 * /patients/{id}/conditions/{conditionId}:
 *   delete:
 *     tags: [Pacientes]
 *     summary: Elimina una condición alimentaria del paciente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/ConditionId'
 *     responses:
 *       '204':
 *         description: Condición eliminada
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientConditionNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.delete(
  '/patients/:id/conditions/:conditionId',
  requireNutritionist,
  validate({ params: patientConditionParamsSchema, query: emptyQuerySchema }, byCondition),
  patientConditionController.deleteCondition,
);

module.exports = router;
