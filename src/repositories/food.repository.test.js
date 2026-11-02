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

  it('el catálogo del motor de reglas trae comunes y propios, incluidos los dados de baja', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.findAllVisible('nutri-1');

    expect(prisma.food.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: VISIBLE_TO_NUTRI_1 }));
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

  it('el alta guarda al nutricionista como dueño y como autor, y crea las categorías', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.createPrivate('nutri-1', { name: 'Caballa', foodGroupId: 'g-1', categories: ['protein', 'healthy_fat'] });

    expect(prisma.food.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Caballa',
          foodGroupId: 'g-1',
          nutritionistId: 'nutri-1',
          createdById: 'nutri-1',
          categories: { create: [{ category: 'protein' }, { category: 'healthy_fat' }] },
        },
      }),
    );
  });

  it.each([undefined, null, ''])('corta cualquier consulta o alta sin nutricionista (%s)', async (nutritionistId) => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    expect(() => repository.findVisible(nutritionistId)).toThrow(/sin nutritionistId/);
    expect(() => repository.findAllVisible(nutritionistId)).toThrow(/sin nutritionistId/);
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

describe('food.repository — panel del administrador (T25)', () => {
  function createAdminPrisma() {
    return {
      food: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        update: vi.fn(async ({ data }) => ({ id: 'f-1', ...data })),
      },
    };
  }

  it('el listado no filtra visibilidad ni vigencia; owner elige comunes o los privados de uno', async () => {
    const prisma = createAdminPrisma();
    const repository = createFoodRepository({ prisma });

    await repository.findForAdmin({});
    await repository.findForAdmin({ owner: 'common' });
    await repository.findForAdmin({ owner: 'nutri-1', search: 'ké' });

    expect(prisma.food.findMany.mock.calls.map(([query]) => query.where)).toEqual([
      {},
      { nutritionistId: null },
      { nutritionistId: 'nutri-1', name: { contains: 'ké', mode: 'insensitive' } },
    ]);
  });

  it('la búsqueda por nombre arma los ámbitos pedidos y excluye el alimento editado', async () => {
    const prisma = createAdminPrisma();
    const repository = createFoodRepository({ prisma });

    await repository.findByName('Kéfir', { excludeId: 'f-1', ownerId: 'nutri-1' });
    await repository.findByName('Kéfir', { activePrivates: true });

    expect(prisma.food.findMany.mock.calls.map(([query]) => query.where)).toEqual([
      {
        name: { equals: 'Kéfir', mode: 'insensitive' },
        OR: [{ nutritionistId: null }, { nutritionistId: 'nutri-1' }],
        id: { not: 'f-1' },
      },
      {
        name: { equals: 'Kéfir', mode: 'insensitive' },
        OR: [{ nutritionistId: null }, { nutritionistId: { not: null }, active: true }],
      },
    ]);
  });

  it('la edición reemplaza las categorías en la misma escritura', async () => {
    const prisma = createAdminPrisma();
    const repository = createFoodRepository({ prisma });

    await repository.update('f-1', { name: 'Kéfir', foodGroupId: 'g-1', categories: ['protein'], active: false });

    expect(prisma.food.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'f-1' },
        data: {
          name: 'Kéfir',
          foodGroupId: 'g-1',
          active: false,
          categories: { deleteMany: {}, create: [{ category: 'protein' }] },
        },
      }),
    );
  });

  it('pasar al común quita el dueño y no toca al autor', async () => {
    const prisma = createAdminPrisma();
    const repository = createFoodRepository({ prisma });

    await repository.promote('f-1', 'Kéfir');

    expect(prisma.food.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f-1' }, data: { nutritionistId: null, name: 'Kéfir' } }),
    );
  });

  it('la actividad trae solo lo cargado por nutricionistas, o por uno, sin nada de pacientes', async () => {
    const prisma = createAdminPrisma();
    const repository = createFoodRepository({ prisma });

    await repository.findActivity();
    await repository.findActivity({ nutritionistId: 'nutri-1' });

    const [[all], [one]] = prisma.food.findMany.mock.calls;
    expect(all.where).toEqual({ createdById: { not: null } });
    expect(one.where).toEqual({ createdById: 'nutri-1' });
    expect(Object.keys(all.select).sort()).toEqual(['active', 'createdAt', 'createdBy', 'id', 'name', 'nutritionistId']);
  });
});
