const pathologyRepository = require('../repositories/pathology.repository');
const AppError = require('../utils/AppError');

const PATHOLOGY_NOT_FOUND_MESSAGE = 'Patología no encontrada';

// Solo lectura: el alta y la edición son del administrador (tarea aparte).
function createPathologyService({ pathologyRepository: repository }) {
  return {
    async list() {
      return repository.findAll();
    },

    async get(id) {
      const pathology = await repository.findById(id);
      if (!pathology) throw new AppError(404, PATHOLOGY_NOT_FOUND_MESSAGE);
      return pathology;
    },
  };
}

module.exports = createPathologyService({ pathologyRepository });
module.exports.createPathologyService = createPathologyService;
module.exports.PATHOLOGY_NOT_FOUND_MESSAGE = PATHOLOGY_NOT_FOUND_MESSAGE;
