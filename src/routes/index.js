const { Router } = require('express');
const config = require('../config/env');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const patientRoutes = require('./patient.routes');
const patientConditionRoutes = require('./patientCondition.routes');
const consultationRoutes = require('./consultation.routes');
const measurementRoutes = require('./measurement.routes');
const foodGroupRoutes = require('./foodGroup.routes');
const foodRoutes = require('./food.routes');
const pathologyRoutes = require('./pathology.routes');
const recipeRoutes = require('./recipe.routes');

function createRouter(nodeEnv) {
  const router = Router();

  router.use(healthRoutes);
  router.use(authRoutes);
  router.use(patientRoutes);
  router.use(patientConditionRoutes);
  router.use(consultationRoutes);
  router.use(measurementRoutes);
  router.use(foodGroupRoutes);
  router.use(foodRoutes);
  router.use(pathologyRoutes);
  router.use(recipeRoutes);

  // La documentación interactiva es una herramienta de desarrollo, no parte de la
  // API. Con el require adentro del if, en producción swagger-ui ni se carga.
  if (nodeEnv !== 'production') {
    router.use(require('./docs.routes'));
  }

  return router;
}

module.exports = createRouter(config.nodeEnv);
module.exports.createRouter = createRouter;
