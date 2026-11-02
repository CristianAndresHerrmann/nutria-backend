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

// Un nutricionista ve las recetas básicas comunes (nutritionistId null) y las
// suyas (T30), como los alimentos y las recomendaciones.
function visibleTo(nutritionistId) {
  assertNutritionistId(nutritionistId);
  return { OR: [{ nutritionistId: null }, { nutritionistId }] };
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

// Los ingredientes y tipos se borran antes de recrearlos, para no chocar con el
// único (recipe_id, order).
async function replaceChildren(tx, recipeId, ingredients, mealTypes) {
  await tx.recipeIngredient.deleteMany({ where: { recipeId } });
  await tx.recipeMealType.deleteMany({ where: { recipeId } });
  await tx.recipeIngredient.createMany({
    data: ingredientRows(ingredients).map((row) => ({ ...row, recipeId })),
  });
  await tx.recipeMealType.createMany({ data: mealTypeRows(mealTypes).map((row) => ({ ...row, recipeId })) });
}

function createRecipeRepository({ prisma: client }) {
  // Una receta con varios tipos de comida aparece al filtrar por cualquiera de
  // ellos. Sin includeUnavailable, las dadas de baja no se ofrecen.
  function findVisible(nutritionistId, { mealType = null, includeUnavailable = false } = {}) {
    const where = visibleTo(nutritionistId);
    if (!includeUnavailable) where.availableInCatalog = true;
    if (mealType) where.mealTypes = { some: { mealType } };

    return client.recipe.findMany({ where, include: RECIPE_INCLUDE, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  function findVisibleById(id, nutritionistId, db = client) {
    return db.recipe.findFirst({ where: { id, ...visibleTo(nutritionistId) }, include: RECIPE_INCLUDE });
  }

  // Siempre privada: el dueño es obligatorio. La receta, sus ingredientes y sus
  // tipos se crean juntos: si falla uno, no queda ninguno. El origen
  // (professional) lo pone la base.
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

  // Reemplazo completo en una transacción. updateMany lleva el dueño en el
  // where: una común o una receta de otro nutricionista afectan 0 filas y sus
  // ingredientes no se tocan.
  function updateOwn(id, nutritionistId, data, ingredients, mealTypes) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const { count } = await tx.recipe.updateMany({ where: { id, nutritionistId }, data });
      if (count === 0) return null;

      await replaceChildren(tx, id, ingredients, mealTypes);
      return findVisibleById(id, nutritionistId, tx);
    });
  }

  // Solo escribe la disponibilidad; no reemplaza ingredientes ni tipos de comida.
  function setAvailabilityOwn(id, nutritionistId, availableInCatalog) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const { count } = await tx.recipe.updateMany({
        where: { id, nutritionistId },
        data: { availableInCatalog },
      });
      if (count === 0) return null;
      return findVisibleById(id, nutritionistId, tx);
    });
  }

  // Receta básica común (T30): la carga el seed. Sin único en la base (null no
  // choca en un único), se busca por nombre como los alimentos y las
  // recomendaciones comunes. Nunca se borra: un plan puede referenciarla.
  function upsertCommon(data, ingredients, mealTypes) {
    return client.$transaction(async (tx) => {
      const existing = await tx.recipe.findFirst({ where: { name: data.name, nutritionistId: null } });
      if (!existing) {
        return tx.recipe.create({
          data: {
            ...data,
            ingredients: { create: ingredientRows(ingredients) },
            mealTypes: { create: mealTypeRows(mealTypes) },
          },
          include: RECIPE_INCLUDE,
        });
      }

      await tx.recipe.update({ where: { id: existing.id }, data });
      await replaceChildren(tx, existing.id, ingredients, mealTypes);
      return tx.recipe.findFirst({ where: { id: existing.id }, include: RECIPE_INCLUDE });
    });
  }

  return { findVisible, findVisibleById, create, updateOwn, setAvailabilityOwn, upsertCommon };
}

module.exports = createRecipeRepository({ prisma });
module.exports.createRecipeRepository = createRecipeRepository;
