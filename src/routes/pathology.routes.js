const { Router } = require('express');
const { pathologyController } = require('../controllers/catalog.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { createPathologySchema, updatePathologySchema } = require('../schemas/pathology.schema');
const { PATHOLOGY_NOT_FOUND_MESSAGE } = require('../services/pathology.service');

const router = Router();

const byId = { notFoundOnInvalidParams: PATHOLOGY_NOT_FOUND_MESSAGE };

/**
 * @openapi
 * /pathologies:
 *   get:
 *     tags: [Catálogos]
 *     summary: Lista las patologías
 *     description: Catálogo común a todos los nutricionistas (RF-04), ordenado por nombre.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Todas las patologías
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Pathology' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/pathologies', requireAuth, validate({ query: emptyQuerySchema }), pathologyController.list);

/**
 * @openapi
 * /pathologies/{id}:
 *   get:
 *     tags: [Catálogos]
 *     summary: Obtiene una patología
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/CatalogId' }
 *     responses:
 *       '200':
 *         description: Patología encontrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Pathology' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '404': { $ref: '#/components/responses/PathologyNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get(
  '/pathologies/:id',
  requireAuth,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema }, byId),
  pathologyController.get,
);

/**
 * @openapi
 * /pathologies:
 *   post:
 *     tags: [Catálogos]
 *     summary: Da de alta una patología
 *     description: >
 *       Queda a nombre del nutricionista del token, que es el único que después puede
 *       editarla. El nombre es único sin distinguir mayúsculas.
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
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/pathologies',
  requireAuth,
  validate({ query: emptyQuerySchema, body: createPathologySchema }),
  pathologyController.create,
);

/**
 * @openapi
 * /pathologies/{id}:
 *   put:
 *     tags: [Catálogos]
 *     summary: Edita una patología propia
 *     description: >
 *       Reemplazo completo. Solo la puede editar quien la cargó; las de la base inicial no
 *       se editan por la API.
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
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/PathologyNotFound' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/pathologies/:id',
  requireAuth,
  validate({ params: catalogIdParamsSchema, query: emptyQuerySchema, body: updatePathologySchema }, byId),
  pathologyController.update,
);

module.exports = router;
