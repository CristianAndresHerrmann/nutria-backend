const prisma = require('../lib/prisma');

// Prisma ignora los filtros con valor undefined: un where { id, nutritionistId:
// undefined } buscaría solo por id, en pacientes de cualquier nutricionista. Si
// por un error de cableado (ruta sin requireAuth, controlador que no pasa el id)
// llegara vacío, se corta acá con un 500 en vez de devolver datos ajenos.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('patient.repository: consulta sin nutritionistId');
  }
}

function createPatientRepository({ prisma: client }) {
  function findAllByNutritionist(nutritionistId) {
    assertNutritionistId(nutritionistId);
    return client.patient.findMany({ where: { nutritionistId }, orderBy: { updatedAt: 'desc' } });
  }

  function findByIdForNutritionist(id, nutritionistId) {
    assertNutritionistId(nutritionistId);
    return client.patient.findFirst({ where: { id, nutritionistId } });
  }

  function create(data) {
    assertNutritionistId(data.nutritionistId);
    return client.patient.create({ data });
  }

  // updateMany filtra por nutritionistId en el mismo where: un id de otro
  // nutricionista actualiza 0 filas en vez de escribir sobre un paciente ajeno.
  async function updateForNutritionist(id, nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    const { count } = await client.patient.updateMany({ where: { id, nutritionistId }, data });
    if (count === 0) return null;
    return findByIdForNutritionist(id, nutritionistId);
  }

  // El filtro por patient.nutritionistId repite el aislamiento en la misma
  // consulta: con un patientId ajeno el conteo da 0, nunca datos de otro.
  function countConditionsForNutritionist(patientId, nutritionistId, types) {
    assertNutritionistId(nutritionistId);
    return client.patientCondition.count({
      where: { patientId, type: { in: types }, patient: { nutritionistId } },
    });
  }

  return {
    findAllByNutritionist,
    findByIdForNutritionist,
    create,
    updateForNutritionist,
    countConditionsForNutritionist,
  };
}

module.exports = createPatientRepository({ prisma });
module.exports.createPatientRepository = createPatientRepository;
