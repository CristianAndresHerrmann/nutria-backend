const prisma = require('../lib/prisma');

// Catálogo común: solo lectura desde la API de los nutricionistas. El alta y la
// edición de grupos son del administrador (tarea aparte).
function createFoodGroupRepository({ prisma: client }) {
  function findAll() {
    return client.foodGroup.findMany({ orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.foodGroup.findUnique({ where: { id } });
  }

  return { findAll, findById };
}

module.exports = createFoodGroupRepository({ prisma });
module.exports.createFoodGroupRepository = createFoodGroupRepository;
