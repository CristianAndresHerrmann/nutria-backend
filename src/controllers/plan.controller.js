const planService = require('../services/plan.service');
const planGenerationService = require('../services/planGeneration.service');
const { serializePlan } = require('../serializers/plan.serializer');

// La validación la hace el middleware validate en la ruta. El nutricionista
// sale del token (req.nutricionistaId), nunca del body: es el filtro de todo
// plan que se genera, lee o edita.

async function generatePlan(req, res, next) {
  try {
    const plan = await planGenerationService.generate(req.validated.params.id, req.nutricionistaId, req.validated.body);
    res.status(201).json(serializePlan(plan));
  } catch (error) {
    next(error);
  }
}

async function listPlans(req, res, next) {
  try {
    const plans = await planService.list(req.validated.params.id, req.nutricionistaId);
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
}

async function getPlan(req, res, next) {
  try {
    const { id, planId } = req.validated.params;
    const plan = await planService.get(id, planId, req.nutricionistaId);
    res.status(200).json(serializePlan(plan));
  } catch (error) {
    next(error);
  }
}

async function updatePlan(req, res, next) {
  try {
    const { id, planId } = req.validated.params;
    const plan = await planService.update(id, planId, req.nutricionistaId, req.validated.body);
    res.status(200).json(serializePlan(plan));
  } catch (error) {
    next(error);
  }
}

module.exports = { generatePlan, listPlans, getPlan, updatePlan };
