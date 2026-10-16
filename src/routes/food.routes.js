const { Router } = require('express');
const { foodController } = require('../controllers/catalog.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { createFoodSchema, listFoodsQuerySchema } = require('../schemas/food.schema');
const { FOOD_NOT_FOUND_MESSAGE } = require('../services/food.service');

const router = Router();

// Un id que no es UUID responde 404, igual que un alimento inexistente o privado
// de otro nutricionista.
const byId = { notFoundOnInvalidParams: FOOD_NOT_FOUND_MESSAGE };

// No hay PUT ni DELETE: el nutricionista no edita ni da de baja alimentos. Lo
// hace el administrador (tarea aparte), y la baja es lógica (active = false).

/**
 * @openapi
 * /foods:
 *   get:
 *     tags: [Catálogos]
 *     summary: Lista y busca alimentos
 *     description: >
 *       Devuelve los alimentos comunes y los privados del nutricionista autenticado, solo los
 *       vigentes, ordenados por nombre. Los privados de otros nutricionistas nunca aparecen.
 *       Filtrar por un grupo incluye los alimentos de sus subgrupos; un grupo inexistente
 *       devuelve una lista vacía.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: search
 *         in: query
 *         description: Parte del nombre, sin distinguir mayúsculas.
 *         schema: { type: string, maxLength: 100 }
 *       - name: groupId
 *         in: query
 *         description: Grupo de alimentos; incluye sus subgrupos.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Alimentos que cumplen el filtro, eventualmente ninguno
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Food' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/foods', requireAuth, validate({ query: listFoodsQuerySchema }), foodController.list);

/**
 * @openapi
 * /foods/{id}:
 *   get:
 *     tags: [Catálogos]
 *     summary: Obtiene un alimento
 *     description: >
 *       Un alimento común o uno privado del nutricionista autenticado. Uno privado de otro
 *       nutricionista responde 404, igual que uno inexistente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     responses:
 *       '200':
 *         description: Alimento encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Food' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/FoodNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/foods/:id',
  requireAuth,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema }, byId),
  foodController.get,
);

/**
 * @openapi
 * /foods:
 *   post:
 *     tags: [Catálogos]
 *     summary: Da de alta un alimento privado
 *     description: >
 *       El alimento queda privado del nutricionista del token: solo él lo ve y lo usa. Nace
 *       vigente y después no se puede modificar desde la cuenta del nutricionista. El nombre
 *       no puede repetir uno común ni uno propio, sin distinguir mayúsculas ("leche" choca
 *       con "Leche"): responde 409.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/FoodInput' }
 *     responses:
 *       '201':
 *         description: Alimento creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Food' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post('/foods', requireAuth, validate({ query: emptyQuerySchema, body: createFoodSchema }), foodController.create);

module.exports = router;
