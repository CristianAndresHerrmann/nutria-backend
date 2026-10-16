const patientRepository = require('../repositories/patient.repository');
const AppError = require('../utils/AppError');
const { RESTRICTION_CONDITION_TYPES, isMissingClinicalData } = require('../utils/missingClinicalData');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PATIENT_NOT_FOUND_MESSAGE = 'Paciente no encontrado';

function createPatientService({ patientRepository: repository }) {
  return {
    async listForNutritionist(nutritionistId) {
      return repository.findAllByNutritionist(nutritionistId);
    },

    // Un id con formato inválido y un id de un paciente que no le pertenece a
    // este nutricionista dan la misma respuesta (404): no hay forma de que el
    // cliente distinga "no existe" de "es de otro nutricionista".
    async getForNutritionist(id, nutritionistId) {
      if (!UUID_REGEX.test(id)) {
        throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
      }

      const patient = await repository.findByIdForNutritionist(id, nutritionistId);

      if (!patient) {
        throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
      }

      const restrictionConditionCount = await repository.countConditionsForNutritionist(
        id,
        nutritionistId,
        RESTRICTION_CONDITION_TYPES,
      );

      return {
        ...patient,
        missingClinicalData: isMissingClinicalData({ medication: patient.medication, restrictionConditionCount }),
      };
    },

    async createForNutritionist(nutritionistId, data) {
      return repository.create({ ...data, nutritionistId });
    },

    // dataCompletedAt se setea solo en la transición incompleta -> completa.
    // Si ya estaba completa, o si se vuelve a marcar como incompleta, el
    // timestamp original se conserva: es un hecho auditable (RNF-03), no un
    // reflejo del estado actual del checkbox.
    async updateForNutritionist(id, nutritionistId, data) {
      if (!UUID_REGEX.test(id)) {
        throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
      }

      const existing = await repository.findByIdForNutritionist(id, nutritionistId);

      if (!existing) {
        throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
      }

      const becomingComplete = data.registrationComplete && !existing.registrationComplete;
      const dataCompletedAt = becomingComplete ? new Date() : existing.dataCompletedAt;

      const updated = await repository.updateForNutritionist(id, nutritionistId, {
        ...data,
        dataCompletedAt,
      });

      if (!updated) {
        throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
      }

      return updated;
    },
  };
}

module.exports = createPatientService({ patientRepository });
module.exports.createPatientService = createPatientService;
module.exports.PATIENT_NOT_FOUND_MESSAGE = PATIENT_NOT_FOUND_MESSAGE;
