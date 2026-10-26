const bcrypt = require('bcryptjs');
const {
  createNutritionistAccountService,
  ACCOUNT_NOT_FOUND_MESSAGE,
  DUPLICATE_EMAIL_MESSAGE,
  SELF_DEACTIVATION_MESSAGE,
} = require('./nutritionistAccount.service');

// Repositorio falso con la misma regla que el real: las escrituras solo
// alcanzan cuentas de nutricionista, así que el id de un admin no existe para
// el panel.
function createFakeRepository() {
  const store = [
    { id: 'admin-1', name: 'Administrador', email: 'admin@nutria.test', passwordHash: 'h-admin', role: 'admin', active: true, createdAt: new Date('2026-10-01') },
    { id: 'nutri-1', name: 'Camila Ríos', email: 'camila@nutria.test', passwordHash: 'h-1', role: 'nutritionist', active: true, createdAt: new Date('2026-10-02') },
  ];
  const managed = (id) => store.find((account) => account.id === id && account.role === 'nutritionist');
  const view = ({ id, name, email, active, createdAt }) => ({ id, name, email, active, createdAt });

  return {
    store,
    async findByEmail(email) {
      return store.find((account) => account.email === email) || null;
    },
    async listNutritionists() {
      return store.filter((account) => account.role === 'nutritionist').map(view);
    },
    async createNutritionist(data) {
      const account = { id: `nutri-${store.length + 1}`, ...data, role: 'nutritionist', active: true, createdAt: new Date() };
      store.push(account);
      return view(account);
    },
    async setActive(id, active) {
      const account = managed(id);
      if (!account) return null;
      account.active = active;
      return view(account);
    },
    async setPasswordHash(id, passwordHash) {
      const account = managed(id);
      if (!account) return null;
      account.passwordHash = passwordHash;
      return view(account);
    },
  };
}

function buildService() {
  const repository = createFakeRepository();
  return { service: createNutritionistAccountService({ nutritionistRepository: repository }), repository };
}

const newAccount = { name: 'Ana Pérez', email: 'ana@nutria.test', password: 'inicial-123' };

describe('nutritionistAccount.service — panel del administrador', () => {
  it('lista solo las cuentas de nutricionista, sin el hash de la contraseña', async () => {
    const { service } = buildService();

    const accounts = await service.list();

    expect(accounts.map(({ id }) => id)).toEqual(['nutri-1']);
    expect(accounts[0]).not.toHaveProperty('passwordHash');
    expect(accounts[0]).toEqual({
      id: 'nutri-1',
      name: 'Camila Ríos',
      email: 'camila@nutria.test',
      active: true,
      createdAt: expect.any(Date),
    });
  });

  it('da de alta una cuenta activa con la contraseña inicial hasheada', async () => {
    const { service, repository } = buildService();

    const created = await service.create(newAccount);

    expect(created).toMatchObject({ name: 'Ana Pérez', email: 'ana@nutria.test', active: true });
    const stored = repository.store.find(({ email }) => email === 'ana@nutria.test');
    expect(stored.passwordHash).not.toBe('inicial-123');
    expect(await bcrypt.compare('inicial-123', stored.passwordHash)).toBe(true);
  });

  it.each(['camila@nutria.test', 'admin@nutria.test'])(
    'un email repetido (%s) responde 409 con el error en details.fields.email y no crea nada',
    async (email) => {
      const { service, repository } = buildService();

      await expect(service.create({ ...newAccount, email })).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
        details: { fields: { email: DUPLICATE_EMAIL_MESSAGE } },
      });
      expect(repository.store).toHaveLength(2);
    },
  );

  it('desactiva y reactiva una cuenta de nutricionista', async () => {
    const { service, repository } = buildService();

    await expect(service.setActive('nutri-1', 'admin-1', false)).resolves.toMatchObject({ id: 'nutri-1', active: false });
    expect(repository.store.find(({ id }) => id === 'nutri-1').active).toBe(false);

    await expect(service.setActive('nutri-1', 'admin-1', true)).resolves.toMatchObject({ id: 'nutri-1', active: true });
  });

  it('el administrador no puede desactivarse a sí mismo: 403 y la cuenta sigue activa', async () => {
    const { service, repository } = buildService();

    await expect(service.setActive('admin-1', 'admin-1', false)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: SELF_DEACTIVATION_MESSAGE,
    });
    expect(repository.store.find(({ id }) => id === 'admin-1').active).toBe(true);
  });

  it.each([
    ['inexistente', 'no-existe'],
    ['de otro administrador', 'admin-1'],
  ])('una cuenta %s responde 404, tanto al desactivar como al restablecer la contraseña', async (_, id) => {
    const { service, repository } = buildService();
    const notFound = { status: 404, message: ACCOUNT_NOT_FOUND_MESSAGE };

    await expect(service.setActive(id, 'admin-2', false)).rejects.toMatchObject(notFound);
    await expect(service.resetPassword(id, 'nueva-clave-1')).rejects.toMatchObject(notFound);
    expect(repository.store.find((account) => account.id === 'admin-1')).toMatchObject({ active: true, passwordHash: 'h-admin' });
  });

  it('restablecer la contraseña guarda un hash nuevo que valida la nueva y no la anterior', async () => {
    const { service, repository } = buildService();

    await expect(service.resetPassword('nutri-1', 'nueva-clave-1')).resolves.toBeUndefined();

    const { passwordHash } = repository.store.find(({ id }) => id === 'nutri-1');
    expect(await bcrypt.compare('nueva-clave-1', passwordHash)).toBe(true);
    expect(passwordHash).not.toBe('h-1');
  });
});
