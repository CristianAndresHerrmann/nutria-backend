const pathologyRepository = require('../repositories/pathology.repository');
const AppError = require('../utils/AppError');
const { assertAuthor, assertNameAvailable, NOT_AUTHOR_MESSAGE } = require('./catalogRules');

const PATHOLOGY_NOT_FOUND_MESSAGE = 'Patología no encontrada';
const DUPLICATE_NAME_MESSAGE = 'Ya existe una patología con ese nombre';

function createPathologyService({ pathologyRepository: repository }) {
  async function getOrFail(id) {
    const pathology = await repository.findById(id);
    if (!pathology) throw new AppError(404, PATHOLOGY_NOT_FOUND_MESSAGE);
    return pathology;
  }

  return {
    async list() {
      return repository.findAll();
    },

    async get(id) {
      return getOrFail(id);
    },

    async create(nutritionistId, data) {
      await assertNameAvailable(repository, data.name, { message: DUPLICATE_NAME_MESSAGE });
      return repository.create({ ...data, createdById: nutritionistId });
    },

    async update(id, nutritionistId, data) {
      const existing = await getOrFail(id);
      assertAuthor(existing, nutritionistId);

      await assertNameAvailable(repository, data.name, { excludeId: id, message: DUPLICATE_NAME_MESSAGE });

      const updated = await repository.updateByAuthor(id, nutritionistId, data);
      if (!updated) throw new AppError(403, NOT_AUTHOR_MESSAGE);
      return updated;
    },
  };
}

module.exports = createPathologyService({ pathologyRepository });
module.exports.createPathologyService = createPathologyService;
module.exports.PATHOLOGY_NOT_FOUND_MESSAGE = PATHOLOGY_NOT_FOUND_MESSAGE;
