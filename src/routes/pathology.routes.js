const { Router } = require('express');
const { pathologyController } = require('../controllers/catalog.controller');
const requireAuth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema, catalogIdParamsSchema } = require('../schemas/common.schema');
const { PATHOLOGY_NOT_FOUND_MESSAGE } = require('../services/pathology.service');

const router = Router();

const byId = { notFoundOnInvalidParams: PATHOLOGY_NOT_FOUND_MESSAGE };

// Solo lectura: el alta y la edición de patologías son del administrador (tarea aparte).

/**
 * @openapi
 * /pathologies:
 *   get:
 *     tags: [Catálogos]
 *     summary: Lista las patologías
 *     description: Catálogo común a todos los nutricionistas (RF-04), de solo lectura, ordenado por nombre.
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

module.exports = router;
