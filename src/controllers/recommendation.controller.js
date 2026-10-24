const recommendationService = require('../services/recommendation.service');
const {
  serializeRecommendation,
  serializeRecommendations,
} = require('../serializers/recommendation.serializer');

// La validación la hace el middleware validate en la ruta. El nutricionista
// sale del token (req.nutricionistaId), nunca del body: decide qué privadas ve y
// es el dueño de las que da de alta y edita.

async function listRecommendations(req, res, next) {
  try {
    const recommendations = await recommendationService.list(req.nutricionistaId, req.validated.query);
    res.status(200).json(serializeRecommendations(recommendations));
  } catch (error) {
    next(error);
  }
}

async function getRecommendation(req, res, next) {
  try {
    const recommendation = await recommendationService.get(req.validated.params.id, req.nutricionistaId);
    res.status(200).json(serializeRecommendation(recommendation));
  } catch (error) {
    next(error);
  }
}

async function createRecommendation(req, res, next) {
  try {
    const recommendation = await recommendationService.create(req.nutricionistaId, req.validated.body);
    res.status(201).json(serializeRecommendation(recommendation));
  } catch (error) {
    next(error);
  }
}

async function updateRecommendation(req, res, next) {
  try {
    const recommendation = await recommendationService.update(
      req.validated.params.id,
      req.nutricionistaId,
      req.validated.body,
    );
    res.status(200).json(serializeRecommendation(recommendation));
  } catch (error) {
    next(error);
  }
}

module.exports = { listRecommendations, getRecommendation, createRecommendation, updateRecommendation };
