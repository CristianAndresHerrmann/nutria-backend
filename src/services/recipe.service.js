const recipeRepository = require('../repositories/recipe.repository');
const foodRepository = require('../repositories/food.repository');
const foodGroupRepository = require('../repositories/foodGroup.repository');
const patientRepository = require('../repositories/patient.repository');
const patientConditionRepository = require('../repositories/patientCondition.repository');
const AppError = require('../utils/AppError');
const { excludeRecipesForConditions } = require('../utils/recipeConditionFilter');
const { PATIENT_NOT_FOUND_MESSAGE } = require('./patient.service');

const RECIPE_NOT_FOUND_MESSAGE = 'Receta no encontrada';
const FOOD_NOT_FOUND_MESSAGE = 'El alimento no existe';
const FOOD_INACTIVE_MESSAGE = 'El alimento está dado de baja';
const COMMON_READ_ONLY_MESSAGE = 'Las recetas comunes son de solo lectura';
const COMMON_INGREDIENT_MESSAGE = 'Una receta común solo lleva alimentos comunes';

function ingredientsError(message) {
  return new AppError(400, message, { code: 'VALIDATION_ERROR', details: { fields: { ingredients: message } } });
}

// Recetas (RF-27, RNF-05). Un nutricionista ve las básicas comunes y las suyas;
// da de alta solo privadas y edita o da de baja solo las suyas (T30, mismo
// criterio que las recomendaciones). Una privada de otro da el mismo 404 que
// una inexistente; una común sí la ve, así que editarla da 403. No hay borrado:
// la baja es lógica (availableInCatalog = false), por PATCH o al editar con PUT. El
// origen es siempre professional en este incremento; ai_generated llega con
// RF-39.
function createRecipeService({
  recipeRepository: repository,
  foodRepository: foods,
  foodGroupRepository: groups,
  patientRepository: patients,
  patientConditionRepository: patientConditions,
}) {
  async function findVisible(id, nutritionistId) {
    const recipe = await repository.findVisibleById(id, nutritionistId);
    if (!recipe) throw new AppError(404, RECIPE_NOT_FOUND_MESSAGE);
    return recipe;
  }

  // Sin este chequeo, un id inexistente llegaría a la base como violación de FK
  // y terminaría en un 500. Un alimento privado de otro nutricionista cuenta
  // como inexistente: no lo ve. Uno dado de baja no se puede agregar, pero una
  // receta que ya lo tenía se puede seguir editando.
  async function assertIngredientFoods(ingredients, nutritionistId, previous = null) {
    const previousFoodIds = new Set((previous?.ingredients || []).map(({ food }) => food.id));

    for (const { foodId } of ingredients) {
      const food = await foods.findVisibleById(foodId, nutritionistId);
      if (!food) throw ingredientsError(FOOD_NOT_FOUND_MESSAGE);
      if (!food.active && !previousFoodIds.has(foodId)) throw ingredientsError(FOOD_INACTIVE_MESSAGE);
    }
  }

  // Una receta común la ven todos: un alimento privado en ella se filtraría a
  // los demás nutricionistas. Uno privado cuenta como inexistente.
  async function assertCommonIngredientFoods(ingredients) {
    for (const { foodId } of ingredients) {
      const food = await foods.findCommonById(foodId);
      if (!food) throw ingredientsError(COMMON_INGREDIENT_MESSAGE);
      if (!food.active) throw ingredientsError(FOOD_INACTIVE_MESSAGE);
    }
  }

  return {
    // Con patientId, deja afuera las recetas con algún ingrediente comprendido
    // en una alergia, intolerancia o rechazo del paciente (RF-28). Un paciente
    // de otro nutricionista da 404, igual que uno inexistente.
    async list(nutritionistId, { mealType = null, includeUnavailable = false, patientId = null } = {}) {
      if (!patientId) return repository.findVisible(nutritionistId, { mealType, includeUnavailable });

      if (!(await patients.findByIdForNutritionist(patientId, nutritionistId))) {
        throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
      }
      const [recipes, conditions, allGroups] = await Promise.all([
        repository.findVisible(nutritionistId, { mealType, includeUnavailable }),
        patientConditions.findAllForPatient(patientId, nutritionistId),
        groups.findAll(),
      ]);
      return excludeRecipesForConditions(recipes, conditions, allGroups);
    },

    get(id, nutritionistId) {
      return findVisible(id, nutritionistId);
    },

    async create(nutritionistId, { ingredients, mealTypes, ...data }) {
      await assertIngredientFoods(ingredients, nutritionistId);
      return repository.create(nutritionistId, data, ingredients, mealTypes);
    },

    // Reemplazo completo: los campos opcionales omitidos quedan en null, y los
    // ingredientes y tipos de comida se reemplazan por los que llegan.
    // availableInCatalog omitido conserva el valor que tenía.
    async update(id, nutritionistId, { ingredients, mealTypes, availableInCatalog, ...data }) {
      const previous = await findVisible(id, nutritionistId);
      if (previous.nutritionistId === null) throw new AppError(403, COMMON_READ_ONLY_MESSAGE);
      await assertIngredientFoods(ingredients, nutritionistId, previous);

      const fields = availableInCatalog === undefined ? data : { ...data, availableInCatalog };
      const updated = await repository.updateOwn(id, nutritionistId, fields, ingredients, mealTypes);
      if (!updated) throw new AppError(404, RECIPE_NOT_FOUND_MESSAGE);
      return updated;
    },

    async setAvailability(id, nutritionistId, { availableInCatalog }) {
      const previous = await findVisible(id, nutritionistId);
      if (previous.nutritionistId === null) throw new AppError(403, COMMON_READ_ONLY_MESSAGE);

      const updated = await repository.setAvailabilityOwn(id, nutritionistId, availableInCatalog);
      if (!updated) throw new AppError(404, RECIPE_NOT_FOUND_MESSAGE);
      return updated;
    },

    // Alta o puesta al día de una receta básica común, por nombre (T30). Sin
    // ruta: la usa el seed, y el administrador la tendrá con T25.
    async upsertCommon({ ingredients, mealTypes, ...data }) {
      await assertCommonIngredientFoods(ingredients);
      return repository.upsertCommon(data, ingredients, mealTypes);
    },
  };
}

module.exports = createRecipeService({
  recipeRepository,
  foodRepository,
  foodGroupRepository,
  patientRepository,
  patientConditionRepository,
});
module.exports.createRecipeService = createRecipeService;
module.exports.RECIPE_NOT_FOUND_MESSAGE = RECIPE_NOT_FOUND_MESSAGE;
module.exports.COMMON_READ_ONLY_MESSAGE = COMMON_READ_ONLY_MESSAGE;
