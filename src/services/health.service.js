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
    // el 503 del cliente se propaga tal cual al errorHandler.
    async getIaStatus() {
      const startedAt = Date.now();
      const ia = await client.getJson('/health');

      return {
        status: 'ok',
        service: 'nutria-backend',
        ia: {
          status: ia.status,
          service: ia.service,
          latencyMs: Date.now() - startedAt,
        },
        timestamp: new Date().toISOString(),
      };
    },
  };
}

module.exports = createHealthService({ iaClient });
module.exports.createHealthService = createHealthService;
