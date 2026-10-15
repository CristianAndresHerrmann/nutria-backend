const { Router } = require('express');
const { foodController } = require('../controllers/catalog.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { createFoodSchema, updateFoodSchema, listFoodsQuerySchema } = require('../schemas/food.schema');
const { FOOD_NOT_FOUND_MESSAGE } = require('../services/food.service');

const router = Router();

const byId = { notFoundOnInvalidParams: FOOD_NOT_FOUND_MESSAGE };

// No hay DELETE: un alimento se da de baja con `active: false` en el PUT (baja
// lógica). Lo referencian condiciones de pacientes e ingredientes de recetas.

/**
 * @openapi
 * /foods:
 *   get:
 *     tags: [Catálogos]
 *     summary: Lista y busca alimentos
 *     description: >
 *       Catálogo común a todos los nutricionistas, ordenado por nombre. Por defecto devuelve
 *       solo los vigentes. Filtrar por un grupo incluye los alimentos de sus subgrupos; un
 *       grupo inexistente devuelve una lista vacía.
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
 *       - name: includeInactive
 *         in: query
 *         description: Con `true` incluye los alimentos dados de baja.
 *         schema: { type: string, enum: ['true', 'false'], default: 'false' }
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
 *     description: Devuelve el alimento aunque esté dado de baja.
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
 *     summary: Da de alta un alimento
 *     description: >
 *       Nace vigente y a nombre del nutricionista del token, que es el único que después
 *       puede editarlo. Puede ir en cualquier grupo existente. El nombre es único sin
 *       distinguir mayúsculas: "leche" choca con "Leche" y responde 409.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/FoodCreateInput' }
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

/**
 * @openapi
 * /foods/{id}:
 *   put:
 *     tags: [Catálogos]
 *     summary: Edita o da de baja un alimento propio
 *     description: >
 *       Reemplazo completo, incluidas las categorías. `active: false` es la baja lógica:
 *       el alimento no se borra y sigue referenciado por condiciones e ingredientes. Solo lo
 *       puede editar quien lo cargó; los de la base inicial no se editan por la API.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/FoodUpdateInput' }
 *     responses:
 *       '200':
 *         description: Alimento actualizado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Food' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/FoodNotFound' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/foods/:id',
  requireAuth,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: updateFoodSchema }, byId),
  foodController.update,
);

module.exports = router;
