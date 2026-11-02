const { Router } = require('express');
const {
  adminFoodGroupController,
  adminPathologyController,
  adminFoodController,
} = require('../controllers/adminCatalog.controller');
const { requireAdmin } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { foodGroupSchema } = require('../schemas/foodGroup.schema');
const { pathologySchema } = require('../schemas/pathology.schema');
const {
  createFoodSchema,
  updateFoodSchema,
  promoteFoodSchema,
  adminListFoodsQuerySchema,
  catalogActivityQuerySchema,
} = require('../schemas/food.schema');
const { FOOD_GROUP_NOT_FOUND_MESSAGE } = require('../services/foodGroup.service');
const { PATHOLOGY_NOT_FOUND_MESSAGE } = require('../services/pathology.service');
const { FOOD_NOT_FOUND_MESSAGE } = require('../services/food.service');

const router = Router();

// Curación del catálogo por el administrador (T25). Todo bajo /admin con
// requireAdmin: el administrador no accede a pacientes ni planes (RNF-05), y
// los nutricionistas reciben 403. Un id que no es UUID responde 404, igual que
// uno inexistente. No hay DELETE: la baja de un alimento es lógica (PUT con
// active = false), y grupos y patologías no se dan de baja.
const groupById = { notFoundOnInvalidParams: FOOD_GROUP_NOT_FOUND_MESSAGE };
const pathologyById = { notFoundOnInvalidParams: PATHOLOGY_NOT_FOUND_MESSAGE };
const foodById = { notFoundOnInvalidParams: FOOD_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /admin/food-groups:
 *   get:
 *     tags: [Administración]
 *     summary: Lista los grupos de alimentos
 *     description: >
 *       Solo administradores. Todos los grupos, ordenados por nombre, con su padre: la
 *       jerarquía se arma en el cliente.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Grupos de alimentos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/FoodGroup' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 *   post:
 *     tags: [Administración]
 *     summary: Da de alta un grupo de alimentos
 *     description: >
 *       Solo administradores. Sin `parentId` es un grupo raíz. El padre tiene que existir
 *       (400 en `details.fields.parentId`). El nombre no puede repetir el de otro grupo, sin
 *       distinguir mayúsculas (409).
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
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '409': { $ref: '#/components/responses/FoodGroupConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/admin/food-groups', requireAdmin, validate({ query: emptyQuerySchema }), adminFoodGroupController.list);
router.post(
  '/admin/food-groups',
  requireAdmin,
  validate({ query: emptyQuerySchema, body: foodGroupSchema }),
  adminFoodGroupController.create,
);

/**
 * @openapi
 * /admin/food-groups/{id}:
 *   put:
 *     tags: [Administración]
 *     summary: Edita un grupo de alimentos
 *     description: >
 *       Solo administradores. Reemplazo completo: `parentId` omitido o `null` lo deja como
 *       grupo raíz. Un grupo no puede quedar dentro de sí mismo ni de uno de sus subgrupos, a
 *       cualquier profundidad (400 en `details.fields.parentId`). Moverlo cambia qué alimentos
 *       alcanzan las condiciones y reglas por grupo desde la próxima revalidación de cada plan.
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
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/FoodGroupNotFound' }
 *       '409': { $ref: '#/components/responses/FoodGroupConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/admin/food-groups/:id',
  requireAdmin,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: foodGroupSchema }, groupById),
  adminFoodGroupController.update,
);

/**
 * @openapi
 * /admin/pathologies:
 *   get:
 *     tags: [Administración]
 *     summary: Lista las patologías
 *     description: Solo administradores. Todas las patologías, ordenadas por nombre.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Patologías
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Pathology' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 *   post:
 *     tags: [Administración]
 *     summary: Da de alta una patología
 *     description: >
 *       Solo administradores (RF-04). El nombre no puede repetir el de otra patología, sin
 *       distinguir mayúsculas (409).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PathologyInput' }
 *     responses:
 *       '201':
 *         description: Patología creada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Pathology' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '409': { $ref: '#/components/responses/PathologyConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/admin/pathologies', requireAdmin, validate({ query: emptyQuerySchema }), adminPathologyController.list);
router.post(
  '/admin/pathologies',
  requireAdmin,
  validate({ query: emptyQuerySchema, body: pathologySchema }),
  adminPathologyController.create,
);

/**
 * @openapi
 * /admin/pathologies/{id}:
 *   put:
 *     tags: [Administración]
 *     summary: Edita una patología
 *     description: Solo administradores. Reemplazo completo del nombre y la descripción.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PathologyInput' }
 *     responses:
 *       '200':
 *         description: Patología actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Pathology' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/PathologyNotFound' }
 *       '409': { $ref: '#/components/responses/PathologyConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/admin/pathologies/:id',
  requireAdmin,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: pathologySchema }, pathologyById),
  adminPathologyController.update,
);

/**
 * @openapi
 * /admin/foods:
 *   get:
 *     tags: [Administración]
 *     summary: Lista los alimentos del catálogo completo
 *     description: >
 *       Solo administradores. Los comunes y los privados de todos los nutricionistas,
 *       incluidos los dados de baja, ordenados por nombre. Filtrar por un grupo incluye sus
 *       subgrupos; un grupo inexistente devuelve una lista vacía.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: owner
 *         in: query
 *         description: El valor `common` trae los comunes; el id de un nutricionista, sus privados.
 *         schema: { type: string, example: common }
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
 *               items: { $ref: '#/components/schemas/AdminFood' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 *   post:
 *     tags: [Administración]
 *     summary: Da de alta un alimento común
 *     description: >
 *       Solo administradores. El alimento queda común: lo ven todos los nutricionistas. El
 *       nombre no puede repetir el de otro común ni el de un privado vigente de cualquier
 *       nutricionista, sin distinguir mayúsculas (409).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminFoodInput' }
 *     responses:
 *       '201':
 *         description: Alimento creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminFood' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '409': { $ref: '#/components/responses/AdminFoodConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/admin/foods', requireAdmin, validate({ query: adminListFoodsQuerySchema }), adminFoodController.list);
router.post(
  '/admin/foods',
  requireAdmin,
  validate({ query: emptyQuerySchema, body: createFoodSchema }),
  adminFoodController.create,
);

/**
 * @openapi
 * /admin/foods/{id}:
 *   get:
 *     tags: [Administración]
 *     summary: Obtiene un alimento
 *     description: Solo administradores. Cualquier alimento, común o privado, vigente o no.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     responses:
 *       '200':
 *         description: Alimento encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminFood' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/FoodNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 *   put:
 *     tags: [Administración]
 *     summary: Corrige, da de baja o reactiva un alimento
 *     description: >
 *       Solo administradores. Reemplazo completo del nombre, el grupo y las categorías de un
 *       alimento común o privado; `active` da de baja (`false`) o reactiva (`true`), y omitido
 *       conserva el estado. No cambia el dueño. Los planes que ya lo usan conservan su copia del
 *       nombre y las categorías hasta que se vuelven a guardar (DA-16). El nombre se controla
 *       solo si cambia o si el alimento se reactiva: un privado no repite un común ni otro
 *       privado del mismo nutricionista, y un común no repite otro común ni un privado vigente
 *       de nadie (409).
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
 *             schema: { $ref: '#/components/schemas/AdminFood' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/FoodNotFound' }
 *       '409': { $ref: '#/components/responses/AdminFoodConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/admin/foods/:id',
  requireAdmin,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema }, foodById),
  adminFoodController.get,
);
router.put(
  '/admin/foods/:id',
  requireAdmin,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: updateFoodSchema }, foodById),
  adminFoodController.update,
);

/**
 * @openapi
 * /admin/foods/{id}/promote:
 *   post:
 *     tags: [Administración]
 *     summary: Pasa un alimento privado al catálogo común
 *     description: >
 *       Solo administradores. El alimento conserva su id, así que lo que ya lo referenciaba no
 *       cambia, y desde ahí lo ven todos los nutricionistas. La actividad del catálogo sigue
 *       mostrando quién lo cargó. Con `name` se renombra en la misma operación. El nombre no
 *       puede repetir el de un común, otro privado del mismo dueño ni un privado vigente de
 *       otro nutricionista (409). Uno que ya es común también responde 409.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/FoodPromoteInput' }
 *     responses:
 *       '200':
 *         description: Alimento pasado al común
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminFood' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/FoodNotFound' }
 *       '409': { $ref: '#/components/responses/AdminFoodConflict' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/admin/foods/:id/promote',
  requireAdmin,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: promoteFoodSchema }, foodById),
  adminFoodController.promote,
);

/**
 * @openapi
 * /admin/catalog-activity:
 *   get:
 *     tags: [Administración]
 *     summary: Actividad del catálogo
 *     description: >
 *       Solo administradores. Qué alimento cargó cada nutricionista y cuándo, del más nuevo al
 *       más viejo, sigan privados o hayan pasado al común. Los comunes del seed o del
 *       administrador no aparecen. Nada de pacientes ni de planes (RNF-05).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: nutritionistId
 *         in: query
 *         description: Solo lo que cargó ese nutricionista.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Alimentos cargados por nutricionistas, eventualmente ninguno
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CatalogActivityEntry' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/admin/catalog-activity',
  requireAdmin,
  validate({ query: catalogActivityQuerySchema }),
  adminFoodController.activity,
);

module.exports = router;
