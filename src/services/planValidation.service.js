const planRepository = require('../repositories/plan.repository');
const patientConditionRepository = require('../repositories/patientCondition.repository');
const foodRepository = require('../repositories/food.repository');
const foodGroupRepository = require('../repositories/foodGroup.repository');
const recipeRepository = require('../repositories/recipe.repository');
const AppError = require('../utils/AppError');
const { validatePlan } = require('../domain/reglas/validatePlan');

const PLAN_NOT_FOUND_MESSAGE = 'Plan no encontrado';

// Lo que define a un hallazgo, sin su id ni su fecha.
function findingSignature({ type, severity, optionId, optionItemId, patientConditionId, message }) {
  return JSON.stringify([type, severity, optionId ?? null, optionItemId ?? null, patientConditionId ?? null, message]);
}

// Mismos hallazgos, con repeticiones y sin importar el orden.
function sameFindings(stored, computed) {
  if (stored.length !== computed.length) return false;
  const a = stored.map(findingSignature).sort();
  const b = computed.map(findingSignature).sort();
  return a.every((signature, index) => signature === b[index]);
}

// Validación de un plan con el motor de reglas (RF-43, RF-44, RF-46). El
// nutritionistId viene siempre del token.
//
// - loadInputs arma las entradas del motor con lo que ve el nutricionista: las
//   condiciones del paciente y el catálogo completo, incluidas las bajas (un ítem
//   puede seguir referenciando un alimento o una receta dados de baja).
// - computeFindings corre el motor sobre un plan, guardado o todavía en memoria.
//   La generación (T37) y la edición lo usan para escribir el plan y sus
//   hallazgos en una misma transacción.
// - revalidate recalcula los hallazgos de un plan guardado y los reemplaza si
//   cambiaron. Lo usa
//   la lectura del borrador, para reflejar cambios en las condiciones del
//   paciente (RF-46). Un plan ajeno da el mismo 404 que uno inexistente.
//
// revalidate lee el plan fuera de la transacción que reemplaza los hallazgos:
// una edición simultánea del mismo plan podría dejar los hallazgos del estado
// anterior hasta la próxima lectura. Se acepta porque cada plan lo edita un
// solo profesional.
function createPlanValidationService({
  planRepository: plans,
  patientConditionRepository: patientConditions,
  foodRepository: foods,
  foodGroupRepository: groups,
  recipeRepository: recipes,
}) {
  async function loadInputs(patientId, nutritionistId) {
    const [conditions, allFoods, allGroups, allRecipes] = await Promise.all([
      patientConditions.findAllForPatient(patientId, nutritionistId),
      foods.findAllVisible(nutritionistId),
      groups.findAll(),
      recipes.findVisible(nutritionistId, { includeUnavailable: true }),
    ]);
    return { conditions, catalog: { foods: allFoods, groups: allGroups, recipes: allRecipes } };
  }

  function computeFindings(plan, { conditions, catalog }) {
    return validatePlan({ plan, conditions, catalog });
  }

  return {
    loadInputs,
    computeFindings,

    // Devuelve el plan con los hallazgos recién calculados. Si son los mismos
    // que ya tenía, no se reescriben: abrir un plan sin cambios no escribe en
    // la base y los hallazgos conservan sus ids.
    async revalidate(patientId, planId, nutritionistId) {
      const plan = await plans.findByIdForPatient(planId, patientId, nutritionistId);
      if (!plan) throw new AppError(404, PLAN_NOT_FOUND_MESSAGE);

      const findings = computeFindings(plan, await loadInputs(plan.patientId, nutritionistId));
      if (sameFindings(plan.findings ?? [], findings)) return plan;

      const saved = await plans.replaceFindings(planId, nutritionistId, findings);
      if (!saved) throw new AppError(404, PLAN_NOT_FOUND_MESSAGE);
      return { ...plan, findings: saved };
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
