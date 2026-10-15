const foodRepository = require('../repositories/food.repository');
const foodGroupRepository = require('../repositories/foodGroup.repository');
const AppError = require('../utils/AppError');
const { descendantIds } = require('../utils/foodGroupTree');
const { assertAuthor, assertNameAvailable, invalidField, NOT_AUTHOR_MESSAGE } = require('./catalogRules');

const FOOD_NOT_FOUND_MESSAGE = 'Alimento no encontrado';
const DUPLICATE_NAME_MESSAGE = 'Ya existe un alimento con ese nombre';
const GROUP_NOT_FOUND_MESSAGE = 'El grupo de alimentos no existe';

// No hay método de borrado: un alimento se da de baja con active = false (baja
// lógica), porque lo referencian condiciones de pacientes e ingredientes.
function createFoodService({ foodRepository: repository, foodGroupRepository: groups }) {
  async function getOrFail(id) {
    const food = await repository.findById(id);
    if (!food) throw new AppError(404, FOOD_NOT_FOUND_MESSAGE);
    return food;
  }

  // Sin este chequeo, un grupo inexistente llegaría a la base como violación de
  // FK y terminaría en un 500.
  async function assertGroupExists(foodGroupId) {
    if (!(await groups.findById(foodGroupId))) {
      throw invalidField('foodGroupId', GROUP_NOT_FOUND_MESSAGE);
    }
  }

  return {
    // Filtrar por un grupo incluye sus subgrupos. Un grupo inexistente es un
    // filtro que no matchea nada, no un error.
    async list({ search = null, groupId = null, includeInactive = false } = {}) {
      let groupIds;
      if (groupId) {
        const allGroups = await groups.findAll();
        if (!allGroups.some((group) => group.id === groupId)) return [];
        groupIds = descendantIds(allGroups, groupId);
      }

      return repository.findMany({ search, groupIds, includeInactive });
    },

    async get(id) {
      return getOrFail(id);
    },

    async create(nutritionistId, data) {
      await assertGroupExists(data.foodGroupId);
      await assertNameAvailable(repository, data.name, { message: DUPLICATE_NAME_MESSAGE });
      return repository.create({ ...data, createdById: nutritionistId });
    },

    async update(id, nutritionistId, data) {
      const existing = await getOrFail(id);
      assertAuthor(existing, nutritionistId);

      await assertGroupExists(data.foodGroupId);
      await assertNameAvailable(repository, data.name, { excludeId: id, message: DUPLICATE_NAME_MESSAGE });

      const updated = await repository.updateByAuthor(id, nutritionistId, data);
      if (!updated) throw new AppError(403, NOT_AUTHOR_MESSAGE);
      return updated;
    },
  };
}

module.exports = createFoodService({ foodRepository, foodGroupRepository });
module.exports.createFoodService = createFoodService;
module.exports.FOOD_NOT_FOUND_MESSAGE = FOOD_NOT_FOUND_MESSAGE;
