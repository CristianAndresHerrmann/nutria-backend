const prisma = require('../lib/prisma');

// Lo que el panel del administrador ve de una cuenta. Nunca el hash de la
// contraseña ni nada de sus pacientes.
const ACCOUNT_SELECT = { id: true, name: true, email: true, active: true, createdAt: true };

// Las escrituras del panel solo alcanzan cuentas de nutricionista: con el rol en
// el where, el id de un administrador afecta 0 filas y responde como inexistente.
const MANAGED_ACCOUNT = { role: 'nutritionist' };

function createNutritionistRepository({ prisma: client }) {
  // Con el hash: lo usa el login para comparar la contraseña.
  function findByEmail(email) {
    return client.nutritionist.findUnique({ where: { email } });
  }

  // Lo que requireAuth necesita en cada request: si la cuenta sigue existiendo,
  // si está activa y con qué rol.
  function findAuthState(id) {
    return client.nutritionist.findUnique({ where: { id }, select: { role: true, active: true } });
  }

  function listNutritionists() {
    return client.nutritionist.findMany({
      where: MANAGED_ACCOUNT,
      select: ACCOUNT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  function createNutritionist(data) {
    return client.nutritionist.create({ data: { ...data, role: 'nutritionist' }, select: ACCOUNT_SELECT });
  }

  async function updateManaged(id, data) {
    const { count } = await client.nutritionist.updateMany({ where: { id, ...MANAGED_ACCOUNT }, data });
    if (count === 0) return null;
    return client.nutritionist.findUnique({ where: { id }, select: ACCOUNT_SELECT });
  }

  function setActive(id, active) {
    return updateManaged(id, { active });
  }

  function setPasswordHash(id, passwordHash) {
    return updateManaged(id, { passwordHash });
  }

  return { findByEmail, findAuthState, listNutritionists, createNutritionist, setActive, setPasswordHash };
}

module.exports = createNutritionistRepository({ prisma });
module.exports.createNutritionistRepository = createNutritionistRepository;
