const prisma = require('../lib/prisma');
const { assertAuthorId } = require('./catalogAuthor');

// Lo que acompaña a un alimento en toda lectura: su grupo (para mostrar la ruta
// en la jerarquía) y sus categorías.
const FOOD_INCLUDE = {
  foodGroup: { select: { id: true, name: true, parentId: true } },
  categories: { select: { category: true }, orderBy: { category: 'asc' } },
};

function createFoodRepository({ prisma: client }) {
  // groupIds ya viene expandido con los subgrupos (lo resuelve el servicio).
  function findMany({ search, groupIds, includeInactive } = {}) {
    const where = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (groupIds) where.foodGroupId = { in: groupIds };
    if (!includeInactive) where.active = true;

    return client.food.findMany({ where, include: FOOD_INCLUDE, orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.food.findUnique({ where: { id }, include: FOOD_INCLUDE });
  }

  function findByName(name) {
    return client.food.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }

  function create({ categories, ...data }) {
    assertAuthorId('food.repository', data.createdById);
    return client.food.create({
      data: { ...data, categories: { create: categories.map((category) => ({ category })) } },
      include: FOOD_INCLUDE,
    });
  }

  // Reemplaza datos y categorías en una sola transacción. El updateMany filtra
  // por autor: si no matchea (ítem ajeno o del seed) se corta antes de tocar las
  // categorías y devuelve null.
  async function updateByAuthor(id, nutritionistId, { categories, ...data }) {
    assertAuthorId('food.repository', nutritionistId);

    const updated = await client.$transaction(async (tx) => {
      const { count } = await tx.food.updateMany({ where: { id, createdById: nutritionistId }, data });
      if (count === 0) return false;

      await tx.foodCategory.deleteMany({ where: { foodId: id } });
      await tx.foodCategory.createMany({ data: categories.map((category) => ({ foodId: id, category })) });
      return true;
    });

    return updated ? findById(id) : null;
  }

  return { findMany, findById, findByName, create, updateByAuthor };
}

module.exports = createFoodRepository({ prisma });
module.exports.createFoodRepository = createFoodRepository;
