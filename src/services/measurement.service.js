const patientRepository = require('../repositories/patient.repository');
const measurementRepository = require('../repositories/measurement.repository');
const consultationRepository = require('../repositories/consultation.repository');
const { serializeMeasurements } = require('../serializers/measurement.serializer');
const AppError = require('../utils/AppError');
const { PATIENT_NOT_FOUND_MESSAGE } = require('./patient.service');

const MEASUREMENT_NOT_FOUND_MESSAGE = 'Medición no encontrada';
const CONSULTATION_NOT_FOUND_FIELD_MESSAGE = 'La consulta no existe';

// Mediciones antropométricas y de laboratorio del paciente (RF-11, RF-12), con
// o sin consulta. Solo validaciones técnicas (las del schema): no hay umbrales
// ni reglas clínicas. El IMC se calcula al leer (src/utils/bmi.js).
function createMeasurementService({
  patientRepository: patients,
  measurementRepository: repository,
  consultationRepository: consultations,
}) {
  // Un paciente de otro nutricionista da el mismo 404 que uno inexistente.
  async function assertPatient(patientId, nutritionistId) {
    if (!(await patients.findByIdForNutritionist(patientId, nutritionistId))) {
      throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
    }
  }

  // La consulta de una medición es del mismo paciente: es una regla entre
  // tablas que no entra en un CHECK (ver ajustes al modelo del Anexo A,
  // Incremento 2). Sin este chequeo, la de otro paciente se guardaría, y una
  // inexistente terminaría en un 500 por la FK.
  async function assertConsultation(consultationId, patientId, nutritionistId) {
    if (consultationId === null) return;
    if (!(await consultations.findByIdForPatient(consultationId, patientId, nutritionistId))) {
      throw new AppError(400, CONSULTATION_NOT_FOUND_FIELD_MESSAGE, {
        code: 'VALIDATION_ERROR',
        details: { fields: { consultationId: CONSULTATION_NOT_FOUND_FIELD_MESSAGE } },
      });
    }
  }

  async function serializedList(patientId, nutritionistId) {
    return serializeMeasurements(await repository.findAllForPatient(patientId, nutritionistId));
  }

  // Después de escribir se relee el histórico: el IMC de un peso depende de
  // las tallas del paciente, no solo de la fila guardada.
  async function serializedOne(id, patientId, nutritionistId) {
    return (await serializedList(patientId, nutritionistId)).find((measurement) => measurement.id === id);
  }

  return {
    async list(patientId, nutritionistId) {
      await assertPatient(patientId, nutritionistId);
      return serializedList(patientId, nutritionistId);
    },

    async create(patientId, nutritionistId, data) {
      await assertPatient(patientId, nutritionistId);
      await assertConsultation(data.consultationId, patientId, nutritionistId);
      const created = await repository.create(patientId, nutritionistId, data);
      return serializedOne(created.id, patientId, nutritionistId);
    },

    // Reemplazo completo, como PUT /patients/:id: un opcional omitido
    // (detail, unit, consultationId) queda en null.
    async update(id, patientId, nutritionistId, data) {
      await assertPatient(patientId, nutritionistId);
      if (!(await repository.findByIdForPatient(id, patientId, nutritionistId))) {
        throw new AppError(404, MEASUREMENT_NOT_FOUND_MESSAGE);
      }
      await assertConsultation(data.consultationId, patientId, nutritionistId);
      if (!(await repository.updateForPatient(id, patientId, nutritionistId, data))) {
        throw new AppError(404, MEASUREMENT_NOT_FOUND_MESSAGE);
      }
      return serializedOne(id, patientId, nutritionistId);
    },

    async remove(id, patientId, nutritionistId) {
      await assertPatient(patientId, nutritionistId);
      if (!(await repository.deleteForPatient(id, patientId, nutritionistId))) {
        throw new AppError(404, MEASUREMENT_NOT_FOUND_MESSAGE);
      }
    },
  };
}

module.exports = createMeasurementService({ patientRepository, measurementRepository, consultationRepository });
module.exports.createMeasurementService = createMeasurementService;
module.exports.MEASUREMENT_NOT_FOUND_MESSAGE = MEASUREMENT_NOT_FOUND_MESSAGE;
