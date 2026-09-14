const patientRepository = require('../repositories/patient.repository');
const AppError = require('../utils/AppError');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getPatients(req, res, next) {
  try {
    const patients = await patientRepository.findAllByNutritionist(req.nutricionistaId);
    res.status(200).json(patients);
  } catch (error) {
    next(error);
  }
}

async function getPatientById(req, res, next) {
  try {
    if (!UUID_REGEX.test(req.params.id)) {
      throw new AppError(404, 'Not found');
    }

    const patient = await patientRepository.findByIdForNutritionist(
      req.params.id,
      req.nutricionistaId,
    );

    if (!patient) {
      throw new AppError(404, 'Not found');
    }

    res.status(200).json(patient);
  } catch (error) {
    next(error);
  }
}

module.exports = { getPatients, getPatientById };
