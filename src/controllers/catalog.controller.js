const foodGroupService = require('../services/foodGroup.service');
const foodService = require('../services/food.service');
const pathologyService = require('../services/pathology.service');
const { serializeFoodGroup, serializeFood, serializePathology } = require('../serializers/catalog.serializer');

// Los tres catálogos comunes tienen la misma forma (listar, obtener, alta,
// edición), así que comparten controlador. La validación la hace el middleware
// validate en la ruta; el nutricionista sale del token (req.nutricionistaId):
// es el autor en el alta, el que tiene que coincidir en la edición y contra el
// que se calcula `editable` en la respuesta.
function createCatalogController(service, serialize) {
  return {
    async list(req, res, next) {
      try {
        const items = await service.list(req.validated.query);
        res.status(200).json(items.map((item) => serialize(item, req.nutricionistaId)));
      } catch (error) {
        next(error);
      }
    },

    async get(req, res, next) {
      try {
        const item = await service.get(req.validated.params.id);
        res.status(200).json(serialize(item, req.nutricionistaId));
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      try {
        const item = await service.create(req.nutricionistaId, req.validated.body);
        res.status(201).json(serialize(item, req.nutricionistaId));
      } catch (error) {
        next(error);
      }
    },

    async update(req, res, next) {
      try {
        const item = await service.update(req.validated.params.id, req.nutricionistaId, req.validated.body);
        res.status(200).json(serialize(item, req.nutricionistaId));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  foodGroupController: createCatalogController(foodGroupService, serializeFoodGroup),
  foodController: createCatalogController(foodService, serializeFood),
  pathologyController: createCatalogController(pathologyService, serializePathology),
};
