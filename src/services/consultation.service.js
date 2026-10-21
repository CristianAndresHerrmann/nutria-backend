const patientRepository = require('../repositories/patient.repository');
const consultationRepository = require('../repositories/consultation.repository');
const { serializeConsultation, serializeConsultations } = require('../serializers/consultation.serializer');
const AppError = require('../utils/AppError');
const { PATIENT_NOT_FOUND_MESSAGE } = require('./patient.service');

const CONSULTATION_NOT_FOUND_MESSAGE = 'Consulta no encontrada';

// Consultas del paciente (RF-13, RF-18) y hábitos pautados al cierre (RF-22,
// solo registro). No hay reglas entre consultas (cuántas "primera" puede haber,
// orden de las fechas): la tarea no las define. Las mediciones cargadas con la
// consulta (T20) se crean en la misma transacción; después se leen y editan por
// measurement.service. La evaluación de los hábitos es del Incremento 5.
function createConsultationService({ patientRepository: patients, consultationRepository: repository }) {
  // Un paciente de otro nutricionista da el mismo 404 que uno inexistente.
  async function assertPatient(patientId, nutritionistId) {
    if (!(await patients.findByIdForNutritionist(patientId, nutritionistId))) {
      throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
    }
  }

  return {
    async list(patientId, nutritionistId) {
      await assertPatient(patientId, nutritionistId);
      return serializeConsultations(await repository.findAllForPatient(patientId, nutritionistId));
    },

    async get(id, patientId, nutritionistId) {
      await assertPatient(patientId, nutritionistId);
      const consultation = await repository.findByIdForPatient(id, patientId, nutritionistId);
      if (!consultation) throw new AppError(404, CONSULTATION_NOT_FOUND_MESSAGE);
      return serializeConsultation(consultation);
    },

    // Los hábitos nacen pendientes: compliance tiene default pending en la base.
    async create(patientId, nutritionistId, { habits = [], measurements = [], ...data }) {
      await assertPatient(patientId, nutritionistId);
      return serializeConsultation(await repository.create(patientId, nutritionistId, data, habits, measurements));
    },

    // Reemplazo completo de los campos de la consulta, como PUT /patients/:id:
    // un campo opcional omitido queda en null. Los hábitos no se tocan.
    async update(id, patientId, nutritionistId, data) {
      await assertPatient(patientId, nutritionistId);
      const updated = await repository.updateForPatient(id, patientId, nutritionistId, data);
      if (!updated) throw new AppError(404, CONSULTATION_NOT_FOUND_MESSAGE);
      return serializeConsultation(updated);
    },
  };
}

module.exports = createConsultationService({ patientRepository, consultationRepository });
module.exports.createConsultationService = createConsultationService;
module.exports.CONSULTATION_NOT_FOUND_MESSAGE = CONSULTATION_NOT_FOUND_MESSAGE;
