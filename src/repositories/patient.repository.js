const prisma = require('../lib/prisma');

function findAllByNutritionist(nutritionistId) {
  return prisma.patient.findMany({ where: { nutritionistId } });
}

function findByIdForNutritionist(id, nutritionistId) {
  return prisma.patient.findFirst({ where: { id, nutritionistId } });
}

module.exports = { findAllByNutritionist, findByIdForNutritionist };
