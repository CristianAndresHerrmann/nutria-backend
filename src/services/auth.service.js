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

      if (!nutritionist || !passwordMatches) {
        throw new AppError(401, INVALID_CREDENTIALS_MESSAGE);
      }

      const token = jwt.sign({ sub: nutritionist.id }, jwtSecret, {
        expiresIn: jwtExpiresIn,
      });

      return {
        token,
        nutritionist: {
          id: nutritionist.id,
          name: nutritionist.name,
          email: nutritionist.email,
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
