const planRepository = require('../repositories/plan.repository');
const patientConditionRepository = require('../repositories/patientCondition.repository');
const foodRepository = require('../repositories/food.repository');
const foodGroupRepository = require('../repositories/foodGroup.repository');
const recipeRepository = require('../repositories/recipe.repository');
const AppError = require('../utils/AppError');
const { validatePlan } = require('../domain/reglas/validatePlan');

const PLAN_NOT_FOUND_MESSAGE = 'Plan no encontrado';

// Revalidación de un plan con el motor de reglas (RF-43, RF-44, RF-46). La llaman
// la generación y el editor después de cada guardado: arma las entradas del
// motor con lo que ve el nutricionista del plan, y reemplaza los hallazgos. Un
// plan ajeno da el mismo 404 que uno inexistente. El nutritionistId viene
// siempre del token.
//
// Lee el plan fuera de la transacción que reemplaza los hallazgos: dos
// guardados simultáneos del mismo plan podrían dejar los hallazgos del estado
// anterior hasta el próximo guardado. Se acepta porque cada plan lo edita un
// solo profesional.
function createPlanValidationService({
  planRepository: plans,
  patientConditionRepository: patientConditions,
  foodRepository: foods,
  foodGroupRepository: groups,
  recipeRepository: recipes,
}) {
  return {
    async revalidate(planId, nutritionistId) {
      const plan = await plans.findByIdForNutritionist(planId, nutritionistId);
      if (!plan) throw new AppError(404, PLAN_NOT_FOUND_MESSAGE);

      const [conditions, allFoods, allGroups, allRecipes] = await Promise.all([
        patientConditions.findAllForPatient(plan.patientId, nutritionistId),
        foods.findAllVisible(nutritionistId),
        groups.findAll(),
        recipes.findAllForNutritionist(nutritionistId, { includeUnavailable: true }),
      ]);

      const findings = validatePlan({ plan, conditions, catalog: { foods: allFoods, groups: allGroups, recipes: allRecipes } });
      const saved = await plans.replaceFindings(planId, nutritionistId, findings);
      if (!saved) throw new AppError(404, PLAN_NOT_FOUND_MESSAGE);
      return saved;
    },
  };
}

module.exports = createPlanValidationService({
  planRepository,
  patientConditionRepository,
  foodRepository,
  foodGroupRepository,
  recipeRepository,
});
module.exports.createPlanValidationService = createPlanValidationService;
module.exports.PLAN_NOT_FOUND_MESSAGE = PLAN_NOT_FOUND_MESSAGE;
