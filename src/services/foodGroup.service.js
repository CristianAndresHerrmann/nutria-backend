const foodGroupRepository = require('../repositories/foodGroup.repository');
const AppError = require('../utils/AppError');
const { wouldCreateCycle } = require('../utils/foodGroupTree');
const { assertAuthor, assertNameAvailable, invalidField, NOT_AUTHOR_MESSAGE } = require('./catalogRules');

const FOOD_GROUP_NOT_FOUND_MESSAGE = 'Grupo de alimentos no encontrado';
const DUPLICATE_NAME_MESSAGE = 'Ya existe un grupo con ese nombre';
const PARENT_NOT_FOUND_MESSAGE = 'El grupo padre no existe';
const CYCLE_MESSAGE = 'Un grupo no puede quedar dentro de sí mismo ni de uno de sus subgrupos';

function createFoodGroupService({ foodGroupRepository: repository }) {
  async function getOrFail(id) {
    const group = await repository.findById(id);
    if (!group) throw new AppError(404, FOOD_GROUP_NOT_FOUND_MESSAGE);
    return group;
  }

  return {
    async list() {
      return repository.findAll();
    },

    async get(id) {
      return getOrFail(id);
    },

    // Un subgrupo se puede crear dentro de un grupo ajeno o del seed: el padre no
    // se modifica. Un grupo nuevo no tiene hijos, así que no puede cerrar un ciclo.
    async create(nutritionistId, data) {
      await assertNameAvailable(repository, data.name, { message: DUPLICATE_NAME_MESSAGE });

      if (data.parentId && !(await repository.findById(data.parentId))) {
        throw invalidField('parentId', PARENT_NOT_FOUND_MESSAGE);
      }

      return repository.create({ ...data, createdById: nutritionistId });
    },

    // Primero existencia y autoría: a quien no puede editar el grupo no se le
    // responde nada sobre la validez de lo que mandó.
    async update(id, nutritionistId, data) {
      const existing = await getOrFail(id);
      assertAuthor(existing, nutritionistId);

      await assertNameAvailable(repository, data.name, { excludeId: id, message: DUPLICATE_NAME_MESSAGE });

      if (data.parentId) {
        const groups = await repository.findAll();
        if (!groups.some((group) => group.id === data.parentId)) {
          throw invalidField('parentId', PARENT_NOT_FOUND_MESSAGE);
        }
        if (wouldCreateCycle(groups, id, data.parentId)) {
          throw invalidField('parentId', CYCLE_MESSAGE);
        }
      }

      const updated = await repository.updateByAuthor(id, nutritionistId, data);
      // Solo si cambió el autor entre la lectura y la escritura.
      if (!updated) throw new AppError(403, NOT_AUTHOR_MESSAGE);
      return updated;
    },
  };
}

module.exports = createFoodGroupService({ foodGroupRepository });
module.exports.createFoodGroupService = createFoodGroupService;
module.exports.FOOD_GROUP_NOT_FOUND_MESSAGE = FOOD_GROUP_NOT_FOUND_MESSAGE;
