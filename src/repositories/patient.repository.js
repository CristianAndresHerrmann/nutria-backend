const prisma = require('../lib/prisma');

function findAllByNutritionist(nutritionistId) {
  return prisma.patient.findMany({ where: { nutritionistId }, orderBy: { updatedAt: 'desc' } });
}

function findByIdForNutritionist(id, nutritionistId) {
  return prisma.patient.findFirst({ where: { id, nutritionistId } });
}

function create(data) {
  return prisma.patient.create({ data });
}

// updateMany filtra por nutritionistId en el mismo where: un id de otro
// nutricionista actualiza 0 filas en vez de escribir sobre un paciente ajeno.
async function updateForNutritionist(id, nutritionistId, data) {
  const { count } = await prisma.patient.updateMany({ where: { id, nutritionistId }, data });
  if (count === 0) return null;
  return findByIdForNutritionist(id, nutritionistId);
}

module.exports = { findAllByNutritionist, findByIdForNutritionist, create, updateForNutritionist };
