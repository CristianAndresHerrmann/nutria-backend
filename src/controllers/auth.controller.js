const authService = require('../services/auth.service');

async function postLogin(req, res, next) {
  try {
    const { email, password } = req.validated.body;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { postLogin };
