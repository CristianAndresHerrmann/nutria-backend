// Catálogo de entrada del motor de reglas, indexado por id. Lo arma el servicio
// con lo que ve el nutricionista del plan:
//   foods:   alimentos comunes y privados suyos, incluidos los dados de baja (un
//            ítem o un ingrediente puede seguir referenciando uno), con la forma
//            de food.repository ({ id, name, foodGroupId, active, categories:
//            [{ category }] })
//   groups:  lista plana de grupos { id, parentId }
//   recipes: sus recetas, con los ingredientes de recipe.repository
//            ({ food: { id, name, foodGroupId } })
//
// Un id que no está en el catálogo es una inconsistencia de datos (la FK existe y
// el servicio controla la visibilidad al guardar): se corta con un error en vez
// de saltear el ítem, que dejaría pasar un bloqueo sin avisar.
function indexCatalog({ foods, groups, recipes }) {
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  return {
    foods,
    groups,
    food(id) {
      const food = foodsById.get(id);
      if (!food) throw new Error(`motor de reglas: el alimento ${id} no está en el catálogo del nutricionista`);
      return food;
    },
    recipe(id) {
      const recipe = recipesById.get(id);
      if (!recipe) throw new Error(`motor de reglas: la receta ${id} no está en el catálogo del nutricionista`);
      return recipe;
    },
  };
}

function categoriesOf(food) {
  return food.categories.map(({ category }) => category);
}

module.exports = { indexCatalog, categoriesOf };
