const { createRecipeRepository } = require('./recipe.repository');

// Los tests del servicio usan un repositorio fake que ya aplica el aislamiento.
// Estos verifican la otra mitad: que la consulta real a Prisma lleve el
// nutricionista en el where, y que se corte si llega sin él (Prisma ignoraría el
// filtro y devolvería recetas de todos).
function createFakePrisma({ updatedCount = 1, existingCommon } = {}) {
  const prisma = {
    recipe: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'r-1' })),
      create: vi.fn(async ({ data }) => ({ id: 'r-1', ...data })),
      update: vi.fn(async () => ({ id: 'r-1' })),
      updateMany: vi.fn(async () => ({ count: updatedCount })),
    },
    recipeIngredient: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    recipeMealType: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
  };
  if (existingCommon !== undefined) prisma.recipe.findFirst.mockResolvedValueOnce(existingCommon);
  prisma.$transaction = vi.fn(async (callback) => callback(prisma));
  return prisma;
}

// Lo que ve nutri-1: las comunes (dueño null) y las suyas.
const visible = { OR: [{ nutritionistId: null }, { nutritionistId: 'nutri-1' }] };

const ingredients = [
  { foodId: 'arroz', quantityDescription: '1 taza' },
  { foodId: 'atun', quantityDescription: null },
];

describe('recipe.repository — aislamiento por nutricionista', () => {
  it('el listado trae las comunes y las del nutricionista y, por defecto, solo las disponibles', async () => {
    const prisma = createFakePrisma();
    const repository = createRecipeRepository({ prisma });

    await repository.findVisible('nutri-1');
    await repository.findVisible('nutri-1', { mealType: 'lunch', includeUnavailable: true });

    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { ...visible, availableInCatalog: true } }),
    );
    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { ...visible, mealTypes: { some: { mealType: 'lunch' } } } }),
    );
  });

  it('la búsqueda por id ve una común o una del nutricionista', async () => {
    const prisma = createFakePrisma();
    const repository = createRecipeRepository({ prisma });

    await repository.findVisibleById('r-1', 'nutri-1');

    expect(prisma.recipe.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r-1', ...visible } }),
    );
  });

  it('el alta guarda al nutricionista como dueño y numera los ingredientes por su posición', async () => {
    const prisma = createFakePrisma();
    const repository = createRecipeRepository({ prisma });

    await repository.create('nutri-1', { name: 'Ensalada' }, ingredients, ['lunch', 'dinner']);

    expect(prisma.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Ensalada',
          nutritionistId: 'nutri-1',
          ingredients: {
            create: [
              { foodId: 'arroz', quantityDescription: '1 taza', order: 1 },
              { foodId: 'atun', quantityDescription: null, order: 2 },
            ],
          },
          mealTypes: { create: [{ mealType: 'lunch' }, { mealType: 'dinner' }] },
        },
      }),
    );
  });

  it('la edición filtra por el nutricionista y reemplaza ingredientes y tipos', async () => {
    const prisma = createFakePrisma();
    const repository = createRecipeRepository({ prisma });

    await repository.updateOwn('r-1', 'nutri-1', { name: 'Ensalada' }, ingredients, ['lunch']);

    expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-1', nutritionistId: 'nutri-1' },
      data: { name: 'Ensalada' },
    });
    expect(prisma.recipeIngredient.deleteMany).toHaveBeenCalledWith({ where: { recipeId: 'r-1' } });
    expect(prisma.recipeIngredient.createMany).toHaveBeenCalledWith({
      data: [
        { foodId: 'arroz', quantityDescription: '1 taza', order: 1, recipeId: 'r-1' },
        { foodId: 'atun', quantityDescription: null, order: 2, recipeId: 'r-1' },
      ],
    });
    expect(prisma.recipeMealType.createMany).toHaveBeenCalledWith({ data: [{ mealType: 'lunch', recipeId: 'r-1' }] });
  });

  it('una receta común o de otro nutricionista no se edita y sus ingredientes no se tocan', async () => {
    const prisma = createFakePrisma({ updatedCount: 0 });
    const repository = createRecipeRepository({ prisma });

    expect(await repository.updateOwn('r-1', 'nutri-2', { name: 'X' }, ingredients, ['lunch'])).toBeNull();
    expect(prisma.recipeIngredient.deleteMany).not.toHaveBeenCalled();
    expect(prisma.recipeMealType.deleteMany).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ''])('corta cualquier consulta, alta o edición sin nutricionista (%s)', (nutritionistId) => {
    const prisma = createFakePrisma();
    const repository = createRecipeRepository({ prisma });

    expect(() => repository.findVisible(nutritionistId)).toThrow(/sin nutritionistId/);
    expect(() => repository.findVisibleById('r-1', nutritionistId)).toThrow(/sin nutritionistId/);
    expect(() => repository.create(nutritionistId, { name: 'X' }, ingredients, ['lunch'])).toThrow(/sin nutritionistId/);
    expect(() => repository.updateOwn('r-1', nutritionistId, { name: 'X' }, ingredients, ['lunch'])).toThrow(
      /sin nutritionistId/,
    );
    expect(prisma.recipe.findMany).not.toHaveBeenCalled();
    expect(prisma.recipe.findFirst).not.toHaveBeenCalled();
    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('recipe.repository — recetas básicas comunes (T30)', () => {
  it('crea una común sin dueño cuando no hay una con ese nombre', async () => {
    const prisma = createFakePrisma({ existingCommon: null });
    const repository = createRecipeRepository({ prisma });

    await repository.upsertCommon({ name: 'Licuado' }, ingredients, ['breakfast']);

    expect(prisma.recipe.findFirst).toHaveBeenCalledWith({ where: { name: 'Licuado', nutritionistId: null } });
    const { data } = prisma.recipe.create.mock.calls[0][0];
    expect(data).toMatchObject({ name: 'Licuado', mealTypes: { create: [{ mealType: 'breakfast' }] } });
    expect(data).not.toHaveProperty('nutritionistId');
  });

  it('pone al día la común con ese nombre y reemplaza ingredientes y tipos, sin borrarla', async () => {
    const prisma = createFakePrisma({ existingCommon: { id: 'comun-1' } });
    const repository = createRecipeRepository({ prisma });

    await repository.upsertCommon({ name: 'Licuado', timeMinutes: 5 }, ingredients, ['breakfast']);

    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.recipe.update).toHaveBeenCalledWith({ where: { id: 'comun-1' }, data: { name: 'Licuado', timeMinutes: 5 } });
    expect(prisma.recipeIngredient.deleteMany).toHaveBeenCalledWith({ where: { recipeId: 'comun-1' } });
    expect(prisma.recipeMealType.createMany).toHaveBeenCalledWith({ data: [{ mealType: 'breakfast', recipeId: 'comun-1' }] });
  });
});
