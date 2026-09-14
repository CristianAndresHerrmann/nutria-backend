const authService = require('../services/auth.service');
const AppError = require('../utils/AppError');

async function postLogin(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      throw new AppError(400, 'Email y contraseña son requeridos');
    }

    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { postLogin };
