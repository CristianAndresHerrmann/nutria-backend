const { Router } = require('express');
const healthController = require('../controllers/health.controller');
const validate = require('../middlewares/validate');
const { emptyQuerySchema } = require('../schemas/common.schema');

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
 *       '400': { $ref: '#/components/responses/ValidationError' }
 */
router.get('/health', validate({ query: emptyQuerySchema }), healthController.getHealth);

/**
 * @openapi
 * /health/ia:
 *   get:
 *     tags: [Salud]
 *     summary: Verifica que el backend alcanza al servicio de IA
 *     description: >
 *       Endpoint de diagnóstico de la comunicación entre componentes: el backend le
 *       pide su `/health` al servicio de IA por la red interna y devuelve el resultado
 *       junto con la latencia medida. No genera nada ni envía datos. Si el servicio
 *       de IA está caído, tarda más que `IA_TIMEOUT_MS` (3 s por defecto) o responde
 *       con error, se responde `503` con `code: IA_UNAVAILABLE` y el motivo en
 *       `details.reason`.
 *     responses:
 *       '200':
 *         description: El servicio de IA responde
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/IaHealth' }
 *       '400': { $ref: '#/components/responses/ValidationError' }
 *       '503': { $ref: '#/components/responses/IaUnavailable' }
 */
router.get('/health/ia', validate({ query: emptyQuerySchema }), healthController.getIaHealth);

module.exports = router;
