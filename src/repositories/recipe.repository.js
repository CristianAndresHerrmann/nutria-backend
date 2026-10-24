const prisma = require('../lib/prisma');

// Lo que acompaña a una receta en toda lectura: los ingredientes en su orden,
// con el alimento (el grupo hace falta para el filtro por condiciones, RF-28), y
// los tipos de comida en el orden del enum. Del alimento, con select: el dueño
// de uno privado no viaja.
const RECIPE_INCLUDE = {
  ingredients: {
    select: {
      order: true,
      quantityDescription: true,
      food: { select: { id: true, name: true, active: true, foodGroupId: true } },
    },
    orderBy: { order: 'asc' },
  },
  mealTypes: { select: { mealType: true }, orderBy: { mealType: 'asc' } },
};

// Como en patient.repository: Prisma ignora un filtro undefined, y un where
// { id, nutritionistId: undefined } buscaría recetas de cualquier nutricionista.
// Se corta acá con un 500 en vez de devolver datos de otro.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('recipe.repository: consulta sin nutritionistId');
  }
}

// El orden de cada ingrediente es su posición en la lista.
function ingredientRows(ingredients) {
  return ingredients.map(({ foodId, quantityDescription }, index) => ({
    foodId,
    quantityDescription,
    order: index + 1,
  }));
}

function mealTypeRows(mealTypes) {
  return mealTypes.map((mealType) => ({ mealType }));
}

function createRecipeRepository({ prisma: client }) {
  // Una receta con varios tipos de comida aparece al filtrar por cualquiera de
  // ellos. Sin includeUnavailable, las dadas de baja no se ofrecen.
  function findAllForNutritionist(nutritionistId, { mealType = null, includeUnavailable = false } = {}) {
    assertNutritionistId(nutritionistId);
    const where = { nutritionistId };
    if (!includeUnavailable) where.availableInCatalog = true;
    if (mealType) where.mealTypes = { some: { mealType } };

    return client.recipe.findMany({ where, include: RECIPE_INCLUDE, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  function findByIdForNutritionist(id, nutritionistId, db = client) {
    assertNutritionistId(nutritionistId);
    return db.recipe.findFirst({ where: { id, nutritionistId }, include: RECIPE_INCLUDE });
  }

  // La receta, sus ingredientes y sus tipos se crean juntos: si falla uno, no
  // queda ninguno. El origen (professional) lo pone la base.
  function create(nutritionistId, data, ingredients, mealTypes) {
    assertNutritionistId(nutritionistId);
    return client.recipe.create({
      data: {
        ...data,
        nutritionistId,
        ingredients: { create: ingredientRows(ingredients) },
        mealTypes: { create: mealTypeRows(mealTypes) },
      },
      include: RECIPE_INCLUDE,
    });
  }

  // Reemplazo completo en una transacción. updateMany lleva el aislamiento en el
  // where: una receta de otro nutricionista afecta 0 filas y sus ingredientes no
  // se tocan. Los ingredientes y tipos se borran antes de recrearlos, para no
  // chocar con el único (recipe_id, order).
  function updateForNutritionist(id, nutritionistId, data, ingredients, mealTypes) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const { count } = await tx.recipe.updateMany({ where: { id, nutritionistId }, data });
      if (count === 0) return null;

      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await tx.recipeMealType.deleteMany({ where: { recipeId: id } });
      await tx.recipeIngredient.createMany({
        data: ingredientRows(ingredients).map((row) => ({ ...row, recipeId: id })),
      });
      await tx.recipeMealType.createMany({ data: mealTypeRows(mealTypes).map((row) => ({ ...row, recipeId: id })) });

      return findByIdForNutritionist(id, nutritionistId, tx);
    });
  }

  return { findAllForNutritionist, findByIdForNutritionist, create, updateForNutritionist };
}

module.exports = createRecipeRepository({ prisma });
module.exports.createRecipeRepository = createRecipeRepository;
