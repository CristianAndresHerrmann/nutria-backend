const prisma = require('../lib/prisma');

// La patología acompaña a la recomendación en toda lectura: el listado se
// agrupa por ella.
const RECOMMENDATION_INCLUDE = { pathology: { select: { id: true, name: true } } };

// Como en food.repository: Prisma ignora un filtro undefined, y con un
// nutritionistId vacío la consulta devolvería las privadas de todos. Se corta
// acá con un 500 en vez de devolver datos de otro.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('recommendation.repository: consulta sin nutritionistId');
  }
}

// Un nutricionista ve las comunes (nutritionistId null) y sus privadas.
function visibleTo(nutritionistId) {
  assertNutritionistId(nutritionistId);
  return { OR: [{ nutritionistId: null }, { nutritionistId }] };
}

function createRecommendationRepository({ prisma: client }) {
  // Sin includeInactive, las dadas de baja no se ofrecen.
  function findVisible(nutritionistId, { pathologyId = null, includeInactive = false } = {}) {
    const where = visibleTo(nutritionistId);
    if (!includeInactive) where.active = true;
    if (pathologyId) where.pathologyId = pathologyId;

    return client.clinicalRecommendation.findMany({
      where,
      include: RECOMMENDATION_INCLUDE,
      orderBy: [{ pathology: { name: 'asc' } }, { title: 'asc' }, { id: 'asc' }],
    });
  }

  function findVisibleById(id, nutritionistId) {
    return client.clinicalRecommendation.findFirst({
      where: { id, ...visibleTo(nutritionistId) },
      include: RECOMMENDATION_INCLUDE,
    });
  }

  // Siempre privada: el dueño es obligatorio. Las comunes las carga el seed.
  function createPrivate(nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    return client.clinicalRecommendation.create({
      data: { ...data, nutritionistId },
      include: RECOMMENDATION_INCLUDE,
    });
  }

  // updateMany lleva el dueño en el where: una común o una privada de otro
  // afectan 0 filas y devuelve null.
  async function updateOwn(id, nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    const { count } = await client.clinicalRecommendation.updateMany({ where: { id, nutritionistId }, data });
    if (count === 0) return null;
    return client.clinicalRecommendation.findFirst({
      where: { id, nutritionistId },
      include: RECOMMENDATION_INCLUDE,
    });
  }

  return { findVisible, findVisibleById, createPrivate, updateOwn };
}

module.exports = createRecommendationRepository({ prisma });
module.exports.createRecommendationRepository = createRecommendationRepository;
