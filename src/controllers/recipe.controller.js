const recipeService = require('../services/recipe.service');
const { serializeRecipe, serializeRecipes } = require('../serializers/recipe.serializer');

// La validación la hace el middleware validate en la ruta. El nutricionista
// sale del token (req.nutricionistaId), nunca del body: es el dueño de las
// recetas que da de alta y el filtro de todas las que lee o edita.

async function listRecipes(req, res, next) {
  try {
    const recipes = await recipeService.list(req.nutricionistaId, req.validated.query);
    res.status(200).json(serializeRecipes(recipes));
  } catch (error) {
    next(error);
  }
}

async function getRecipe(req, res, next) {
  try {
    const recipe = await recipeService.get(req.validated.params.id, req.nutricionistaId);
    res.status(200).json(serializeRecipe(recipe));
  } catch (error) {
    next(error);
  }
}

async function createRecipe(req, res, next) {
  try {
    const recipe = await recipeService.create(req.nutricionistaId, req.validated.body);
    res.status(201).json(serializeRecipe(recipe));
  } catch (error) {
    next(error);
  }
}

async function updateRecipe(req, res, next) {
  try {
    const recipe = await recipeService.update(req.validated.params.id, req.nutricionistaId, req.validated.body);
    res.status(200).json(serializeRecipe(recipe));
  } catch (error) {
    next(error);
  }
}

async function setRecipeAvailability(req, res, next) {
  try {
    const recipe = await recipeService.setAvailability(req.validated.params.id, req.nutricionistaId, req.validated.body);
    res.status(200).json(serializeRecipe(recipe));
  } catch (error) {
    next(error);
  }
}

module.exports = { listRecipes, getRecipe, createRecipe, updateRecipe, setRecipeAvailability };
