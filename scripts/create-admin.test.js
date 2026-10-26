const bcrypt = require('bcryptjs');
const { ensureAdmin, adminEnvSchema } = require('./create-admin');

// Prisma falso en memoria: alcanza para verificar que el script es idempotente
// y que nunca promueve a una nutricionista.
function createFakePrisma(accounts = []) {
  const store = accounts.map((account) => ({ ...account }));
  return {
    store,
    nutritionist: {
      findUnique: vi.fn(async ({ where }) => store.find((account) => account.email === where.email) || null),
      create: vi.fn(async ({ data }) => {
        const account = { id: `cuenta-${store.length + 1}`, active: true, ...data };
        store.push(account);
        return account;
      }),
      update: vi.fn(async ({ where, data }) => Object.assign(store.find((account) => account.id === where.id), data)),
    },
  };
}

const admin = { email: 'admin@nutria.test', password: 'clave-de-prueba-1', name: 'Administrador' };

describe('create-admin — cuenta de administrador desde variables de entorno', () => {
  it('crea la cuenta con rol admin y la contraseña hasheada', async () => {
    const prisma = createFakePrisma();

    await expect(ensureAdmin(prisma, admin)).resolves.toBe('created');

    expect(prisma.store).toHaveLength(1);
    expect(prisma.store[0]).toMatchObject({ email: admin.email, role: 'admin', name: 'Administrador' });
    expect(await bcrypt.compare(admin.password, prisma.store[0].passwordHash)).toBe(true);
  });

  it('es idempotente: la segunda vez no duplica, rota la contraseña y reactiva la cuenta', async () => {
    const prisma = createFakePrisma();
    await ensureAdmin(prisma, admin);
    prisma.store[0].active = false;

    await expect(ensureAdmin(prisma, { ...admin, password: 'otra-clave-de-prueba' })).resolves.toBe('updated');

    expect(prisma.store).toHaveLength(1);
    expect(prisma.store[0].active).toBe(true);
    expect(await bcrypt.compare('otra-clave-de-prueba', prisma.store[0].passwordHash)).toBe(true);
  });

  it('no convierte en administrador a una cuenta de nutricionista', async () => {
    const prisma = createFakePrisma([{ id: 'nutri-1', email: admin.email, role: 'nutritionist', passwordHash: 'x' }]);

    await expect(ensureAdmin(prisma, admin)).rejects.toThrow('ya es una cuenta de nutricionista');

    expect(prisma.store[0]).toMatchObject({ role: 'nutritionist', passwordHash: 'x' });
    expect(prisma.nutritionist.update).not.toHaveBeenCalled();
  });

  it('exige ADMIN_EMAIL y una ADMIN_PASSWORD que cumpla la política, y normaliza el email', () => {
    expect(adminEnvSchema.safeParse({}).success).toBe(false);
    expect(adminEnvSchema.safeParse({ ADMIN_EMAIL: 'admin@nutria.test', ADMIN_PASSWORD: 'corta' }).success).toBe(false);

    const parsed = adminEnvSchema.parse({ ADMIN_EMAIL: ' Admin@Nutria.TEST ', ADMIN_PASSWORD: 'clave-de-prueba-1' });
    expect(parsed).toEqual({ ADMIN_EMAIL: 'admin@nutria.test', ADMIN_PASSWORD: 'clave-de-prueba-1', ADMIN_NAME: 'Administrador' });
  });
});
