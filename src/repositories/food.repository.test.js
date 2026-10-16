const { createFoodRepository } = require('./food.repository');

// Los tests del servicio usan un repositorio fake que ya aplica la visibilidad.
// Estos verifican la otra mitad: que la consulta real a Prisma lleve el filtro
// "comunes o propios", y que se corte si llega sin nutricionista (Prisma ignoraría
// el filtro y devolvería los privados de todos).
function createFakePrisma() {
  return {
    food: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: 'f-1', ...data })),
    },
  };
}

const VISIBLE_TO_NUTRI_1 = { OR: [{ nutritionistId: null }, { nutritionistId: 'nutri-1' }] };

describe('food.repository — visibilidad por nutricionista', () => {
  it('el listado trae comunes y propios, solo vigentes, con los filtros', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.findVisible('nutri-1', { search: 'caba', groupIds: ['g-1', 'g-2'] });

    expect(prisma.food.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...VISIBLE_TO_NUTRI_1,
          active: true,
          name: { contains: 'caba', mode: 'insensitive' },
          foodGroupId: { in: ['g-1', 'g-2'] },
        },
      }),
    );
  });

  it('la búsqueda por id y por nombre filtran por lo visible', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.findVisibleById('f-1', 'nutri-1');
    await repository.findVisibleByName('Leche', 'nutri-1');

    expect(prisma.food.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: 'f-1', ...VISIBLE_TO_NUTRI_1 } }));
    expect(prisma.food.findFirst).toHaveBeenNthCalledWith(2, {
      where: { name: { equals: 'Leche', mode: 'insensitive' }, ...VISIBLE_TO_NUTRI_1 },
    });
  });

  it('el alta guarda al nutricionista como dueño y crea las categorías', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.createPrivate('nutri-1', { name: 'Caballa', foodGroupId: 'g-1', categories: ['protein', 'healthy_fat'] });

    expect(prisma.food.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Caballa',
          foodGroupId: 'g-1',
          nutritionistId: 'nutri-1',
          categories: { create: [{ category: 'protein' }, { category: 'healthy_fat' }] },
        },
      }),
    );
  });

  it.each([undefined, null, ''])('corta cualquier consulta o alta sin nutricionista (%s)', async (nutritionistId) => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    expect(() => repository.findVisible(nutritionistId)).toThrow(/sin nutritionistId/);
    expect(() => repository.findVisibleById('f-1', nutritionistId)).toThrow(/sin nutritionistId/);
    expect(() => repository.findVisibleByName('Leche', nutritionistId)).toThrow(/sin nutritionistId/);
    expect(() => repository.createPrivate(nutritionistId, { name: 'X', foodGroupId: 'g', categories: ['protein'] })).toThrow(
      /sin nutritionistId/,
    );
    expect(prisma.food.findMany).not.toHaveBeenCalled();
    expect(prisma.food.findFirst).not.toHaveBeenCalled();
    expect(prisma.food.create).not.toHaveBeenCalled();
  });
});
