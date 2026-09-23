const { Router } = require('express');
const healthController = require('../controllers/health.controller');

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Salud]
 *     summary: Verifica que el backend responde
 *     description: >
 *       No toca la base de datos ni el servicio de IA: solo confirma que el proceso
 *       está levantado y atendiendo. El servicio de IA expone su propio `/health`
 *       con la misma forma y otro valor de `service`.
 *     responses:
 *       '200':
 *         description: El servicio responde
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Health' }
 */
router.get('/health', healthController.getHealth);

module.exports = router;
