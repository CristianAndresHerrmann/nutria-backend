const recommendationRepository = require('../repositories/recommendation.repository');
const pathologyRepository = require('../repositories/pathology.repository');
const AppError = require('../utils/AppError');

const RECOMMENDATION_NOT_FOUND_MESSAGE = 'Recomendación no encontrada';
const COMMON_READ_ONLY_MESSAGE = 'Las recomendaciones comunes son de solo lectura';
const PATHOLOGY_NOT_FOUND_MESSAGE = 'La patología no existe';

// Recomendaciones clínicas por patología (RF-30). Un nutricionista ve las
// comunes y sus privadas; da de alta solo privadas y edita o da de baja solo las
// suyas. Una privada de otro da el mismo 404 que una inexistente. Una común sí
// la ve, así que editarla da 403 y no 404. No hay borrado: la baja es lógica
// (active = false) y se hace con el PUT.
function createRecommendationService({
  recommendationRepository: repository,
  pathologyRepository: pathologies,
}) {
  async function findVisible(id, nutritionistId) {
    const recommendation = await repository.findVisibleById(id, nutritionistId);
    if (!recommendation) throw new AppError(404, RECOMMENDATION_NOT_FOUND_MESSAGE);
    return recommendation;
  }

  // Sin este chequeo, una patología inexistente llegaría a la base como
  // violación de FK y terminaría en un 500.
  async function assertPathology(pathologyId) {
    if (!(await pathologies.findById(pathologyId))) {
      throw new AppError(400, PATHOLOGY_NOT_FOUND_MESSAGE, {
        code: 'VALIDATION_ERROR',
        details: { fields: { pathologyId: PATHOLOGY_NOT_FOUND_MESSAGE } },
      });
    }
  }

  return {
    list(nutritionistId, { pathologyId = null, includeInactive = false } = {}) {
      return repository.findVisible(nutritionistId, { pathologyId, includeInactive });
    },

    get(id, nutritionistId) {
      return findVisible(id, nutritionistId);
    },

    async create(nutritionistId, data) {
      await assertPathology(data.pathologyId);
      return repository.createPrivate(nutritionistId, data);
    },

    // Reemplazo completo. active omitido conserva el valor que tenía.
    async update(id, nutritionistId, { active, ...data }) {
      const previous = await findVisible(id, nutritionistId);
      if (previous.nutritionistId === null) throw new AppError(403, COMMON_READ_ONLY_MESSAGE);
      await assertPathology(data.pathologyId);

      const fields = active === undefined ? data : { ...data, active };
      const updated = await repository.updateOwn(id, nutritionistId, fields);
      if (!updated) throw new AppError(404, RECOMMENDATION_NOT_FOUND_MESSAGE);
      return updated;
    },
  };
}

module.exports = createRecommendationService({ recommendationRepository, pathologyRepository });
module.exports.createRecommendationService = createRecommendationService;
module.exports.RECOMMENDATION_NOT_FOUND_MESSAGE = RECOMMENDATION_NOT_FOUND_MESSAGE;
module.exports.COMMON_READ_ONLY_MESSAGE = COMMON_READ_ONLY_MESSAGE;
