const { createFoodRepository } = require('./food.repository');
const { createFoodGroupRepository } = require('./foodGroup.repository');
const { createPathologyRepository } = require('./pathology.repository');

// Los tests de los servicios usan repositorios fake que ya filtran por autor.
// Estos verifican la otra mitad: que la escritura real a Prisma lleve el autor
// en el where, y que se corte si llega sin autor (Prisma ignoraría el filtro).
function createFakePrisma({ updateCount = 1 } = {}) {
  const model = () => ({
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => ({ id: 'x-1' })),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }) => ({ id: 'x-1', ...data })),
    updateMany: vi.fn(async () => ({ count: updateCount })),
  });
  const prisma = {
    food: model(),
    foodGroup: model(),
    pathology: model(),
    foodCategory: { deleteMany: vi.fn(async () => ({ count: 1 })), createMany: vi.fn(async () => ({ count: 2 })) },
  };
  prisma.$transaction = vi.fn(async (callback) => callback(prisma));
  return prisma;
}

const foodData = { name: 'Caballa', foodGroupId: 'g-1', active: true, categories: ['protein', 'healthy_fat'] };

describe('food.repository — escrituras filtradas por autor', () => {
  it('updateByAuthor filtra por id y autor, y reemplaza las categorías dentro de la transacción', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.updateByAuthor('f-1', 'nutri-1', foodData);

    expect(prisma.food.updateMany).toHaveBeenCalledWith({
      where: { id: 'f-1', createdById: 'nutri-1' },
      data: { name: 'Caballa', foodGroupId: 'g-1', active: true },
    });
    expect(prisma.foodCategory.deleteMany).toHaveBeenCalledWith({ where: { foodId: 'f-1' } });
    expect(prisma.foodCategory.createMany).toHaveBeenCalledWith({
      data: [
        { foodId: 'f-1', category: 'protein' },
        { foodId: 'f-1', category: 'healthy_fat' },
      ],
    });
  });

  it('con un alimento ajeno o del seed (0 filas) devuelve null sin tocar las categorías', async () => {
    const prisma = createFakePrisma({ updateCount: 0 });
    const repository = createFoodRepository({ prisma });

    const result = await repository.updateByAuthor('f-ajeno', 'nutri-1', foodData);

    expect(result).toBeNull();
    expect(prisma.foodCategory.deleteMany).not.toHaveBeenCalled();
    expect(prisma.foodCategory.createMany).not.toHaveBeenCalled();
  });

  it('el alta guarda el autor y crea las categorías', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.create({ ...foodData, createdById: 'nutri-1' });

    expect(prisma.food.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'nutri-1',
          categories: { create: [{ category: 'protein' }, { category: 'healthy_fat' }] },
        }),
      }),
    );
  });

  it('el listado sin includeInactive filtra los dados de baja', async () => {
    const prisma = createFakePrisma();
    const repository = createFoodRepository({ prisma });

    await repository.findMany({ search: 'caba', groupIds: ['g-1', 'g-2'] });

    expect(prisma.food.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'caba', mode: 'insensitive' }, foodGroupId: { in: ['g-1', 'g-2'] }, active: true },
      }),
    );
  });
});

describe.each([
  ['food', createFoodRepository, foodData],
  ['foodGroup', createFoodGroupRepository, { name: 'Aves', parentId: null }],
  ['pathology', createPathologyRepository, { name: 'Gota' }],
])('%s.repository — sin autor no escribe', (model, createRepository, data) => {
  it.each([undefined, null, ''])('corta un alta o una edición con autor %s', async (author) => {
    const prisma = createFakePrisma();
    const repository = createRepository({ prisma });

    expect(() => repository.create({ ...data, createdById: author })).toThrow(/sin nutricionista autor/);
    await expect(repository.updateByAuthor('x-1', author, data)).rejects.toThrow(/sin nutricionista autor/);
    expect(prisma[model].create).not.toHaveBeenCalled();
    expect(prisma[model].updateMany).not.toHaveBeenCalled();
  });
});
