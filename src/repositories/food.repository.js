const prisma = require('../lib/prisma');

// Lo que acompaña a un alimento en toda lectura: su grupo (para mostrar la ruta
// en la jerarquía) y sus categorías.
const FOOD_INCLUDE = {
  foodGroup: { select: { id: true, name: true, parentId: true } },
  categories: { select: { category: true }, orderBy: { category: 'asc' } },
};

// El panel del administrador (T25) además muestra el dueño de un privado y quién
// lo cargó.
const ACCOUNT_SELECT = { select: { id: true, name: true } };
const ADMIN_FOOD_INCLUDE = { ...FOOD_INCLUDE, nutritionist: ACCOUNT_SELECT, createdBy: ACCOUNT_SELECT };

function categoryRows(categories) {
  return categories.map((category) => ({ category }));
}

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

  // Solo un alimento común: es el único que puede ir en una receta común (T30),
  // que ven todos los nutricionistas.
  function findCommonById(id) {
    return client.food.findFirst({ where: { id, nutritionistId: null } });
  }

  // Siempre privado: el dueño es obligatorio, y es también quien lo cargó. Los
  // alimentos comunes los carga el seed o el administrador (createCommon).
  function createPrivate(nutritionistId, { categories, ...data }) {
    assertNutritionistId(nutritionistId);
    return client.food.create({
      data: { ...data, nutritionistId, createdById: nutritionistId, categories: { create: categoryRows(categories) } },
      include: FOOD_INCLUDE,
    });
  }

  // --- Panel del administrador (T25). Sin filtro de visibilidad: requireAdmin
  // ya garantizó el rol, y el administrador cura los comunes y los privados.

  // Incluye los dados de baja. owner: 'common' (los comunes) o el id de un
  // nutricionista (sus privados); sin owner, todos.
  function findForAdmin({ owner, search, groupIds } = {}) {
    const where = {};
    if (owner) where.nutritionistId = owner === 'common' ? null : owner;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (groupIds) where.foodGroupId = { in: groupIds };

    return client.food.findMany({ where, include: ADMIN_FOOD_INCLUDE, orderBy: { name: 'asc' } });
  }

  function findById(id) {
    return client.food.findUnique({ where: { id }, include: ADMIN_FOOD_INCLUDE });
  }

  // Los alimentos con ese nombre, sin distinguir mayúsculas, salvo excludeId,
  // dentro de los ámbitos pedidos: siempre los comunes; los privados de ownerId,
  // vigentes o no; y con activePrivates, los privados vigentes de todos. El
  // servicio decide cuáles chocan según el alimento que se escribe.
  function findByName(name, { excludeId, ownerId, activePrivates = false } = {}) {
    const scopes = [{ nutritionistId: null }];
    if (ownerId) scopes.push({ nutritionistId: ownerId });
    if (activePrivates) scopes.push({ nutritionistId: { not: null }, active: true });

    const where = { name: { equals: name, mode: 'insensitive' }, OR: scopes };
    if (excludeId) where.id = { not: excludeId };

    return client.food.findMany({ where, select: { id: true, nutritionistId: true } });
  }

  function createCommon({ categories, ...data }) {
    return client.food.create({
      data: { ...data, nutritionistId: null, createdById: null, categories: { create: categoryRows(categories) } },
      include: ADMIN_FOOD_INCLUDE,
    });
  }

  // Reemplazo completo de las categorías en la misma escritura. Los ítems de los
  // planes no cambian: guardan su propia copia del nombre y las categorías (DA-16).
  function update(id, { categories, ...data }) {
    return client.food.update({
      where: { id },
      data: { ...data, categories: { deleteMany: {}, create: categoryRows(categories) } },
      include: ADMIN_FOOD_INCLUDE,
    });
  }

  // Pasa a común: sin dueño. createdById se conserva para la actividad.
  function promote(id, name) {
    return client.food.update({ where: { id }, data: { nutritionistId: null, name }, include: ADMIN_FOOD_INCLUDE });
  }

  // Qué alimento cargó cada nutricionista y cuándo, del más nuevo al más viejo.
  // Solo datos del catálogo: nada de pacientes ni de planes (RNF-05).
  function findActivity({ nutritionistId } = {}) {
    return client.food.findMany({
      where: { createdById: nutritionistId || { not: null } },
      select: { id: true, name: true, active: true, nutritionistId: true, createdAt: true, createdBy: ACCOUNT_SELECT },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
  }

  return {
    findVisible,
    findAllVisible,
    findVisibleById,
    findVisibleByName,
    findCommonById,
    createPrivate,
    findForAdmin,
    findById,
    findByName,
    createCommon,
    update,
    promote,
    findActivity,
  };
}

module.exports = createFoodRepository({ prisma });
module.exports.createFoodRepository = createFoodRepository;
