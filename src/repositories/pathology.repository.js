const prisma = require('../lib/prisma');
const { assertAuthorId } = require('./catalogAuthor');

function createPathologyRepository({ prisma: client }) {
  function findAll() {
    return client.pathology.findMany({ orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.pathology.findUnique({ where: { id } });
  }

  function findByName(name) {
    return client.pathology.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }

  function create(data) {
    assertAuthorId('pathology.repository', data.createdById);
    return client.pathology.create({ data });
  }

  // Mismo resguardo que foodGroup.repository: solo matchea si el autor coincide.
  async function updateByAuthor(id, nutritionistId, data) {
    assertAuthorId('pathology.repository', nutritionistId);
    const { count } = await client.pathology.updateMany({ where: { id, createdById: nutritionistId }, data });
    if (count === 0) return null;
    return findById(id);
  }

  return { findAll, findById, findByName, create, updateByAuthor };
}

module.exports = createPathologyRepository({ prisma });
module.exports.createPathologyRepository = createPathologyRepository;
