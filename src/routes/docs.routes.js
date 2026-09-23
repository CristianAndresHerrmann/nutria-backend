const { Router } = require('express');
const swaggerUi = require('swagger-ui-express');
const config = require('../config/env');
const openapiSpec = require('../docs/openapi');
const AppError = require('../utils/AppError');

const router = Router();

// Los dos specs se ofrecen como definiciones separadas en el selector de Swagger UI
// en vez de fusionarse en un documento único: así cada servicio sigue siendo dueño
// de su contrato y no hay nada que mantener sincronizado a mano. (Además /health
// existe en los dos y colisionaría.)
const uiOptions = {
  explorer: true,
  customSiteTitle: 'NutrIA — API',
  swaggerOptions: {
    urls: [
      { url: '/docs.json', name: 'nutria-backend (Express)' },
      { url: '/docs/ia.json', name: 'nutria-ia (FastAPI)' },
    ],
    // Sin esto el token cargado con "Authorize" se pierde en cada recarga de la
    // página y hay que volver a loguearse para probar cualquier endpoint.
    persistAuthorization: true,
  },
};

const IA_SPEC_TIMEOUT_MS = 3000;

// El spec de IA lo pide el backend y no el navegador por tres razones: queda en el
// mismo origen que la UI, permite inyectarle el `servers` que FastAPI no emite, y
// es el único camino que sigue funcionando en el Incremento 3, donde el servicio de
// IA se despliega privado y solo el backend puede alcanzarlo.
async function getIaSpec(req, res, next) {
  try {
    const response = await fetch(`${config.iaServiceUrl}/openapi.json`, {
      signal: AbortSignal.timeout(IA_SPEC_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new AppError(502, `El servicio de IA respondió ${response.status} al pedirle su documentación`);
    }

    const spec = await response.json();

    // FastAPI no declara `servers`. Sin este campo Swagger UI toma el origen de la
    // página como base y "Try it out" de IA terminaría pegándole al backend, que
    // tiene su propio /health y devolvería 200 con los datos equivocados.
    spec.servers = [{ url: config.iaPublicUrl, description: 'Servicio de IA (Traefik)' }];

    res.json(spec);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(502, 'No se pudo alcanzar el servicio de IA para leer su documentación'));
  }
}

// Las rutas de spec se registran antes del montaje de la UI: `router.use('/docs')`
// matchea todo lo que cuelgue de /docs y se quedaría con /docs/ia.json.
router.get('/docs.json', (req, res) => res.json(openapiSpec));
router.get('/docs/ia.json', getIaSpec);

// serveFiles y no serve: con varias definiciones hay que pasarle las opciones
// también al middleware de estáticos, o el selector no aparece.
router.use('/docs', swaggerUi.serveFiles(null, uiOptions), swaggerUi.setup(null, uiOptions));

module.exports = router;
module.exports.getIaSpec = getIaSpec;
module.exports.uiOptions = uiOptions;
