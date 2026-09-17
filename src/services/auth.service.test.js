const bcrypt = require('bcryptjs');
const { createAuthService } = require('./auth.service');

function createFakeNutritionistRepository(nutritionists) {
  return {
    async findByEmail(email) {
      return nutritionists.find((n) => n.email === email) || null;
    },
  };
}

async function buildService(password) {
  const passwordHash = await bcrypt.hash(password, 4);
  const nutritionist = {
    id: 'nutri-1',
    name: 'Camila Ríos',
    email: 'camila@nutria.test',
    passwordHash,
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
    });
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
