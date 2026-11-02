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

describe('cliente del servicio de IA — postJson (generación, T37)', () => {
  const GENERATION = { provider: 'fake', model: 'fake-1', template_version: 'v1', duration_ms: 12, raw_response: '{}' };

  function errorResponse(status, code) {
    return {
      ok: false,
      status,
      json: async () => ({ error: { code, message: 'falla', details: { generation: GENERATION } } }),
    };
  }

  it('manda el body como JSON por POST y devuelve la respuesta', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ proposal: {} }) }));

    await expect(buildClient(fetchImpl).postJson('/plan-proposals', { meal_types: ['lunch'] })).resolves.toEqual({ proposal: {} });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://ia:8000/plan-proposals');
    expect(options).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(JSON.parse(options.body)).toEqual({ meal_types: ['lunch'] });
  });

  it('usa el tope propio de la llamada y no el del health check', async () => {
    const fetchImpl = vi.fn(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const client = buildClient(fetchImpl, 10_000);

    await expect(client.postJson('/plan-proposals', {}, { timeoutMs: 20 })).rejects.toMatchObject({
      status: 503,
      code: 'IA_UNAVAILABLE',
      details: { reason: 'timeout' },
    });
  });

  it('responde 503 con reason unreachable si el servicio no está levantado', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(buildClient(fetchImpl).postJson('/plan-proposals', {})).rejects.toMatchObject({
      status: 503,
      details: { reason: 'unreachable' },
    });
  });

  it.each([
    [504, 'PROVIDER_TIMEOUT', 'provider_timeout'],
    [502, 'PROVIDER_ERROR', 'provider_error'],
    [502, 'INVALID_PROVIDER_OUTPUT', 'invalid_output'],
  ])('traduce %i %s a 503 con reason %s y conserva los datos de la generación', async (status, code, reason) => {
    const fetchImpl = vi.fn(async () => errorResponse(status, code));

    const error = await buildClient(fetchImpl).postJson('/plan-proposals', {}).catch((caught) => caught);

    expect(error).toMatchObject({ status: 503, code: 'IA_UNAVAILABLE', details: { reason } });
    expect(error.generation).toEqual(GENERATION);
    // La traza no viaja en la respuesta al cliente.
    expect(error.details).toEqual({ reason });
  });

  it('un 422 es un error del backend al armar la solicitud: sale como error interno, no como 503', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 422, json: async () => ({ detail: [{ msg: 'extra' }] }) }));

    const error = await buildClient(fetchImpl).postJson('/plan-proposals', {}).catch((caught) => caught);

    expect(error.status).toBeUndefined();
    expect(error.message).toContain('422');
  });

  it('un error sin código conocido responde 503 con reason bad_status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Internal' }) }));

    await expect(buildClient(fetchImpl).postJson('/plan-proposals', {})).rejects.toMatchObject({
      status: 503,
      details: { reason: 'bad_status' },
    });
  });

  it('un 200 que no es JSON responde 503 con reason bad_body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));

    await expect(buildClient(fetchImpl).postJson('/plan-proposals', {})).rejects.toMatchObject({
      status: 503,
      details: { reason: 'bad_body' },
    });
  });
});
