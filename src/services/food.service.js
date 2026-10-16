const foodRepository = require('../repositories/food.repository');
const foodGroupRepository = require('../repositories/foodGroup.repository');
const AppError = require('../utils/AppError');
const { descendantIds } = require('../utils/foodGroupTree');

const FOOD_NOT_FOUND_MESSAGE = 'Alimento no encontrado';
const DUPLICATE_NAME_MESSAGE = 'Ya existe un alimento con ese nombre';
const GROUP_NOT_FOUND_MESSAGE = 'El grupo de alimentos no existe';

// Un nutricionista ve los alimentos comunes y los suyos privados; el alta crea
// siempre uno privado. No edita ni da de baja: si un alimento quedó mal cargado,
// lo corrige el administrador (tarea aparte). No hay borrado físico: lo impiden
// las FK de condiciones e ingredientes, y la baja es lógica (active = false).
function createFoodService({ foodRepository: repository, foodGroupRepository: groups }) {
  return {
    // Filtrar por un grupo incluye sus subgrupos. Un grupo inexistente es un
    // filtro que no matchea nada, no un error.
    async list(nutritionistId, { search = null, groupId = null } = {}) {
      let groupIds;
      if (groupId) {
        const allGroups = await groups.findAll();
        if (!allGroups.some((group) => group.id === groupId)) return [];
        groupIds = descendantIds(allGroups, groupId);
      }

      return repository.findVisible(nutritionistId, { search, groupIds });
    },

    // Un privado de otro nutricionista da el mismo 404 que uno inexistente.
    async get(id, nutritionistId) {
      const food = await repository.findVisibleById(id, nutritionistId);
      if (!food) throw new AppError(404, FOOD_NOT_FOUND_MESSAGE);
      return food;
    },

    async create(nutritionistId, data) {
      // Sin este chequeo, un grupo inexistente llegaría a la base como violación
      // de FK y terminaría en un 500.
      if (!(await groups.findById(data.foodGroupId))) {
        throw new AppError(400, GROUP_NOT_FOUND_MESSAGE, {
          code: 'VALIDATION_ERROR',
          details: { fields: { foodGroupId: GROUP_NOT_FOUND_MESSAGE } },
        });
      }

      // El nombre no puede repetir uno común ni uno propio, sin distinguir
      // mayúsculas. Los privados de otros nutricionistas no cuentan: no los ve.
      if (await repository.findVisibleByName(data.name, nutritionistId)) {
        throw new AppError(409, DUPLICATE_NAME_MESSAGE, { details: { fields: { name: DUPLICATE_NAME_MESSAGE } } });
      }

      return repository.createPrivate(nutritionistId, data);
    },
  };
}

module.exports = createFoodService({ foodRepository, foodGroupRepository });
module.exports.createFoodService = createFoodService;
module.exports.FOOD_NOT_FOUND_MESSAGE = FOOD_NOT_FOUND_MESSAGE;
