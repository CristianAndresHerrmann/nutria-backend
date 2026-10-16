const prisma = require('../lib/prisma');

// Catálogo común: solo lectura desde la API de los nutricionistas. El alta y la
// edición de patologías son del administrador (tarea aparte).
function createPathologyRepository({ prisma: client }) {
  function findAll() {
    return client.pathology.findMany({ orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.pathology.findUnique({ where: { id } });
  }

  return { findAll, findById };
}

module.exports = createPathologyRepository({ prisma });
module.exports.createPathologyRepository = createPathologyRepository;
