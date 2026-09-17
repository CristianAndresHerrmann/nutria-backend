const authService = require('../services/auth.service');
const { loginSchema } = require('../schemas/auth.schema');
const AppError = require('../utils/AppError');

async function postLogin(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message || 'Datos inválidos');
    }

    const { email, password } = parsed.data;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { postLogin };
