const { Router } = require('express');
const { foodGroupController } = require('../controllers/catalog.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { FOOD_GROUP_NOT_FOUND_MESSAGE } = require('../services/foodGroup.service');

const router = Router();

// Un id que no es UUID responde 404, igual que un grupo inexistente.
const byId = { notFoundOnInvalidParams: FOOD_GROUP_NOT_FOUND_MESSAGE };

// Solo lectura: el alta y la edición de grupos son del administrador (tarea aparte).

/**
 * @openapi
 * /food-groups:
 *   get:
 *     tags: [Catálogos]
 *     summary: Lista los grupos de alimentos
 *     description: >
 *       Catálogo común a todos los nutricionistas, de solo lectura. Devuelve la lista plana,
 *       ordenada por nombre; la jerarquía se arma con `parentId` (`null` en los grupos raíz).
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
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
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
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
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

module.exports = router;
