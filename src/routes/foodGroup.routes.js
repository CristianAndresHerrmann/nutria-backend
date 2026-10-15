const { Router } = require('express');
const { foodGroupController } = require('../controllers/catalog.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { createFoodGroupSchema, updateFoodGroupSchema } = require('../schemas/foodGroup.schema');
const { FOOD_GROUP_NOT_FOUND_MESSAGE } = require('../services/foodGroup.service');

const router = Router();

// Un id que no es UUID responde 404, igual que un grupo inexistente.
const byId = { notFoundOnInvalidParams: FOOD_GROUP_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /food-groups:
 *   get:
 *     tags: [Catálogos]
 *     summary: Lista los grupos de alimentos
 *     description: >
 *       Catálogo común a todos los nutricionistas. Devuelve la lista plana, ordenada por
 *       nombre; la jerarquía se arma con `parentId` (`null` en los grupos raíz).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Todos los grupos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/FoodGroup' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/food-groups', requireAuth, validate({ query: emptyQuerySchema }), foodGroupController.list);

/**
 * @openapi
 * /food-groups/{id}:
 *   get:
 *     tags: [Catálogos]
 *     summary: Obtiene un grupo de alimentos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     responses:
 *       '200':
 *         description: Grupo encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/FoodGroup' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/FoodGroupNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/food-groups/:id',
  requireAuth,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema }, byId),
  foodGroupController.get,
);

/**
 * @openapi
 * /food-groups:
 *   post:
 *     tags: [Catálogos]
 *     summary: Da de alta un grupo de alimentos
 *     description: >
 *       El grupo queda a nombre del nutricionista del token, que es el único que después
 *       puede editarlo. Puede crearse dentro de cualquier grupo existente, propio o no. El
 *       nombre es único sin distinguir mayúsculas.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/FoodGroupInput' }
 *     responses:
 *       '201':
 *         description: Grupo creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/FoodGroup' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/food-groups',
  requireAuth,
  validate({ query: emptyQuerySchema, body: createFoodGroupSchema }),
  foodGroupController.create,
);

/**
 * @openapi
 * /food-groups/{id}:
 *   put:
 *     tags: [Catálogos]
 *     summary: Edita un grupo de alimentos propio
 *     description: >
 *       Reemplazo completo: un `parentId` omitido deja al grupo en la raíz. Solo lo puede
 *       editar quien lo cargó; los grupos de la base inicial no se editan por la API. Un
 *       `parentId` que lo pondría dentro de sí mismo o de uno de sus subgrupos responde 400
 *       en `details.fields.parentId`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/FoodGroupInput' }
 *     responses:
 *       '200':
 *         description: Grupo actualizado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/FoodGroup' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/FoodGroupNotFound' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/food-groups/:id',
  requireAuth,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: updateFoodGroupSchema }, byId),
  foodGroupController.update,
);

module.exports = router;
