const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nutritionistRepository = require('../repositories/nutritionist.repository');
const config = require('../config/env');
const AppError = require('../utils/AppError');

// Hash sin correspondencia con ninguna contraseña real: se usa para comparar
// igual cuando el email no existe, de forma que ambos casos (email inexistente
// y contraseña incorrecta) tarden lo mismo y devuelvan el mismo error.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8zpX5Ez.7Kz6R7qk1v6X6X6X6X6X6X';

const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';

function createAuthService({ nutritionistRepository: repository, jwtSecret, jwtExpiresIn }) {
  return {
    async login(email, password) {
      const nutritionist = await repository.findByEmail(email);

      const passwordHash = nutritionist ? nutritionist.passwordHash : DUMMY_HASH;
      const passwordMatches = await bcrypt.compare(password, passwordHash);

      // Una cuenta desactivada recibe el mismo error que una contraseña
      // incorrecta: el login no revela qué cuentas existen ni su estado.
      if (!nutritionist || !passwordMatches || !nutritionist.active) {
        throw new AppError(401, INVALID_CREDENTIALS_MESSAGE);
      }

      // El rol viaja en el token para que el frontend sepa a qué inicio
      // llevar. El backend no lo usa para autorizar: requireAuth lo lee de la base.
      const token = jwt.sign({ sub: nutritionist.id, role: nutritionist.role, tokenVersion: nutritionist.tokenVersion }, jwtSecret, {
        expiresIn: jwtExpiresIn,
      });

      return {
        token,
        nutritionist: {
          id: nutritionist.id,
          name: nutritionist.name,
          email: nutritionist.email,
          role: nutritionist.role,
        },
      };
    },
  };
}

module.exports = createAuthService({
  nutritionistRepository,
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
});
module.exports.createAuthService = createAuthService;
