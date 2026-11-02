const foodGroupRepository = require('../repositories/foodGroup.repository');
const AppError = require('../utils/AppError');
const { wouldCreateCycle } = require('../utils/foodGroupTree');

const FOOD_GROUP_NOT_FOUND_MESSAGE = 'Grupo de alimentos no encontrado';
const DUPLICATE_NAME_MESSAGE = 'Ya existe un grupo con ese nombre';
const PARENT_NOT_FOUND_MESSAGE = 'El grupo padre no existe';
const CYCLE_MESSAGE = 'Un grupo no puede quedar dentro de sí mismo ni de uno de sus subgrupos';

function parentError(message) {
  return new AppError(400, message, { code: 'VALIDATION_ERROR', details: { fields: { parentId: message } } });
}

// Los nutricionistas leen; el administrador da de alta y edita (T25). Mover un
// grupo cambia qué alimentos alcanzan las condiciones y reglas por grupo de los
// planes, desde la próxima revalidación.
function createFoodGroupService({ foodGroupRepository: repository }) {
  // El nombre no se repite, sin distinguir mayúsculas. El @unique citext de la
  // base respalda el chequeo si dos altas compiten.
  async function assertNameFree(name, excludeId) {
    if (await repository.findByName(name, { excludeId })) {
      throw new AppError(409, DUPLICATE_NAME_MESSAGE, { details: { fields: { name: DUPLICATE_NAME_MESSAGE } } });
    }
  }

  // El padre existe y no es el grupo ni uno de sus subgrupos (RF-24). La regla
  // vive en foodGroupTree: un CHECK no puede expresar un ciclo de más de un nivel.
  async function assertValidParent(groupId, parentId) {
    if (!parentId) return;
    const groups = await repository.findAll();
    if (!groups.some((group) => group.id === parentId)) throw parentError(PARENT_NOT_FOUND_MESSAGE);
    if (groupId && wouldCreateCycle(groups, groupId, parentId)) throw parentError(CYCLE_MESSAGE);
  }

  async function get(id) {
    const group = await repository.findById(id);
    if (!group) throw new AppError(404, FOOD_GROUP_NOT_FOUND_MESSAGE);
    return group;
  }

  return {
    async list() {
      return repository.findAll();
    },

    get,

    async create(data) {
      await assertValidParent(null, data.parentId);
      await assertNameFree(data.name);
      return repository.create(data);
    },

    async update(id, data) {
      await get(id);
      await assertValidParent(id, data.parentId);
      await assertNameFree(data.name, id);
      return repository.update(id, data);
    },
  };
}

module.exports = createFoodGroupService({ foodGroupRepository });
module.exports.createFoodGroupService = createFoodGroupService;
module.exports.FOOD_GROUP_NOT_FOUND_MESSAGE = FOOD_GROUP_NOT_FOUND_MESSAGE;
