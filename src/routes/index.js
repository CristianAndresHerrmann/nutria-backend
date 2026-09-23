const { Router } = require('express');
const config = require('../config/env');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const patientRoutes = require('./patient.routes');

function createRouter(nodeEnv) {
  const router = Router();

  router.use(healthRoutes);
  router.use(authRoutes);
  router.use(patientRoutes);

  // La documentación interactiva es una herramienta de desarrollo, no parte de la
  // API. Con el require adentro del if, en producción swagger-ui ni se carga.
  if (nodeEnv !== 'production') {
    router.use(require('./docs.routes'));
  }

  return router;
}

module.exports = createRouter(config.nodeEnv);
module.exports.createRouter = createRouter;
