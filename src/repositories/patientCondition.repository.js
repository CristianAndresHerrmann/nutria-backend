const prisma = require('../lib/prisma');

// Lo que acompaña a una condición en toda lectura: el nombre de lo que
// referencia. Con select y no con el include entero: el dueño de un alimento
// privado no viaja.
const CONDITION_INCLUDE = {
  pathology: { select: { id: true, name: true } },
  food: { select: { id: true, name: true } },
  foodGroup: { select: { id: true, name: true } },
};

// Como en patient.repository: Prisma ignora un filtro undefined, y
// `patient: { nutritionistId: undefined }` dejaría pasar condiciones de
// pacientes ajenos. Se corta acá con un 500 en vez de devolver datos de otro.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('patientCondition.repository: consulta sin nutritionistId');
  }
}

// Toda consulta filtra por el paciente y por su nutricionista en el mismo
// where. El servicio ya verificó el paciente, pero el aislamiento no depende
// solo de eso: con un paciente ajeno, la consulta no encuentra nada.
function ownedBy(patientId, nutritionistId) {
  assertNutritionistId(nutritionistId);
  return { patientId, patient: { nutritionistId } };
}

function createPatientConditionRepository({ prisma: client }) {
  function findAllForPatient(patientId, nutritionistId) {
    return client.patientCondition.findMany({
      where: ownedBy(patientId, nutritionistId),
      include: CONDITION_INCLUDE,
      orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
    });
  }

  function findByIdForPatient(id, patientId, nutritionistId) {
    return client.patientCondition.findFirst({
      where: { id, ...ownedBy(patientId, nutritionistId) },
      include: CONDITION_INCLUDE,
    });
  }

  // Misma condición = mismo tipo y mismo destino. Los destinos que no
  // corresponden al tipo vienen en null y matchean solo otro null.
  // `excludeId` deja afuera la propia condición al editarla.
  function findDuplicate(patientId, nutritionistId, { type, pathologyId, foodId, foodGroupId }, excludeId = null) {
    const where = { ...ownedBy(patientId, nutritionistId), type, pathologyId, foodId, foodGroupId };
    if (excludeId) where.id = { not: excludeId };
    return client.patientCondition.findFirst({ where });
  }

  function create(patientId, data) {
    return client.patientCondition.create({ data: { ...data, patientId }, include: CONDITION_INCLUDE });
  }

  // updateMany y deleteMany llevan el aislamiento en el where: una condición de
  // otro paciente o de otro nutricionista afecta 0 filas.
  async function updateForPatient(id, patientId, nutritionistId, data) {
    const { count } = await client.patientCondition.updateMany({
      where: { id, ...ownedBy(patientId, nutritionistId) },
      data,
    });
    if (count === 0) return null;
    return findByIdForPatient(id, patientId, nutritionistId);
  }

  async function deleteForPatient(id, patientId, nutritionistId) {
    const { count } = await client.patientCondition.deleteMany({
      where: { id, ...ownedBy(patientId, nutritionistId) },
    });
    return count > 0;
  }

  return { findAllForPatient, findByIdForPatient, findDuplicate, create, updateForPatient, deleteForPatient };
}

module.exports = createPatientConditionRepository({ prisma });
module.exports.createPatientConditionRepository = createPatientConditionRepository;
