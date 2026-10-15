const prisma = require('../lib/prisma');
const { assertAuthorId } = require('./catalogAuthor');

function createFoodGroupRepository({ prisma: client }) {
  function findAll() {
    return client.foodGroup.findMany({ orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.foodGroup.findUnique({ where: { id } });
  }

  // name es citext: el equals ya no distingue mayúsculas en la base. El mode
  // insensitive lo deja explícito y no depende del tipo de columna.
  function findByName(name) {
    return client.foodGroup.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }

  function create(data) {
    assertAuthorId('foodGroup.repository', data.createdById);
    return client.foodGroup.create({ data });
  }

  // updateMany con el autor en el where: un ítem ajeno o del seed (createdById
  // null) actualiza 0 filas en vez de modificarse.
  async function updateByAuthor(id, nutritionistId, data) {
    assertAuthorId('foodGroup.repository', nutritionistId);
    const { count } = await client.foodGroup.updateMany({ where: { id, createdById: nutritionistId }, data });
    if (count === 0) return null;
    return findById(id);
  }

  return { findAll, findById, findByName, create, updateByAuthor };
}

module.exports = createFoodGroupRepository({ prisma });
module.exports.createFoodGroupRepository = createFoodGroupRepository;
