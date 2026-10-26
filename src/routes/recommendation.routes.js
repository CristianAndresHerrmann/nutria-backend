const { Router } = require('express');
const recommendationController = require('../controllers/recommendation.controller');
const { requireNutritionist } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const {
  createRecommendationSchema,
  updateRecommendationSchema,
  listRecommendationsQuerySchema,
} = require('../schemas/recommendation.schema');
const { RECOMMENDATION_NOT_FOUND_MESSAGE } = require('../services/recommendation.service');

const router = Router();

// Un id que no es UUID responde 404, igual que una recomendación inexistente o
// privada de otro nutricionista.
const byId = { notFoundOnInvalidParams: RECOMMENDATION_NOT_FOUND_MESSAGE };

// No hay DELETE: la baja es lógica, con active = false en el PUT.

/**
 * @openapi
 * /clinical-recommendations:
 *   get:
 *     tags: [Recomendaciones]
 *     summary: Lista las recomendaciones clínicas visibles para el nutricionista autenticado
 *     description: >
 *       Devuelve las comunes y las privadas del nutricionista del token, ordenadas por patología y
 *       título. Por defecto, solo las vigentes.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: pathologyId
 *         in: query
 *         description: Solo las de esa patología. Una patología inexistente devuelve una lista vacía.
 *         schema: { type: string, format: uuid }
 *       - name: includeInactive
 *         in: query
 *         description: Con `true`, incluye las dadas de baja.
 *         schema: { type: string, enum: ['true', 'false'], default: 'false' }
 *     responses:
 *       '200':
 *         description: Recomendaciones que cumplen el filtro, eventualmente ninguna
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ClinicalRecommendation' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/clinical-recommendations',
  requireNutritionist,
  validate({ query: listRecommendationsQuerySchema }),
  recommendationController.listRecommendations,
);

/**
 * @openapi
 * /clinical-recommendations/{id}:
 *   get:
 *     tags: [Recomendaciones]
 *     summary: Obtiene una recomendación clínica común o propia
 *     description: >
 *       Incluye las dadas de baja. Una privada de otro nutricionista responde 404, igual que una
 *       inexistente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CatalogId'
 *     responses:
 *       '200':
 *         description: Recomendación encontrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClinicalRecommendation' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/RecommendationNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/clinical-recommendations/:id',
  requireNutritionist,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema }, byId),
  recommendationController.getRecommendation,
);

/**
 * @openapi
 * /clinical-recommendations:
 *   post:
 *     tags: [Recomendaciones]
 *     summary: Da de alta una recomendación clínica privada
 *     description: >
 *       La recomendación queda privada del nutricionista del token y nace vigente. Una patología
 *       inexistente responde 400 en `details.fields.pathologyId`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClinicalRecommendationInput' }
 *     responses:
 *       '201':
 *         description: Recomendación creada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClinicalRecommendation' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/clinical-recommendations',
  requireNutritionist,
  validate({ query: emptyQuerySchema, body: createRecommendationSchema }),
  recommendationController.createRecommendation,
);

/**
 * @openapi
 * /clinical-recommendations/{id}:
 *   put:
 *     tags: [Recomendaciones]
 *     summary: Edita una recomendación clínica propia
 *     description: >
 *       Reemplazo completo. `active: false` la da de baja y `true` la reactiva; omitido, conserva el
 *       valor que tenía. Una común responde 403; una privada de otro nutricionista, 404.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CatalogId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClinicalRecommendationUpdateInput' }
 *     responses:
 *       '200':
 *         description: Recomendación actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClinicalRecommendation' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/CommonRecommendationReadOnly' }
 *       '404': { $ref: '#/components/responses/RecommendationNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/clinical-recommendations/:id',
  requireNutritionist,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: updateRecommendationSchema }, byId),
  recommendationController.updateRecommendation,
);

module.exports = router;
