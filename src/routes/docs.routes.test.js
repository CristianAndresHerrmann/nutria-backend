const config = require('../config/env');
const { createRouter } = require('./index');
const docsRouter = require('./docs.routes');
const { getIaSpec, forwardToIa } = require('./docs.routes');

// Recorre el árbol de routers juntando los paths registrados, para poder afirmar
// qué quedó montado sin levantar un servidor HTTP.
function collectRoutePaths(router, found = []) {
  for (const layer of router.stack || []) {
    if (layer.route) found.push(layer.route.path);
    else if (layer.handle && layer.handle.stack) collectRoutePaths(layer.handle, found);
  }
  return found;
}

describe('montaje de la documentación', () => {
  it('expone los specs en desarrollo', () => {
    const paths = collectRoutePaths(createRouter('development'));

    expect(paths).toContain('/docs.json');
    expect(paths).toContain('/docs/ia.json');
  });

  it('no monta nada de documentación en producción', () => {
    const paths = collectRoutePaths(createRouter('production'));

    expect(paths).not.toContain('/docs.json');
    expect(paths).not.toContain('/docs/ia.json');
    // Las rutas reales de la API siguen estando: el gating no se llevó puesto nada más.
    expect(paths).toContain('/patients');
  });

  it('no deja el reenvío a nutria-ia accesible en producción', () => {
    // El reenvío se monta con router.use, así que no figura como ruta y no lo
    // alcanza la comprobación de arriba. Se busca el router de docs por identidad:
    // si quedara montado en producción sería una vía de acceso sin autenticación
    // al servicio de IA.
    const montados = (nodeEnv) => createRouter(nodeEnv).stack.map((layer) => layer.handle);

    expect(montados('development')).toContain(docsRouter);
    expect(montados('production')).not.toContain(docsRouter);
  });
});

describe('proxy del spec de nutria-ia', () => {
  let res;
  let next;

  beforeEach(() => {
    res = { json: vi.fn() };
    next = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(implementation) {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('pide el spec por la red interna de Docker', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => ({ paths: {} }) }));

    await getIaSpec({}, res, next);

    expect(fetchMock.mock.calls[0][0]).toBe(`${config.iaServiceUrl}/openapi.json`);
    expect(next).not.toHaveBeenCalled();
  });

  it('le inyecta al spec un servers relativo que apunta al reenvío del backend', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ openapi: '3.1.0', paths: {} }) }));

    await getIaSpec({}, res, next);

    const { servers } = res.json.mock.calls[0][0];

    // Que sea relativo es lo que mantiene todo en un mismo origen, y por lo tanto
    // lo que evita que el servicio de IA necesite CORS.
    expect(servers).toEqual([{ url: '/docs/ia', description: expect.any(String) }]);
    expect(servers[0].url.startsWith('http')).toBe(false);
  });

  it('pisa el servers que traiga el spec en vez de agregarle otro', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ servers: [{ url: 'http://ia:8000' }] }) }));

    await getIaSpec({}, res, next);

    // Un servers con la URL interna dejaría "Try it out" apuntando a un host que
    // el navegador no resuelve.
    expect(res.json.mock.calls[0][0].servers).toEqual([{ url: '/docs/ia', description: expect.any(String) }]);
  });

  it('responde 502 cuando el servicio de IA contesta con error', async () => {
    stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));

    await getIaSpec({}, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }));
    expect(next.mock.calls[0][0].message).toContain('503');
  });

  it('responde 502 cuando el servicio de IA no responde', async () => {
    stubFetch(async () => {
      throw new Error('fetch failed');
    });

    await getIaSpec({}, res, next);

    // Sin esto, con el contenedor de IA caído la pestaña queda colgada en vez de
    // mostrar un error y seguir sirviendo la definición del backend.
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }));
  });
});

describe('reenvío de las llamadas de "Try it out" de nutria-ia', () => {
  let res;
  let next;

  beforeEach(() => {
    res = { status: vi.fn(() => res), set: vi.fn(() => res), send: vi.fn(() => res) };
    next = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response) {
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function iaResponse({ status = 200, body = '{}', contentType = 'application/json' } = {}) {
    return {
      status,
      headers: { get: () => contentType },
      arrayBuffer: async () => Buffer.from(body),
    };
  }

  it('reenvía un GET al servicio de IA conservando la ruta', async () => {
    const fetchMock = stubFetch(iaResponse({ body: '{"service":"nutria-ia"}' }));

    // Express ya sacó el prefijo /docs/ia cuando llega acá.
    await forwardToIa({ method: 'GET', url: '/health' }, res, next);

    expect(fetchMock.mock.calls[0][0]).toBe(`${config.iaServiceUrl}/health`);
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0].toString()).toBe('{"service":"nutria-ia"}');
  });

  it('reenvía el body de un POST', async () => {
    const fetchMock = stubFetch(iaResponse({ status: 201 }));

    await forwardToIa({ method: 'POST', url: '/meal-plans', body: { patientId: 'abc' } }, res, next);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(`${config.iaServiceUrl}/meal-plans`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ patientId: 'abc' });
  });

  it('devuelve el error del servicio de IA tal como vino', async () => {
    stubFetch(iaResponse({ status: 422, body: '{"detail":[{"loc":["body"],"msg":"field required"}]}' }));

    await forwardToIa({ method: 'POST', url: '/meal-plans', body: {} }, res, next);

    // Un 422 de FastAPI tiene que llegar a la UI con su forma original: traducirlo
    // al formato de error del backend haría que la documentación mienta sobre lo
    // que ese endpoint realmente devuelve.
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.send.mock.calls[0][0].toString()).toContain('field required');
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 502 cuando el servicio de IA no responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch failed');
    }));

    await forwardToIa({ method: 'GET', url: '/health' }, res, next);

    expect(res.send).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }));
  });
});
