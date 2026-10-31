const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { loginSchema } = require('../schemas/auth.schema');
const { createLoginRateLimiter } = require('../middlewares/rateLimit');
const config = require('../config/env');

const router = Router();

// Antes de validate: un intento con el body mal formado también cuenta.
const loginRateLimiter = createLoginRateLimiter({
  windowMs: config.loginRateLimitWindowMs,
  limit: config.loginRateLimitMax,
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Autenticación]
 *     summary: Autentica una cuenta (nutricionista o administrador) y devuelve su token
 *     description: >
 *       El token que devuelve se usa en el resto de la API como
 *       `Authorization: Bearer <token>`. Lleva el id de la cuenta en el claim
 *       `sub`, y ese id es el que filtra todo acceso a datos de pacientes. El claim
 *       `role` le dice al frontend a qué inicio llevar; el backend autoriza con el rol
 *       guardado en la base. El claim interno `tokenVersion` permite revocar los tokens anteriores
 *       al restablecimiento de contraseña, sin esperar su vencimiento.
 *       Hay un límite de intentos fallidos por IP: pasado, responde
 *       429 hasta que se cumple la ventana.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *     responses:
 *       '200':
 *         description: Credenciales válidas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LoginResponse' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '401':
 *         description: >
 *           Credenciales inválidas. Es la misma respuesta si el email no existe, si
 *           la contraseña es incorrecta y si la cuenta está desactivada, y los casos
 *           tardan lo mismo: no hay forma de averiguar qué emails están registrados
 *           ni en qué estado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: { code: 'UNAUTHORIZED', message: 'Credenciales inválidas' } }
 *       '429': { $ref: '#/components/responses/TooManyLoginAttempts' }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post(
  '/auth/login',
  loginRateLimiter,
  validate({ query: emptyQuerySchema, body: loginSchema }),
  authController.postLogin,
);

module.exports = router;
