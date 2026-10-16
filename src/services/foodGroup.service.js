const foodGroupRepository = require('../repositories/foodGroup.repository');
const AppError = require('../utils/AppError');

const FOOD_GROUP_NOT_FOUND_MESSAGE = 'Grupo de alimentos no encontrado';

// Solo lectura. La regla de jerarquía sin ciclos para cuando haya alta y edición
// (administrador) está en src/utils/foodGroupTree.js.
function createFoodGroupService({ foodGroupRepository: repository }) {
  return {
    async list() {
      return repository.findAll();
    },

    async get(id) {
      const group = await repository.findById(id);
      if (!group) throw new AppError(404, FOOD_GROUP_NOT_FOUND_MESSAGE);
      return group;
    },
  };
}

module.exports = createFoodGroupService({ foodGroupRepository });
module.exports.createFoodGroupService = createFoodGroupService;
module.exports.FOOD_GROUP_NOT_FOUND_MESSAGE = FOOD_GROUP_NOT_FOUND_MESSAGE;
