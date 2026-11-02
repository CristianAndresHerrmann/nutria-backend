const prisma = require('../lib/prisma');

// Catálogo común: de solo lectura para los nutricionistas. El alta y la edición
// son del administrador (T25).
function createFoodGroupRepository({ prisma: client }) {
  function findAll() {
    return client.foodGroup.findMany({ orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.foodGroup.findUnique({ where: { id } });
  }

  // Sin distinguir mayúsculas, como el citext de la base. excludeId deja afuera
  // al grupo que se está editando.
  function findByName(name, { excludeId } = {}) {
    const where = { name: { equals: name, mode: 'insensitive' } };
    if (excludeId) where.id = { not: excludeId };
    return client.foodGroup.findFirst({ where });
  }

  function create(data) {
    return client.foodGroup.create({ data });
  }

  function update(id, data) {
    return client.foodGroup.update({ where: { id }, data });
  }

  return { findAll, findById, findByName, create, update };
}

module.exports = createFoodGroupRepository({ prisma });
module.exports.createFoodGroupRepository = createFoodGroupRepository;
