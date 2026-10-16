const foodGroupService = require('../services/foodGroup.service');
const foodService = require('../services/food.service');
const pathologyService = require('../services/pathology.service');
const { serializeFood, serializeFoods } = require('../serializers/food.serializer');

// La validación la hace el middleware validate en la ruta. El nutricionista sale
// del token (req.nutricionistaId): decide qué alimentos privados ve y es el dueño
// de los que da de alta.

// Grupos y patologías: catálogos comunes de solo lectura, misma forma.
function createReadOnlyController(service) {
  return {
    async list(req, res, next) {
      try {
        res.status(200).json(await service.list());
      } catch (error) {
        next(error);
      }
    },

    async get(req, res, next) {
      try {
        res.status(200).json(await service.get(req.validated.params.id));
      } catch (error) {
        next(error);
      }
    },
  };
}

const foodController = {
  async list(req, res, next) {
    try {
      const foods = await foodService.list(req.nutricionistaId, req.validated.query);
      res.status(200).json(serializeFoods(foods));
    } catch (error) {
      next(error);
    }
  },

  async get(req, res, next) {
    try {
      const food = await foodService.get(req.validated.params.id, req.nutricionistaId);
      res.status(200).json(serializeFood(food));
    } catch (error) {
      next(error);
    }
  },

  async create(req, res, next) {
    try {
      const food = await foodService.create(req.nutricionistaId, req.validated.body);
      res.status(201).json(serializeFood(food));
    } catch (error) {
      next(error);
    }
  },
};

module.exports = {
  foodGroupController: createReadOnlyController(foodGroupService),
  pathologyController: createReadOnlyController(pathologyService),
  foodController,
};
