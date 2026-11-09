const { CookingMethod } = require('@prisma/client');
const { descendantIds } = require('../../utils/foodGroupTree');
const { allIngredientsActive, conditionScopes, ruleScopes, scopeCoversFood } = require('../../utils/recipeConditionFilter');

// Catálogo permitido para la generación del plan (RF-37, RF-38; T37). Función
// pura: recibe el catálogo de entrada del motor de reglas (lo que ve el
// nutricionista, incluidas las bajas; ver catalogIndex.js), las condiciones del
// paciente y las reglas de patología que prohíben y que moderan, y devuelve lo que se le
// ofrece a la IA. Lo que no está acá, la IA no lo puede proponer por código.
//
// El criterio de "comprendido" es el mismo del filtro de recetas (RF-28) y del
// motor (DA-23): conditionScopes, ruleScopes y scopeCoversFood. Una regla
// prohibitiva de una patología del paciente alcanza a su alimento o a su grupo
// con los subgrupos, igual que una condición. Las reglas a moderar no excluyen
// alimentos ni recetas: llegan a la IA y el motor las advierte (T35, DA-36). Sí
// sacan los grupos que contienen lo moderado (DA-43). Ver
// docs/decisiones/traza-de-generaciones-sin-plan.md (DA-31),
// docs/decisiones/restricciones-de-lo-ofrecido-a-la-ia.md (DA-40) y
// docs/decisiones/orientacion-del-plan-generado.md (DA-43) en el repo raíz.

// Topes de la entrada del contrato (Catalog y PlanProposalRequest de nutria-ia).
// Pasarlos haría que el servicio responda 422; el servicio de generación corta
// antes con un error controlado (exceededLimit).
const CONTRACT_LIMITS = { foods: 2000, groups: 500, recipes: 200 };

// - foods: vigentes y no comprendidos en ninguna condición ni regla.
// - groups: los que tienen algún alimento permitido en su subárbol y ninguno
//   alcanzado (DA-40). Un grupo más amplio que una condición o una regla ("Carnes"
//   con rechazo de "Pescados", "Cereales y derivados" en celiaquía) no se ofrece:
//   "un cereal" no le asegura nada al paciente. Cuentan también los alimentos
//   comprendidos dados de baja y los grupos excluidos sin alimentos. Un alimento
//   permitido cuyo grupo no se ofrece viaja sin grupo (buildContext). Lo mismo con
//   una regla a moderar: "Carnes, pescados y huevos" no se ofrece en hipertensión
//   porque incluye los fiambres, y el motor no advierte un ítem de grupo más
//   amplio que la regla (DA-30). El fiambre suelto sí se ofrece, y advierte (DA-43).
// - recipes: disponibles, con todos los ingredientes vigentes, con alguno de los
//   tipos de comida pedidos (mealTypes queda en la intersección), sin
//   ingredientes comprendidos, y, si el paciente no cocina, solo las que no
//   requieren cocción (RF-38). El tiempo y el gusto por cocinar los evalúa el
//   modelo con time_minutes y el contexto de cocina.
function allowedCatalog({ foods, groups, recipes, conditions, prohibitedRules, moderatedRules = [], mealTypes, cooks }) {
  const scopes = [...conditionScopes(conditions, groups), ...ruleScopes(prohibitedRules, groups)];
  const covered = (food) => scopes.some((scope) => scopeCoversFood(scope, food));

  const allowedFoods = foods.filter((food) => food.active && !covered(food));

  // Las reglas a moderar solo cuentan para los grupos.
  const groupScopes = [...scopes, ...ruleScopes(moderatedRules, groups)];
  const reachesGroup = (food) => groupScopes.some((scope) => scopeCoversFood(scope, food));
  const reachedGroupIds = new Set([
    ...groupScopes.flatMap((scope) => [...scope.groupIds]),
    ...foods.filter(reachesGroup).map((food) => food.foodGroupId),
  ]);
  const groupsWithFoods = new Set(allowedFoods.map((food) => food.foodGroupId));
  const allowedGroups = groups.filter((group) => {
    const subtree = descendantIds(groups, group.id);
    return !subtree.some((id) => reachedGroupIds.has(id)) && subtree.some((id) => groupsWithFoods.has(id));
  });

  const requested = new Set(mealTypes);
  const allowedRecipes = recipes
    .filter((recipe) => recipe.availableInCatalog)
    .filter(allIngredientsActive)
    .filter((recipe) => cooks !== false || recipe.cookingMethod === CookingMethod.no_cooking)
    .filter((recipe) => recipe.ingredients.every(({ food }) => !covered(food)))
    .map((recipe) => ({
      ...recipe,
      mealTypes: recipe.mealTypes.map(({ mealType }) => mealType).filter((mealType) => requested.has(mealType)),
    }))
    .filter((recipe) => recipe.mealTypes.length > 0);

  return { foods: allowedFoods, groups: allowedGroups, recipes: allowedRecipes };
}

// El primer tope del contrato que pasa el catálogo permitido, como { kind,
// count, limit }, o null si entra. No lanza: el servicio responde con un error
// controlado en vez de un 500 (DA-40).
function exceededLimit(allowed) {
  for (const [kind, limit] of Object.entries(CONTRACT_LIMITS)) {
    if (allowed[kind].length > limit) return { kind, count: allowed[kind].length, limit };
  }
  return null;
}

module.exports = { allowedCatalog, exceededLimit, CONTRACT_LIMITS };
