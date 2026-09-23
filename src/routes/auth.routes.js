const { Router } = require('express');
const authController = require('../controllers/auth.controller');

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
 *       '400':
 *         description: >
 *           Falta el email o la contraseña, o el email no tiene formato válido.
 *           A diferencia de los errores de validación de pacientes, este no trae
 *           `fields`.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: 'Email y contraseña son requeridos' }
 *       '401':
 *         description: >
 *           Credenciales inválidas. Es la misma respuesta si el email no existe y
 *           si la contraseña es incorrecta, y ambos casos tardan lo mismo: no hay
 *           forma de averiguar qué emails están registrados.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: 'Credenciales inválidas' }
 */
router.post('/auth/login', authController.postLogin);

module.exports = router;
