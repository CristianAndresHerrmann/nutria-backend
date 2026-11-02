const { randomUUID } = require('node:crypto');
const { OptionItemType } = require('@prisma/client');
const planRepository = require('../repositories/plan.repository');
const patientRepository = require('../repositories/patient.repository');
const planValidationService = require('./planValidation.service');
const AppError = require('../utils/AppError');
const { PATIENT_NOT_FOUND_MESSAGE } = require('./patient.service');
const { PLAN_NOT_FOUND_MESSAGE } = require('./planValidation.service');
const { categoriesOf } = require('../domain/reglas/catalogIndex');
const { MEAL_LABELS } = require('../domain/reglas/validatePlan');

const FOOD_NOT_FOUND_MESSAGE = 'el alimento no existe';
const FOOD_INACTIVE_MESSAGE = 'el alimento está dado de baja';
const GROUP_NOT_FOUND_MESSAGE = 'el grupo de alimentos no existe';
const RECIPE_NOT_FOUND_MESSAGE = 'la receta no existe';
const RECIPE_UNAVAILABLE_MESSAGE = 'la receta está dada de baja';

// Como los ingredientes de una receta: el error va en el campo de la lista
// (meals), con la ubicación del ítem en el mensaje.
function itemError(mealType, optionIndex, itemIndex, reason) {
  const message = `Opción ${optionIndex + 1} ${MEAL_LABELS[mealType]}, ítem ${itemIndex + 1}: ${reason}`;
  return new AppError(400, message, { code: 'VALIDATION_ERROR', details: { fields: { meals: message } } });
}

// Lo que el plan ya referenciaba antes de editarlo: un alimento o una receta
// dados de baja se pueden conservar, pero no agregar (como en las recetas).
function previousReferences(plan) {
  const items = plan.meals.flatMap((meal) => meal.options.flatMap((option) => option.items));
  return {
    foodIds: new Set(items.map(({ foodId }) => foodId).filter(Boolean)),
    recipeIds: new Set(items.map(({ recipeId }) => recipeId).filter(Boolean)),
  };
}

// Planes alimentarios de un paciente (RF-34, RF-40, RF-46). Un plan ajeno o de
// otro paciente da el mismo 404 que uno inexistente (RNF-05).
function createPlanService({ planRepository: plans, patientRepository: patients, planValidationService: validation }) {
  // El ítem como se guarda: la referencia que manda el cliente más la copia del
  // catálogo (DA-16), que arma el backend. El catálogo es el de entrada del motor:
  // lo que ve el nutricionista, incluidas las bajas.
  function resolveEditedItem(item, catalog, previous, fail) {
    switch (item.type) {
      case OptionItemType.food: {
        const food = catalog.foodsById.get(item.foodId);
        if (!food) throw fail(FOOD_NOT_FOUND_MESSAGE);
        if (!food.active && !previous.foodIds.has(food.id)) throw fail(FOOD_INACTIVE_MESSAGE);
        return { type: item.type, foodId: food.id, foodName: food.name, foodCategories: categoriesOf(food) };
      }
      case OptionItemType.food_group: {
        const group = catalog.groupsById.get(item.foodGroupId);
        if (!group) throw fail(GROUP_NOT_FOUND_MESSAGE);
        return { type: item.type, foodGroupId: group.id, foodGroupName: group.name };
      }
      case OptionItemType.recipe: {
        const recipe = catalog.recipesById.get(item.recipeId);
        if (!recipe) throw fail(RECIPE_NOT_FOUND_MESSAGE);
        if (!recipe.availableInCatalog && !previous.recipeIds.has(recipe.id)) throw fail(RECIPE_UNAVAILABLE_MESSAGE);
        return { type: item.type, recipeId: recipe.id };
      }
      default:
        return { type: item.type, originalText: item.originalText };
    }
  }

  // Las comidas como se guardan, con ids nuevos: el motor valida el plan en
  // memoria y los hallazgos se escriben junto con el contenido.
  function resolveMeals(meals, { catalog }, previous) {
    const indexed = {
      foodsById: new Map(catalog.foods.map((food) => [food.id, food])),
      groupsById: new Map(catalog.groups.map((group) => [group.id, group])),
      recipesById: new Map(catalog.recipes.map((recipe) => [recipe.id, recipe])),
    };

    return meals.map((meal) => ({
      id: randomUUID(),
      mealType: meal.mealType,
      instructions: meal.instructions,
      options: meal.options.map((option, optionIndex) => ({
        id: randomUUID(),
        order: optionIndex + 1,
        description: option.description,
        items: option.items.map((item, itemIndex) => {
          const fail = (reason) => itemError(meal.mealType, optionIndex, itemIndex, reason);
          return { id: randomUUID(), order: itemIndex + 1, ...resolveEditedItem(item, indexed, previous, fail) };
        }),
      })),
    }));
  }

  async function findOwnPlan(patientId, planId, nutritionistId) {
    const plan = await plans.findByIdForPatient(planId, patientId, nutritionistId);
    if (!plan) throw new AppError(404, PLAN_NOT_FOUND_MESSAGE);
    return plan;
  }

  return {
    async list(patientId, nutritionistId) {
      if (!(await patients.findByIdForNutritionist(patientId, nutritionistId))) {
        throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);
      }
      return plans.findAllForPatient(patientId, nutritionistId);
    },

    // Un borrador se revalida al abrirlo: refleja los cambios en las
    // condiciones del paciente desde el último guardado (RF-46).
    get(patientId, planId, nutritionistId) {
      return validation.revalidate(patientId, planId, nutritionistId);
    },

    // Reemplazo completo del borrador: guarda y revalida en la misma
    // transacción.
    async update(patientId, planId, nutritionistId, { meals, ...fields }) {
      const plan = await findOwnPlan(patientId, planId, nutritionistId);
      const inputs = await validation.loadInputs(patientId, nutritionistId);

      const resolvedMeals = resolveMeals(meals, inputs, previousReferences(plan));
      const findings = validation.computeFindings({ meals: resolvedMeals }, inputs);

      const saved = await plans.replaceDraft(planId, patientId, nutritionistId, {
        fields,
        meals: resolvedMeals,
        findings,
      });
      if (!saved) throw new AppError(404, PLAN_NOT_FOUND_MESSAGE);
      return saved;
    },
  };
}

module.exports = createPlanService({ planRepository, patientRepository, planValidationService });
module.exports.createPlanService = createPlanService;
