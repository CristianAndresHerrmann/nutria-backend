const { CookingMethod } = require('@prisma/client');
const { descendantIds } = require('../../utils/foodGroupTree');
const { conditionScopes, scopeCoversFood } = require('../../utils/recipeConditionFilter');

// Catálogo permitido para la generación del plan (RF-37, RF-38; T37). Función
// pura: recibe el catálogo de entrada del motor de reglas (lo que ve el
// nutricionista, incluidas las bajas; ver catalogIndex.js), las condiciones del
// paciente y las reglas de patología que prohíben, y devuelve lo que se le
// ofrece a la IA. Lo que no está acá, la IA no lo puede proponer por código.
//
// El criterio de "comprendido" es el mismo del filtro de recetas (RF-28) y del
// motor (DA-23): conditionScopes y scopeCoversFood. Una regla prohibitiva de una
// patología del paciente alcanza a su alimento o a su grupo con los subgrupos,
// igual que una condición. Las reglas a moderar no excluyen: el hallazgo lo
// decide el motor (T35). Ver docs/decisiones/traza-de-generaciones-sin-plan.md
// en el repo raíz (DA-31).

// Topes de la entrada del contrato (Catalog y PlanProposalRequest de nutria-ia).
// Pasarlos haría que el servicio responda 422; se corta antes con un error
// interno que dice qué tope se pasó.
const CONTRACT_LIMITS = { foods: 2000, groups: 500, recipes: 200 };

function ruleScopes(rules, groups) {
  return rules.map((rule) => ({
    foodId: rule.foodId || null,
    groupIds: new Set(rule.foodGroupId ? descendantIds(groups, rule.foodGroupId) : []),
  }));
}

function assertWithinLimits(allowed) {
  for (const [key, limit] of Object.entries(CONTRACT_LIMITS)) {
    if (allowed[key].length > limit) {
      throw new Error(`generación: el catálogo permitido tiene ${allowed[key].length} ${key}, el contrato admite ${limit}`);
    }
  }
}

// - foods: vigentes y no comprendidos en ninguna condición ni regla.
// - groups: los que no están dentro de un grupo excluido y tienen algún alimento
//   permitido en su subárbol. Así el grupo de cada alimento enviado está siempre
//   en la lista, como exige el contrato. Un grupo más amplio que una condición
//   ("Carnes" con rechazo de "Pescados") se ofrece, con el mismo criterio que el
//   motor (DA-30).
// - recipes: disponibles, con alguno de los tipos de comida pedidos (mealTypes
//   queda en la intersección), sin ingredientes comprendidos, y, si el paciente
//   no cocina, solo las que no requieren cocción (RF-38). El tiempo y el gusto
//   por cocinar los evalúa el modelo con time_minutes y el contexto de cocina.
function allowedCatalog({ foods, groups, recipes, conditions, prohibitedRules, mealTypes, cooks }) {
  const scopes = [...conditionScopes(conditions, groups), ...ruleScopes(prohibitedRules, groups)];
  const covered = (food) => scopes.some((scope) => scopeCoversFood(scope, food));
  const excludedGroupIds = new Set(scopes.flatMap((scope) => [...scope.groupIds]));

  const allowedFoods = foods.filter((food) => food.active && !covered(food));

  const groupsWithFoods = new Set(allowedFoods.map((food) => food.foodGroupId));
  const allowedGroups = groups.filter(
    (group) =>
      !excludedGroupIds.has(group.id) && descendantIds(groups, group.id).some((id) => groupsWithFoods.has(id)),
  );

  const requested = new Set(mealTypes);
  const allowedRecipes = recipes
    .filter((recipe) => recipe.availableInCatalog)
    .filter((recipe) => cooks !== false || recipe.cookingMethod === CookingMethod.no_cooking)
    .filter((recipe) => recipe.ingredients.every(({ food }) => !covered(food)))
    .map((recipe) => ({
      ...recipe,
      mealTypes: recipe.mealTypes.map(({ mealType }) => mealType).filter((mealType) => requested.has(mealType)),
    }))
    .filter((recipe) => recipe.mealTypes.length > 0);

  const allowed = { foods: allowedFoods, groups: allowedGroups, recipes: allowedRecipes };
  assertWithinLimits(allowed);
  return allowed;
}

module.exports = { allowedCatalog, CONTRACT_LIMITS };
