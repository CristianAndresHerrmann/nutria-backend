const config = require('../config/env');
const { createRouter } = require('./index');
const { getIaSpec } = require('./docs.routes');

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

  it('pide el spec por la URL interna del servicio, no por la pública', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => ({ paths: {} }) }));

    await getIaSpec({}, res, next);

    // Pegarle a la URL pública funciona en local y se rompe en el Incremento 3,
    // donde el servicio de IA es privado: por eso se afirma cuál de las dos usa.
    expect(fetchMock.mock.calls[0][0]).toBe(`${config.iaServiceUrl}/openapi.json`);
    expect(config.iaServiceUrl).not.toBe(config.iaPublicUrl);
    expect(next).not.toHaveBeenCalled();
  });

  it('le inyecta al spec el servers público que FastAPI no emite', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ openapi: '3.1.0', paths: {} }) }));

    await getIaSpec({}, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ servers: [{ url: config.iaPublicUrl, description: expect.any(String) }] }),
    );
  });

  it('pisa el servers que traiga el spec en vez de agregarle otro', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ servers: [{ url: 'http://ia:8000' }] }) }));

    await getIaSpec({}, res, next);

    // Un servers con la URL interna dejaría "Try it out" apuntando a un host que
    // el navegador no resuelve.
    expect(res.json.mock.calls[0][0].servers).toEqual([
      { url: config.iaPublicUrl, description: expect.any(String) },
    ]);
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
