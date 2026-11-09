const iaClient = require('../clients/ia.client');

function createHealthService({ iaClient: client }) {
  return {
    getStatus() {
      return {
        status: 'ok',
        service: 'nutria-backend',
        timestamp: new Date().toISOString(),
      };
    },

    // Prueba de comunicación backend -> IA. Si el servicio de IA no responde,
    // el 503 del cliente se propaga tal cual al errorHandler. Reenvía el proveedor y
    // el modelo configurados para que el smoke test del CD detecte el simulado (T74);
    // null si la versión desplegada de la IA todavía no los informa.
    async getIaStatus() {
      const startedAt = Date.now();
      const ia = await client.getJson('/health');

      return {
        status: 'ok',
        service: 'nutria-backend',
        ia: {
          status: ia.status,
          service: ia.service,
          provider: ia.provider ?? null,
          model: ia.model ?? null,
          latencyMs: Date.now() - startedAt,
        },
        timestamp: new Date().toISOString(),
      };
    },
  };
}

module.exports = createHealthService({ iaClient });
module.exports.createHealthService = createHealthService;
