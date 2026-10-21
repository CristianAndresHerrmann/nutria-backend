const prisma = require('../lib/prisma');
const touchPatient = require('./touchPatient');

// Como en patient.repository: Prisma ignora un filtro undefined, y
// `patient: { nutritionistId: undefined }` dejaría pasar mediciones de
// pacientes ajenos. Se corta acá con un 500 en vez de devolver datos de otro.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('measurement.repository: consulta sin nutritionistId');
  }
}

// Toda consulta filtra por el paciente y por su nutricionista en el mismo
// where. El servicio ya verificó el paciente, pero el aislamiento no depende
// solo de eso: con un paciente ajeno, la consulta no encuentra nada.
function ownedBy(patientId, nutritionistId) {
  assertNutritionistId(nutritionistId);
  return { patientId, patient: { nutritionistId } };
}

function createMeasurementRepository({ prisma: client }) {
  // De la más reciente a la más antigua. La tabla no tiene fecha de alta: en el
  // mismo día se ordena por tipo y por id, para que el orden sea siempre el
  // mismo.
  function findAllForPatient(patientId, nutritionistId) {
    return client.measurement.findMany({
      where: ownedBy(patientId, nutritionistId),
      orderBy: [{ date: 'desc' }, { type: 'asc' }, { id: 'asc' }],
    });
  }

  function findByIdForPatient(id, patientId, nutritionistId) {
    return client.measurement.findFirst({ where: { id, ...ownedBy(patientId, nutritionistId) } });
  }

  // Toda escritura toca al paciente en la misma transacción (ver touchPatient).
  function create(patientId, nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const measurement = await tx.measurement.create({ data: { ...data, patientId } });
      await touchPatient(tx, patientId, nutritionistId);
      return measurement;
    });
  }

  // updateMany y deleteMany llevan el aislamiento en el where: una medición de
  // otro paciente o de otro nutricionista afecta 0 filas, y entonces el
  // paciente no se toca.
  function updateForPatient(id, patientId, nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const { count } = await tx.measurement.updateMany({ where: { id, ...ownedBy(patientId, nutritionistId) }, data });
      if (count === 0) return false;
      await touchPatient(tx, patientId, nutritionistId);
      return true;
    });
  }

  function deleteForPatient(id, patientId, nutritionistId) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const { count } = await tx.measurement.deleteMany({ where: { id, ...ownedBy(patientId, nutritionistId) } });
      if (count === 0) return false;
      await touchPatient(tx, patientId, nutritionistId);
      return true;
    });
  }

  return { findAllForPatient, findByIdForPatient, create, updateForPatient, deleteForPatient };
}

module.exports = createMeasurementRepository({ prisma });
module.exports.createMeasurementRepository = createMeasurementRepository;
