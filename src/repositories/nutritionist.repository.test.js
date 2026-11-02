const { createNutritionistRepository } = require('./nutritionist.repository');

// El servicio de cuentas confía en que el repositorio solo toque cuentas de
// nutricionista. Estos tests verifican que el rol vaya en el where de Prisma, y
// que lo que se lee para el panel no traiga el hash de la contraseña.
function createFakePrisma({ updatedCount = 1 } = {}) {
  return {
    nutritionist: {
      findUnique: vi.fn(async () => ({ id: 'nutri-1' })),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }) => ({ id: 'nutri-1', ...data })),
      updateMany: vi.fn(async () => ({ count: updatedCount })),
    },
  };
}

describe('nutritionist.repository — cuentas administradas', () => {
  it('el listado trae solo cuentas de nutricionista y sin el hash', async () => {
    const prisma = createFakePrisma();
    const repository = createNutritionistRepository({ prisma });

    await repository.listNutritionists();

    const [args] = prisma.nutritionist.findMany.mock.calls[0];
    expect(args.where).toEqual({ role: 'nutritionist' });
    expect(args.select).not.toHaveProperty('passwordHash');
    expect(args.select).not.toHaveProperty('tokenVersion');
  });

  it('el alta siempre crea una cuenta de nutricionista', async () => {
    const prisma = createFakePrisma();
    const repository = createNutritionistRepository({ prisma });

    await repository.createNutritionist({ name: 'Ana', email: 'ana@nutria.test', passwordHash: 'hash', role: 'admin' });

    expect(prisma.nutritionist.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'nutritionist' }) }),
    );
  });

  it.each([
    ['setActive', false, { active: false }],
    ['setPasswordHash', 'hash-nuevo', { passwordHash: 'hash-nuevo', tokenVersion: { increment: 1 } }],
  ])('%s escribe solo sobre cuentas de nutricionista', async (method, value, data) => {
    const prisma = createFakePrisma();
    const repository = createNutritionistRepository({ prisma });

    await repository[method]('nutri-1', value);

    expect(prisma.nutritionist.updateMany).toHaveBeenCalledWith({ where: { id: 'nutri-1', role: 'nutritionist' }, data });
  });

  it('una escritura que no afecta filas (inexistente o administrador) devuelve null sin releer', async () => {
    const prisma = createFakePrisma({ updatedCount: 0 });
    const repository = createNutritionistRepository({ prisma });

    await expect(repository.setActive('admin-1', false)).resolves.toBeNull();
    expect(prisma.nutritionist.findUnique).not.toHaveBeenCalled();
  });

  it('el estado de autenticación lee rol, estado y versión de tokens sin el hash', async () => {
    const prisma = createFakePrisma();
    const repository = createNutritionistRepository({ prisma });

    await repository.findAuthState('nutri-1');

    expect(prisma.nutritionist.findUnique).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      select: { role: true, active: true, tokenVersion: true },
    });
  });
});
