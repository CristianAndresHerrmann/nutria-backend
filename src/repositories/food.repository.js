const prisma = require('../lib/prisma');

// Lo que acompaña a un alimento en toda lectura: su grupo (para mostrar la ruta
// en la jerarquía) y sus categorías.
const FOOD_INCLUDE = {
  foodGroup: { select: { id: true, name: true, parentId: true } },
  categories: { select: { category: true }, orderBy: { category: 'asc' } },
};

// Un nutricionista ve los alimentos comunes (nutritionistId null) y los suyos
// privados. Prisma ignora los filtros con valor undefined: con un nutritionistId
// vacío, `{ nutritionistId }` no filtraría nada y la consulta devolvería los
// privados de todos. Se corta acá, como en patient.repository.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('food.repository: consulta sin nutritionistId');
  }
}

function visibleTo(nutritionistId) {
  assertNutritionistId(nutritionistId);
  return { OR: [{ nutritionistId: null }, { nutritionistId }] };
}

function createFoodRepository({ prisma: client }) {
  // Solo vigentes: un alimento dado de baja no se ofrece. groupIds ya viene
  // expandido con los subgrupos (lo resuelve el servicio).
  function findVisible(nutritionistId, { search, groupIds } = {}) {
    const where = { ...visibleTo(nutritionistId), active: true };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (groupIds) where.foodGroupId = { in: groupIds };

    return client.food.findMany({ where, include: FOOD_INCLUDE, orderBy: { name: 'asc' } });
  }

  // Todo lo que ve el nutricionista, incluidos los dados de baja: es el catálogo
  // de entrada del motor de reglas, y un ítem del plan o un ingrediente puede
  // seguir referenciando un alimento que se dio de baja después.
  function findAllVisible(nutritionistId) {
    return client.food.findMany({ where: visibleTo(nutritionistId), include: FOOD_INCLUDE, orderBy: { name: 'asc' } });
  }

  function findVisibleById(id, nutritionistId) {
    return client.food.findFirst({ where: { id, ...visibleTo(nutritionistId) }, include: FOOD_INCLUDE });
  }

  // Un alimento visible para el nutricionista con ese nombre, sin distinguir
  // mayúsculas: un común o uno propio. Los privados de otros no cuentan.
  function findVisibleByName(name, nutritionistId) {
    return client.food.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...visibleTo(nutritionistId) },
    });
  }

  // Siempre privado: el dueño es obligatorio. Los alimentos comunes los carga el
  // seed (y, más adelante, el administrador).
  function createPrivate(nutritionistId, { categories, ...data }) {
    assertNutritionistId(nutritionistId);
    return client.food.create({
      data: { ...data, nutritionistId, categories: { create: categories.map((category) => ({ category })) } },
      include: FOOD_INCLUDE,
    });
  }

  return { findVisible, findAllVisible, findVisibleById, findVisibleByName, createPrivate };
}

module.exports = createFoodRepository({ prisma });
module.exports.createFoodRepository = createFoodRepository;
