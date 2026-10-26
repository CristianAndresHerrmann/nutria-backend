const nutritionistAccountService = require('../services/nutritionistAccount.service');
const {
  serializeNutritionistAccount,
  serializeNutritionistAccounts,
} = require('../serializers/nutritionistAccount.serializer');

// Rutas /admin: requireAdmin ya garantizó que req.nutricionistaId es el id de
// un administrador activo.

async function listNutritionists(req, res, next) {
  try {
    const accounts = await nutritionistAccountService.list();
    res.status(200).json(serializeNutritionistAccounts(accounts));
  } catch (error) {
    next(error);
  }
}

async function createNutritionist(req, res, next) {
  try {
    const account = await nutritionistAccountService.create(req.validated.body);
    res.status(201).json(serializeNutritionistAccount(account));
  } catch (error) {
    next(error);
  }
}

async function setNutritionistActive(req, res, next) {
  try {
    const account = await nutritionistAccountService.setActive(
      req.validated.params.id,
      req.nutricionistaId,
      req.validated.body.active,
    );
    res.status(200).json(serializeNutritionistAccount(account));
  } catch (error) {
    next(error);
  }
}

async function resetNutritionistPassword(req, res, next) {
  try {
    await nutritionistAccountService.resetPassword(req.validated.params.id, req.validated.body.password);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = { listNutritionists, createNutritionist, setNutritionistActive, resetNutritionistPassword };
