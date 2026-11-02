const foodRepository = require('../repositories/food.repository');
const foodGroupRepository = require('../repositories/foodGroup.repository');
const AppError = require('../utils/AppError');
const { descendantIds } = require('../utils/foodGroupTree');
const { FOOD_NOT_FOUND_MESSAGE, DUPLICATE_NAME_MESSAGE, GROUP_NOT_FOUND_MESSAGE } = require('./food.service');

const PRIVATE_NAME_CONFLICT_MESSAGE =
  'Otro nutricionista tiene un alimento privado vigente con ese nombre: renombralo o dalo de baja';
const ALREADY_COMMON_MESSAGE = 'El alimento ya es común';

function nameConflict(message) {
  return new AppError(409, message, { details: { fields: { name: message } } });
}

// Curación del catálogo de alimentos desde el panel del administrador (T25).
// Opera sobre los comunes y sobre los privados de cualquier nutricionista, sin
// tocar pacientes ni planes: un plan guarda su propia copia del nombre y las
// categorías del alimento (DA-16).
//
// El nombre sigue siendo único dentro de lo que ve cada nutricionista (T15):
//   - un privado de N no repite un común ni otro privado de N;
//   - un común no repite otro común ni un privado vigente de nadie, porque ese
//     nutricionista vería dos con el mismo nombre. Un privado dado de baja no
//     cuenta: ya no se ofrece al cargar un plan.
function createFoodAdminService({ foodRepository: repository, foodGroupRepository: groups }) {
  async function get(id) {
    const food = await repository.findById(id);
    if (!food) throw new AppError(404, FOOD_NOT_FOUND_MESSAGE);
    return food;
  }

  // Sin este chequeo, un grupo inexistente llegaría a la base como violación de
  // FK y terminaría en un 500.
  async function assertGroupExists(foodGroupId) {
    if (!(await groups.findById(foodGroupId))) {
      throw new AppError(400, GROUP_NOT_FOUND_MESSAGE, {
        code: 'VALIDATION_ERROR',
        details: { fields: { foodGroupId: GROUP_NOT_FOUND_MESSAGE } },
      });
    }
  }

  // ownerId null: el alimento queda común. formerOwnerId es el dueño de un
  // privado que pasa al común: sus otros privados también chocan, aunque estén
  // dados de baja.
  async function assertNameFree(name, { excludeId, ownerId, formerOwnerId } = {}) {
    const common = ownerId === null;
    const conflicts = await repository.findByName(name, {
      excludeId,
      ownerId: common ? formerOwnerId : ownerId,
      activePrivates: common,
    });
    if (conflicts.length === 0) return;

    const othersOnly = conflicts.every((food) => food.nutritionistId && food.nutritionistId !== formerOwnerId);
    throw nameConflict(common && othersOnly ? PRIVATE_NAME_CONFLICT_MESSAGE : DUPLICATE_NAME_MESSAGE);
  }

  return {
    // Incluye las bajas y los privados de todos. Filtrar por un grupo incluye
    // sus subgrupos; un grupo inexistente es un filtro que no matchea nada.
    async list({ owner = null, search = null, groupId = null } = {}) {
      let groupIds;
      if (groupId) {
        const allGroups = await groups.findAll();
        if (!allGroups.some((group) => group.id === groupId)) return [];
        groupIds = descendantIds(allGroups, groupId);
      }

      return repository.findForAdmin({ owner, search, groupIds });
    },

    get,

    async createCommon(data) {
      await assertGroupExists(data.foodGroupId);
      await assertNameFree(data.name, { ownerId: null });
      return repository.createCommon(data);
    },

    // El nombre solo se controla si cambia o si el alimento se reactiva: corregir
    // las categorías de uno no debería trabarse por un choque que ya existía.
    async update(id, data) {
      const food = await get(id);
      await assertGroupExists(data.foodGroupId);

      const renamed = food.name.toLowerCase() !== data.name.toLowerCase();
      const reactivated = data.active === true && !food.active;
      if (renamed || reactivated) {
        await assertNameFree(data.name, { excludeId: id, ownerId: food.nutritionistId });
      }

      return repository.update(id, data);
    },

    // Un privado pasa al catálogo común con el mismo id: lo que ya lo
    // referenciaba (condiciones, recetas y planes de su dueño) no cambia, y
    // desde ahí lo ven todos. Con name se renombra en la misma operación.
    async promote(id, { name = null } = {}) {
      const food = await get(id);
      if (food.nutritionistId === null) throw new AppError(409, ALREADY_COMMON_MESSAGE);

      const finalName = name || food.name;
      await assertNameFree(finalName, { excludeId: id, ownerId: null, formerOwnerId: food.nutritionistId });
      return repository.promote(id, finalName);
    },

    async activity({ nutritionistId = null } = {}) {
      return repository.findActivity({ nutritionistId });
    },
  };
}

module.exports = createFoodAdminService({ foodRepository, foodGroupRepository });
module.exports.createFoodAdminService = createFoodAdminService;
module.exports.PRIVATE_NAME_CONFLICT_MESSAGE = PRIVATE_NAME_CONFLICT_MESSAGE;
module.exports.ALREADY_COMMON_MESSAGE = ALREADY_COMMON_MESSAGE;
