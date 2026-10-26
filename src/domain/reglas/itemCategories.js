const { OptionItemType } = require('@prisma/client');
const { descendantIds } = require('../../utils/foodGroupTree');
const { categoriesOf } = require('./catalogIndex');

// Categorías nutricionales (RF-25) que un ítem aporta a la composición de su
// opción (RF-44). Fundamento: docs/decisiones/motor-de-reglas-v1.md en el repo
// raíz (DA-30).
//   food:         la copia foodCategories del ítem (DA-16), no el catálogo actual
//   recipe:       las de todos sus ingredientes (la receta los trae a todos)
//   food_group:   las que comparten todos los alimentos vigentes del grupo y sus
//                 subgrupos: lo que "un lácteo" garantiza, sea cual sea el elegido
//   unrecognized: ninguna, porque no se puede validar (DA-26)
function itemCategories(item, catalog) {
  switch (item.type) {
    case OptionItemType.food:
      return item.foodCategories;
    case OptionItemType.recipe:
      return recipeCategories(catalog.recipe(item.recipeId), catalog);
    case OptionItemType.food_group:
      return groupCategories(item.foodGroupId, catalog);
    default:
      return [];
  }
}

function recipeCategories(recipe, catalog) {
  const categories = new Set();
  for (const { food } of recipe.ingredients) {
    for (const category of categoriesOf(catalog.food(food.id))) categories.add(category);
  }
  return [...categories];
}

function groupCategories(foodGroupId, catalog) {
  const groupIds = new Set(descendantIds(catalog.groups, foodGroupId));
  const foods = catalog.foods.filter((food) => food.active && groupIds.has(food.foodGroupId));
  if (foods.length === 0) return [];

  const [first, ...rest] = foods.map(categoriesOf);
  return first.filter((category) => rest.every((categories) => categories.includes(category)));
}

module.exports = { itemCategories };
