const prisma = require('../lib/prisma');

function createPatientRepository({ prisma: client }) {
  function findAllByNutritionist(nutritionistId) {
    return client.patient.findMany({ where: { nutritionistId }, orderBy: { updatedAt: 'desc' } });
  }

  function findByIdForNutritionist(id, nutritionistId) {
    return client.patient.findFirst({ where: { id, nutritionistId } });
  }

  function create(data) {
    return client.patient.create({ data });
  }

  // updateMany filtra por nutritionistId en el mismo where: un id de otro
  // nutricionista actualiza 0 filas en vez de escribir sobre un paciente ajeno.
  async function updateForNutritionist(id, nutritionistId, data) {
    const { count } = await client.patient.updateMany({ where: { id, nutritionistId }, data });
    if (count === 0) return null;
    return findByIdForNutritionist(id, nutritionistId);
  }

  return { findAllByNutritionist, findByIdForNutritionist, create, updateForNutritionist };
}

module.exports = createPatientRepository({ prisma });
module.exports.createPatientRepository = createPatientRepository;
