const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const patientRoutes = require('./patient.routes');

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(patientRoutes);

module.exports = router;
