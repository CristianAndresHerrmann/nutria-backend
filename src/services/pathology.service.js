const pathologyRepository = require('../repositories/pathology.repository');
const AppError = require('../utils/AppError');

const PATHOLOGY_NOT_FOUND_MESSAGE = 'Patología no encontrada';
const DUPLICATE_NAME_MESSAGE = 'Ya existe una patología con ese nombre';

// Los nutricionistas leen; el administrador da de alta y edita (T25; RF-04).
function createPathologyService({ pathologyRepository: repository }) {
  // El nombre no se repite, sin distinguir mayúsculas. El @unique citext de la
  // base respalda el chequeo si dos altas compiten.
  async function assertNameFree(name, excludeId) {
    if (await repository.findByName(name, { excludeId })) {
      throw new AppError(409, DUPLICATE_NAME_MESSAGE, { details: { fields: { name: DUPLICATE_NAME_MESSAGE } } });
    }
  }

  async function get(id) {
    const pathology = await repository.findById(id);
    if (!pathology) throw new AppError(404, PATHOLOGY_NOT_FOUND_MESSAGE);
    return pathology;
  }

  return {
    async list() {
      return repository.findAll();
    },

    get,

    async create(data) {
      await assertNameFree(data.name);
      return repository.create(data);
    },

    async update(id, data) {
      await get(id);
      await assertNameFree(data.name, id);
      return repository.update(id, data);
    },
  };
}

module.exports = createPathologyService({ pathologyRepository });
module.exports.createPathologyService = createPathologyService;
module.exports.PATHOLOGY_NOT_FOUND_MESSAGE = PATHOLOGY_NOT_FOUND_MESSAGE;
