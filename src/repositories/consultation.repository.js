const prisma = require('../lib/prisma');
const touchPatient = require('./touchPatient');

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

  // La consulta, sus hábitos pautados y sus mediciones se crean juntos: si
  // falla uno, no queda ninguno. Las mediciones van con createMany aparte y no
  // anidadas, porque también llevan el paciente; toman la fecha de la consulta.
  // Guardarla toca al paciente (ver touchPatient).
  function create(patientId, nutritionistId, data, habits, measurements = []) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const consultation = await tx.consultation.create({
        data: { ...data, patientId, habitsSet: { create: habits } },
        include: CONSULTATION_INCLUDE,
      });
      if (measurements.length > 0) {
        await tx.measurement.createMany({
          data: measurements.map((measurement) => ({
            ...measurement,
            patientId,
            consultationId: consultation.id,
            date: data.date,
          })),
        });
      }
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
