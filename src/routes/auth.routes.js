const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { loginSchema } = require('../schemas/auth.schema');

const router = Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Autenticación]
 *     summary: Autentica a un nutricionista y devuelve su token
 *     description: >
 *       El token que devuelve se usa en el resto de la API como
 *       `Authorization: Bearer <token>`. Lleva el id del nutricionista en el claim
 *       `sub`, y ese id es el que filtra todo acceso a datos de pacientes.
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
 *           Credenciales inválidas. Es la misma respuesta si el email no existe y
 *           si la contraseña es incorrecta, y ambos casos tardan lo mismo: no hay
 *           forma de averiguar qué emails están registrados.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: { code: 'UNAUTHORIZED', message: 'Credenciales inválidas' } }
 *       '500': { $ref: '#/components/responses/InternalError' }
 */
router.post('/auth/login', validate({ query: emptyQuerySchema, body: loginSchema }), authController.postLogin);

module.exports = router;
