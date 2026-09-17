const patientService = require('../services/patient.service');

async function getPatients(req, res, next) {
  try {
    const patients = await patientService.listForNutritionist(req.nutricionistaId);
    res.status(200).json(patients);
  } catch (error) {
    next(error);
  }
}

async function getPatientById(req, res, next) {
  try {
    const patient = await patientService.getForNutritionist(req.params.id, req.nutricionistaId);
    res.status(200).json(patient);
  } catch (error) {
    next(error);
  }
}

module.exports = { getPatients, getPatientById };
