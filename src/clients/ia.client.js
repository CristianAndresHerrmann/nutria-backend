const config = require('../config/env');
const AppError = require('../utils/AppError');

const IA_UNAVAILABLE_MESSAGE = 'El servicio de IA no está disponible';

function iaUnavailable(reason) {
  return new AppError(503, IA_UNAVAILABLE_MESSAGE, { code: 'IA_UNAVAILABLE', details: { reason } });
}

// Único punto por el que el backend llama al servicio de IA. Toda falla (caído,
// lento, respuesta de error o cuerpo ilegible) sale como un 503 controlado con
// `reason`, nunca como un error crudo de fetch.
function createIaClient({ baseUrl, timeoutMs, fetchImpl = (...args) => fetch(...args) }) {
  return {
    async getJson(path) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        throw iaUnavailable(error.name === 'TimeoutError' ? 'timeout' : 'unreachable');
      }

      if (!response.ok) throw iaUnavailable('bad_status');

      try {
        return await response.json();
      } catch {
        throw iaUnavailable('bad_body');
      }
    },
  };
}

module.exports = createIaClient({ baseUrl: config.iaServiceUrl, timeoutMs: config.iaTimeoutMs });
module.exports.createIaClient = createIaClient;
