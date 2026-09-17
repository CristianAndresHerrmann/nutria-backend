const patientRepository = require('../repositories/patient.repository');
const AppError = require('../utils/AppError');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        throw new AppError(404, 'Not found');
      }

      const patient = await repository.findByIdForNutritionist(id, nutritionistId);

      if (!patient) {
        throw new AppError(404, 'Not found');
      }

      return patient;
    },
  };
}

module.exports = createPatientService({ patientRepository });
module.exports.createPatientService = createPatientService;
