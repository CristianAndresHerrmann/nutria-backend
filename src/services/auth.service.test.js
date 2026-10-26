const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuthService } = require('./auth.service');

function createFakeNutritionistRepository(nutritionists) {
  return {
    async findByEmail(email) {
      return nutritionists.find((n) => n.email === email) || null;
    },
  };
}

async function buildService(password, { active = true, role = 'nutritionist' } = {}) {
  const passwordHash = await bcrypt.hash(password, 4);
  const nutritionist = {
    id: 'nutri-1',
    name: 'Camila Ríos',
    email: 'camila@nutria.test',
    passwordHash,
    role,
    active,
  };

  const service = createAuthService({
    nutritionistRepository: createFakeNutritionistRepository([nutritionist]),
    jwtSecret: 'test-secret',
    jwtExpiresIn: '1h',
  });

  return { service, nutritionist };
}

describe('auth.service — login', () => {
  it('autentica con credenciales válidas y devuelve un token y los datos del nutricionista', async () => {
    const { service, nutritionist } = await buildService('correcta123');

    const result = await service.login('camila@nutria.test', 'correcta123');

    expect(result.token).toEqual(expect.any(String));
    expect(result.nutritionist).toEqual({
      id: nutritionist.id,
      name: nutritionist.name,
      email: nutritionist.email,
      role: 'nutritionist',
    });
  });

  it('el token lleva el id en sub y el rol de la cuenta', async () => {
    const { service } = await buildService('correcta123', { role: 'admin' });

    const { token, nutritionist } = await service.login('camila@nutria.test', 'correcta123');

    expect(jwt.verify(token, 'test-secret')).toMatchObject({ sub: 'nutri-1', role: 'admin' });
    expect(nutritionist.role).toBe('admin');
  });

  it('una cuenta desactivada no inicia sesión aunque la contraseña sea correcta, con el mismo error que credenciales inválidas', async () => {
    const { service } = await buildService('correcta123', { active: false });

    const inactiva = await service.login('camila@nutria.test', 'correcta123').catch((error) => error);
    const passwordIncorrecta = await service.login('camila@nutria.test', 'incorrecta').catch((error) => error);

    expect(inactiva).toMatchObject({ status: 401, message: 'Credenciales inválidas' });
    expect(inactiva.code).toBe(passwordIncorrecta.code);
    expect(inactiva.message).toBe(passwordIncorrecta.message);
  });

  it('rechaza una contraseña incorrecta con 401', async () => {
    const { service } = await buildService('correcta123');

    await expect(service.login('camila@nutria.test', 'incorrecta')).rejects.toMatchObject({
      status: 401,
      message: 'Credenciales inválidas',
    });
  });

  it('rechaza un email inexistente con 401', async () => {
    const { service } = await buildService('correcta123');

    await expect(service.login('nadie@nutria.test', 'cualquiera')).rejects.toMatchObject({
      status: 401,
      message: 'Credenciales inválidas',
    });
  });

  it('no filtra si el error fue el email o la contraseña: ambos casos devuelven exactamente el mismo error', async () => {
    const { service } = await buildService('correcta123');

    const emailInexistente = await service
      .login('nadie@nutria.test', 'cualquiera')
      .catch((error) => error);
    const passwordIncorrecta = await service
      .login('camila@nutria.test', 'incorrecta')
      .catch((error) => error);

    expect(emailInexistente.status).toBe(passwordIncorrecta.status);
    expect(emailInexistente.message).toBe(passwordIncorrecta.message);
  });
});
