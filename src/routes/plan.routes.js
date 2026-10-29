const { Router } = require('express');
const planController = require('../controllers/plan.controller');
const { requireNutritionist } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { patientIdParamsSchema } = require('../schemas/patient.schema');
const { generatePlanSchema, updatePlanSchema, planParamsSchema } = require('../schemas/plan.schema');
const { PATIENT_NOT_FOUND_MESSAGE } = require('../services/patient.service');
const { PLAN_NOT_FOUND_MESSAGE } = require('../services/planValidation.service');

const router = Router();

// Un id que no es UUID responde 404 y no 400, igual que un paciente o un plan
// inexistentes o de otro nutricionista.
const byPatient = { notFoundOnInvalidParams: PATIENT_NOT_FOUND_MESSAGE };
const byPlan = { notFoundOnInvalidParams: PLAN_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /patients/{id}/plans/generate:
 *   post:
 *     tags: [Planes]
 *     summary: Genera un borrador de plan con asistencia de IA
 *     description: >
 *       Arma un contexto mínimo y anonimizado del paciente (condiciones, contexto de cocina,
 *       comidas fuera del hogar, trabajo y hábitos; sin nombre, contacto, fecha de nacimiento ni ids
 *       internos, RNF-07) y le pide una propuesta al servicio de IA. El catálogo que se ofrece son los
 *       alimentos vigentes, comunes y privados del nutricionista, sin los comprendidos en alergias,
 *       intolerancias y rechazos del paciente ni en reglas que los prohíben para sus patologías
 *       (RF-37), más las recetas candidatas sin esos ingredientes (RF-28); si el paciente no cocina,
 *       solo las que no requieren cocción (RF-38). La propuesta se valida con el motor de reglas
 *       (RF-43) y el borrador se guarda con sus hallazgos y la traza de la generación (RF-41) en una
 *       sola operación. Un ítem que la IA no encontró en el catálogo queda como `unrecognized`, con un
 *       hallazgo bloqueante. En los textos libres del contexto, los emails, los teléfonos y el
 *       nombre y apellido del paciente y de su responsable se reemplazan por `[dato omitido]`. Si la
 *       IA falla, responde 503 y no crea ningún plan (RNF-02). La propuesta es editable: no es un
 *       plan validado clínicamente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/GeneratePlanInput' }
 *     responses:
 *       '201':
 *         description: Borrador creado, con los hallazgos de la validación inicial
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Plan' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 *       '503': { $ref: '#/components/responses/PlanGenerationUnavailable' }
 */
router.post(
  '/patients/:id/plans/generate',
  requireNutritionist,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema, body: generatePlanSchema }, byPatient),
  planController.generatePlan,
);

/**
 * @openapi
 * /patients/{id}/plans:
 *   get:
 *     tags: [Planes]
 *     summary: Lista los planes de un paciente
 *     description: >
 *       Resumen de los planes del paciente, del más recientemente modificado al más antiguo. El
 *       paciente se busca filtrando por el nutricionista del token: uno de otro nutricionista
 *       devuelve 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *     responses:
 *       '200':
 *         description: Planes del paciente, eventualmente ninguno
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/PlanSummary' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PatientNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/patients/:id/plans',
  requireNutritionist,
  validate({ params: patientIdParamsSchema, query: emptyQuerySchema }, byPatient),
  planController.listPlans,
);

/**
 * @openapi
 * /patients/{id}/plans/{planId}:
 *   get:
 *     tags: [Planes]
 *     summary: Obtiene un plan del paciente, revalidado
 *     description: >
 *       Antes de responder, el borrador se revalida con el motor de reglas, así los hallazgos
 *       reflejan las condiciones actuales del paciente (RF-46). Si no cambiaron, no se reescriben y
 *       conservan sus ids. Un plan de otro nutricionista o de otro paciente responde 404, igual que
 *       uno inexistente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/PlanId'
 *     responses:
 *       '200':
 *         description: Plan con sus hallazgos recién calculados
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Plan' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PlanNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/patients/:id/plans/:planId',
  requireNutritionist,
  validate({ params: planParamsSchema, query: emptyQuerySchema }, byPlan),
  planController.getPlan,
);

/**
 * @openapi
 * /patients/{id}/plans/{planId}:
 *   put:
 *     tags: [Planes]
 *     summary: Edita el borrador del plan
 *     description: >
 *       Reemplazo completo: textos, comidas, opciones e ítems se reemplazan por los que llegan, y los
 *       hallazgos se recalculan en la misma operación (RF-46). Cada ítem referencia un alimento visible
 *       para el nutricionista, un grupo, una receta propia o un texto no reconocido. Un alimento o una
 *       receta dados de baja que ya estaban en el plan se pueden conservar, pero no agregar. Un error
 *       en un ítem se informa en `details.fields.meals`, con la opción y el ítem en el mensaje. Los
 *       ids de comidas, opciones, ítems y hallazgos se regeneran en cada guardado: el cliente usa
 *       los de la respuesta.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PatientId'
 *       - $ref: '#/components/parameters/PlanId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PlanInput' }
 *     responses:
 *       '200':
 *         description: Borrador guardado, con sus hallazgos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Plan' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PlanNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/patients/:id/plans/:planId',
  requireNutritionist,
  validate({ params: planParamsSchema, query: emptyQuerySchema, body: updatePlanSchema }, byPlan),
  planController.updatePlan,
);

module.exports = router;
