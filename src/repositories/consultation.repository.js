const prisma = require('../lib/prisma');

// Lo que acompaña a una consulta en toda lectura: los hábitos pautados en ella.
// Sin la evaluación (consulta que evalúa, observaciones): eso es del
// Incremento 5. Sin orderBy: prescribed_habit no tiene columna de orden y el id
// es un UUID al azar, así que ordenar por id mezclaría los hábitos en vez de
// dejarlos como se cargaron.
const CONSULTATION_INCLUDE = {
  habitsSet: { select: { id: true, description: true, compliance: true } },
};

// Como en patient.repository: Prisma ignora un filtro undefined, y
// `patient: { nutritionistId: undefined }` dejaría pasar consultas de pacientes
// ajenos. Se corta acá con un 500 en vez de devolver datos de otro.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('consultation.repository: consulta sin nutritionistId');
  }
}

// Toda consulta filtra por el paciente y por su nutricionista en el mismo
// where. El servicio ya verificó el paciente, pero el aislamiento no depende
// solo de eso: con un paciente ajeno, la consulta no encuentra nada.
function ownedBy(patientId, nutritionistId) {
  assertNutritionistId(nutritionistId);
  return { patientId, patient: { nutritionistId } };
}

function createConsultationRepository({ prisma: client }) {
  function findAllForPatient(patientId, nutritionistId) {
    return client.consultation.findMany({
      where: ownedBy(patientId, nutritionistId),
      include: CONSULTATION_INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  function findByIdForPatient(id, patientId, nutritionistId, db = client) {
    return db.consultation.findFirst({
      where: { id, ...ownedBy(patientId, nutritionistId) },
      include: CONSULTATION_INCLUDE,
    });
  }

  // Guardar una consulta cuenta como actualización del paciente: su
  // "última actualización" (y el orden del listado) sale de patient.updated_at,
  // que Prisma solo mueve al escribir la fila del paciente. Se toca en la misma
  // transacción que la consulta, filtrando también por el nutricionista.
  function touchPatient(db, patientId, nutritionistId) {
    return db.patient.updateMany({ where: { id: patientId, nutritionistId }, data: { updatedAt: new Date() } });
  }

  // La consulta y sus hábitos pautados se crean juntos: si falla uno, no queda
  // ninguno.
  function create(patientId, nutritionistId, data, habits) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const consultation = await tx.consultation.create({
        data: { ...data, patientId, habitsSet: { create: habits } },
        include: CONSULTATION_INCLUDE,
      });
      await touchPatient(tx, patientId, nutritionistId);
      return consultation;
    });
  }

  // updateMany lleva el aislamiento en el where: una consulta de otro paciente
  // o de otro nutricionista afecta 0 filas, y entonces el paciente no se toca.
  function updateForPatient(id, patientId, nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const { count } = await tx.consultation.updateMany({
        where: { id, ...ownedBy(patientId, nutritionistId) },
        data,
      });
      if (count === 0) return null;
      await touchPatient(tx, patientId, nutritionistId);
      return findByIdForPatient(id, patientId, nutritionistId, tx);
    });
  }

  return { findAllForPatient, findByIdForPatient, create, updateForPatient };
}

module.exports = createConsultationRepository({ prisma });
module.exports.createConsultationRepository = createConsultationRepository;
