const prisma = require('../lib/prisma');

// Catálogo común: de solo lectura para los nutricionistas. El alta y la edición
// son del administrador (T25).
function createPathologyRepository({ prisma: client }) {
  function findAll() {
    return client.pathology.findMany({ orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.pathology.findUnique({ where: { id } });
  }

  // Sin distinguir mayúsculas, como el citext de la base. excludeId deja afuera
  // a la patología que se está editando.
  function findByName(name, { excludeId } = {}) {
    const where = { name: { equals: name, mode: 'insensitive' } };
    if (excludeId) where.id = { not: excludeId };
    return client.pathology.findFirst({ where });
  }

  function create(data) {
    return client.pathology.create({ data });
  }

  function update(id, data) {
    return client.pathology.update({ where: { id }, data });
  }

  return { findAll, findById, findByName, create, update };
}

module.exports = createPathologyRepository({ prisma });
module.exports.createPathologyRepository = createPathologyRepository;
