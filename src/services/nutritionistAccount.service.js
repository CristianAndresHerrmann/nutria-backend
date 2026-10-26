const bcrypt = require('bcryptjs');
const nutritionistRepository = require('../repositories/nutritionist.repository');
const AppError = require('../utils/AppError');

// Mismo costo que el seed.
const BCRYPT_ROUNDS = 10;

const ACCOUNT_NOT_FOUND_MESSAGE = 'Cuenta no encontrada';
const DUPLICATE_EMAIL_MESSAGE = 'Ya existe una cuenta con ese email';
const SELF_DEACTIVATION_MESSAGE = 'No podés desactivar tu propia cuenta';

// Cuentas de nutricionista administradas desde el panel (T31). Las de
// administrador no se listan ni se modifican desde acá: se crean con
// scripts/create-admin.js, y el repositorio filtra por rol en toda escritura.
function createNutritionistAccountService({ nutritionistRepository: repository }) {
  return {
    list() {
      return repository.listNutritionists();
    },

    // El email se compara contra todas las cuentas, administradores incluidos:
    // la columna es única. Si dos altas compiten, el P2002 de la base termina
    // igual en 409 (errorHandler).
    async create({ name, email, password }) {
      if (await repository.findByEmail(email)) {
        throw new AppError(409, DUPLICATE_EMAIL_MESSAGE, { details: { fields: { email: DUPLICATE_EMAIL_MESSAGE } } });
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      return repository.createNutritionist({ name, email, passwordHash });
    },

    // El chequeo va antes de buscar la cuenta. Hoy el id de un administrador ya
    // da 404 (el repositorio solo toca nutricionistas), pero quedarse sin
    // acceso al panel no puede depender de ese filtro.
    async setActive(id, adminId, active) {
      if (id === adminId) {
        throw new AppError(403, SELF_DEACTIVATION_MESSAGE);
      }
      const account = await repository.setActive(id, active);
      if (!account) throw new AppError(404, ACCOUNT_NOT_FOUND_MESSAGE);
      return account;
    },

    // La define el administrador y se la comunica a la nutricionista por fuera
    // del sistema: no hay recuperación por email (fuera de alcance).
    async resetPassword(id, password) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const account = await repository.setPasswordHash(id, passwordHash);
      if (!account) throw new AppError(404, ACCOUNT_NOT_FOUND_MESSAGE);
    },
  };
}

module.exports = createNutritionistAccountService({ nutritionistRepository });
module.exports.createNutritionistAccountService = createNutritionistAccountService;
module.exports.ACCOUNT_NOT_FOUND_MESSAGE = ACCOUNT_NOT_FOUND_MESSAGE;
module.exports.DUPLICATE_EMAIL_MESSAGE = DUPLICATE_EMAIL_MESSAGE;
module.exports.SELF_DEACTIVATION_MESSAGE = SELF_DEACTIVATION_MESSAGE;
