const foodGroupService = require('../services/foodGroup.service');
const pathologyService = require('../services/pathology.service');
const foodAdminService = require('../services/foodAdmin.service');
const {
  serializeAdminFood,
  serializeAdminFoods,
  serializeCatalogActivity,
} = require('../serializers/food.serializer');

// Rutas /admin del catálogo (T25): requireAdmin ya garantizó el rol, y la
// validación la hizo el middleware validate. Nada de esto lee pacientes ni planes.

// Grupos y patologías: misma forma, sin serializador (todas sus columnas viajan).
function createCatalogController(service) {
  return {
    async list(req, res, next) {
      try {
        res.status(200).json(await service.list());
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      try {
        res.status(201).json(await service.create(req.validated.body));
      } catch (error) {
        next(error);
      }
    },

    async update(req, res, next) {
      try {
        res.status(200).json(await service.update(req.validated.params.id, req.validated.body));
      } catch (error) {
        next(error);
      }
    },
  };
}

const adminFoodController = {
  async list(req, res, next) {
    try {
      res.status(200).json(serializeAdminFoods(await foodAdminService.list(req.validated.query)));
    } catch (error) {
      next(error);
    }
  },

  async get(req, res, next) {
    try {
      res.status(200).json(serializeAdminFood(await foodAdminService.get(req.validated.params.id)));
    } catch (error) {
      next(error);
    }
  },

  async create(req, res, next) {
    try {
      res.status(201).json(serializeAdminFood(await foodAdminService.createCommon(req.validated.body)));
    } catch (error) {
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const food = await foodAdminService.update(req.validated.params.id, req.validated.body);
      res.status(200).json(serializeAdminFood(food));
    } catch (error) {
      next(error);
    }
  },

  async promote(req, res, next) {
    try {
      const food = await foodAdminService.promote(req.validated.params.id, req.validated.body);
      res.status(200).json(serializeAdminFood(food));
    } catch (error) {
      next(error);
    }
  },

  async activity(req, res, next) {
    try {
      res.status(200).json(serializeCatalogActivity(await foodAdminService.activity(req.validated.query)));
    } catch (error) {
      next(error);
    }
  },
};

module.exports = {
  adminFoodGroupController: createCatalogController(foodGroupService),
  adminPathologyController: createCatalogController(pathologyService),
  adminFoodController,
};
