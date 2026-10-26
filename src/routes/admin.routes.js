const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const { requireAdmin } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const {
  createNutritionistSchema,
  setNutritionistActiveSchema,
  resetNutritionistPasswordSchema,
  nutritionistIdParamsSchema,
} = require('../schemas/adminNutritionist.schema');
const { ACCOUNT_NOT_FOUND_MESSAGE } = require('../services/nutritionistAccount.service');

const router = Router();

// Un id que no es UUID responde 404, igual que una cuenta inexistente o de un
// administrador.
const byId = { notFoundOnInvalidParams: ACCOUNT_NOT_FOUND_MESSAGE };

// No hay DELETE: la baja es lógica (active = false), porque los alimentos y
// recomendaciones privados de la cuenta la referencian.

/**
 * @openapi
 * /admin/nutritionists:
 *   get:
 *     tags: [Administración]
 *     summary: Lista las cuentas de nutricionista
 *     description: >
 *       Solo administradores. Trae nombre, email, estado y fecha de alta de cada cuenta de
 *       nutricionista, de la más nueva a la más vieja. No incluye cuentas de administrador ni
 *       ningún dato de pacientes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Cuentas de nutricionista, eventualmente ninguna
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/NutritionistAccount' }
 *       '400': { $ref: '#/components/responses/UnknownQueryParam' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.get('/admin/nutritionists', requireAdmin, validate({ query: emptyQuerySchema }), adminController.listNutritionists);

/**
 * @openapi
 * /admin/nutritionists:
 *   post:
 *     tags: [Administración]
 *     summary: Da de alta una cuenta de nutricionista
 *     description: >
 *       Solo administradores. La cuenta nace activa, con rol de nutricionista y con la
 *       contraseña inicial que define el administrador. El email se guarda en minúsculas y sin
 *       espacios; uno que ya usa otra cuenta responde 409 en `details.fields.email`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NutritionistAccountInput' }
 *     responses:
 *       '201':
 *         description: Cuenta creada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NutritionistAccount' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '409': { $ref: '#/components/responses/DuplicateAccountEmail' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/admin/nutritionists',
  requireAdmin,
  validate({ query: emptyQuerySchema, body: createNutritionistSchema }),
  adminController.createNutritionist,
);

/**
 * @openapi
 * /admin/nutritionists/{id}:
 *   patch:
 *     tags: [Administración]
 *     summary: Desactiva o reactiva una cuenta de nutricionista
 *     description: >
 *       Solo administradores. Con `active: false` la cuenta deja de iniciar sesión, y un token
 *       que ya tenía deja de servir en la siguiente request. Con `true` vuelve a entrar con la
 *       contraseña que tenía. Sus pacientes y datos no se tocan. El administrador no puede
 *       desactivarse a sí mismo.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/NutritionistId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NutritionistActiveInput' }
 *     responses:
 *       '200':
 *         description: Cuenta actualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NutritionistAccount' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenAccountChange' }
 *       '404': { $ref: '#/components/responses/NutritionistAccountNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.patch(
  '/admin/nutritionists/:id',
  requireAdmin,
  validate({ params: nutritionistIdParamsSchema, query: emptyQuerySchema, body: setNutritionistActiveSchema }, byId),
  adminController.setNutritionistActive,
);

/**
 * @openapi
 * /admin/nutritionists/{id}/password:
 *   put:
 *     tags: [Administración]
 *     summary: Restablece la contraseña de una cuenta de nutricionista
 *     description: >
 *       Solo administradores. Reemplaza la contraseña por la que define el administrador; la
 *       anterior deja de servir para iniciar sesión. No cambia el estado de la cuenta.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/NutritionistId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NutritionistPasswordInput' }
 *     responses:
 *       '204':
 *         description: Contraseña restablecida
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenRole' }
 *       '404': { $ref: '#/components/responses/NutritionistAccountNotFound' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.put(
  '/admin/nutritionists/:id/password',
  requireAdmin,
  validate({ params: nutritionistIdParamsSchema, query: emptyQuerySchema, body: resetNutritionistPasswordSchema }, byId),
  adminController.resetNutritionistPassword,
);

module.exports = router;
