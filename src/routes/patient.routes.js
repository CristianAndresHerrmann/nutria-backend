const { Router } = require('express');
const patientController = require('../controllers/patient.controller');
const requireAuth = require('../middlewares/auth');

const router = Router();

router.get('/patients', requireAuth, patientController.getPatients);
router.get('/patients/:id', requireAuth, patientController.getPatientById);

module.exports = router;
