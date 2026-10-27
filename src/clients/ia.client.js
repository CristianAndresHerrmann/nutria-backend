const config = require('../config/env');
const AppError = require('../utils/AppError');

const IA_UNAVAILABLE_MESSAGE = 'El servicio de IA no está disponible';

// Errores controlados del servicio de IA (DA-28) y el reason con que salen del
// backend. Los tres son recuperables: el cliente puede reintentar (RNF-02).
const GENERATION_ERROR_REASONS = {
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_ERROR: 'provider_error',
  INVALID_PROVIDER_OUTPUT: 'invalid_output',
};

function iaUnavailable(reason) {
  return new AppError(503, IA_UNAVAILABLE_MESSAGE, { code: 'IA_UNAVAILABLE', details: { reason } });
}

function networkReason(error) {
  return error.name === 'TimeoutError' ? 'timeout' : 'unreachable';
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
        throw iaUnavailable(networkReason(error));
      }

      if (!response.ok) throw iaUnavailable('bad_status');

      try {
        return await response.json();
      } catch {
        throw iaUnavailable('bad_body');
      }
    },

    // POST con un tope propio (la generación tarda más que un health check).
    // Un error controlado del servicio sale como 503 con su reason, y lleva en
    // `generation` los datos de la llamada al proveedor (details.generation) para
    // registrar la traza; esos datos no viajan en la respuesta al cliente. Un 422
    // es una solicitud mal armada por el backend, no una falla recuperable: sale
    // como error interno (500).
    async postJson(path, body, { timeoutMs: requestTimeoutMs = timeoutMs } = {}) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
      } catch (error) {
        throw iaUnavailable(networkReason(error));
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        if (error.name === 'TimeoutError') throw iaUnavailable('timeout');
        if (response.ok) throw iaUnavailable('bad_body');
      }

      if (response.ok) return payload;

      if (response.status === 422) {
        throw new Error(`servicio de IA: POST ${path} rechazó la solicitud (422): ${JSON.stringify(payload?.detail)}`);
      }

      const reason = GENERATION_ERROR_REASONS[payload?.error?.code];
      if (!reason) throw iaUnavailable('bad_status');

      const error = iaUnavailable(reason);
      error.generation = payload.error.details?.generation ?? null;
      throw error;
    },
  };
}

module.exports = createIaClient({ baseUrl: config.iaServiceUrl, timeoutMs: config.iaTimeoutMs });
module.exports.createIaClient = createIaClient;
module.exports.iaUnavailable = iaUnavailable;
