const { createIaClient } = require('./ia.client');

function buildClient(fetchImpl, timeoutMs = 50) {
  return createIaClient({ baseUrl: 'http://ia:8000', timeoutMs, fetchImpl });
}

describe('cliente del servicio de IA', () => {
  it('devuelve el JSON cuando el servicio responde', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'ok' }) }));

    await expect(buildClient(fetchImpl).getJson('/health')).resolves.toEqual({ status: 'ok' });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://ia:8000/health');
  });

  it('corta por timeout y responde 503 IA_UNAVAILABLE en vez de quedar colgado', async () => {
    // Un servicio que nunca contesta: solo el abort del timeout lo libera.
    const fetchImpl = vi.fn(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );

    await expect(buildClient(fetchImpl, 20).getJson('/health')).rejects.toMatchObject({
      status: 503,
      code: 'IA_UNAVAILABLE',
      details: { reason: 'timeout' },
    });
  });

  it('responde 503 con reason unreachable si el servicio no está levantado', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(buildClient(fetchImpl).getJson('/health')).rejects.toMatchObject({
      status: 503,
      details: { reason: 'unreachable' },
    });
  });

  it('responde 503 con reason bad_status si el servicio contesta con error', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }));

    await expect(buildClient(fetchImpl).getJson('/health')).rejects.toMatchObject({
      status: 503,
      details: { reason: 'bad_status' },
    });
  });

  it('responde 503 con reason bad_body si la respuesta no es JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));

    await expect(buildClient(fetchImpl).getJson('/health')).rejects.toMatchObject({
      status: 503,
      details: { reason: 'bad_body' },
    });
  });
});
