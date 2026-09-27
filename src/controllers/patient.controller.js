const patientService = require('../services/patient.service');
const { serializePatient, serializePatients } = require('../serializers/patient.serializer');

// La validación de body/params/query la hace el middleware validate en la ruta:
// acá solo llegan datos ya parseados, en req.validated.

async function getPatients(req, res, next) {
  try {
    const patients = await patientService.listForNutritionist(req.nutricionistaId);
    res.status(200).json(serializePatients(patients));
  } catch (error) {
    next(error);
  }
}

async function getPatientById(req, res, next) {
  try {
    const patient = await patientService.getForNutritionist(req.validated.params.id, req.nutricionistaId);
    res.status(200).json(serializePatient(patient));
  } catch (error) {
    next(error);
  }
}

async function createPatient(req, res, next) {
  try {
    const patient = await patientService.createForNutritionist(req.nutricionistaId, req.validated.body);
    res.status(201).json(serializePatient(patient));
  } catch (error) {
    next(error);
  }
}

async function updatePatient(req, res, next) {
  try {
    const patient = await patientService.updateForNutritionist(
      req.validated.params.id,
      req.nutricionistaId,
      req.validated.body,
    );
    res.status(200).json(serializePatient(patient));
  } catch (error) {
    next(error);
  }
}

module.exports = { getPatients, getPatientById, createPatient, updatePatient };
