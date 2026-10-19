const patientConditionService = require('../services/patientCondition.service');

// La validación la hace el middleware validate en la ruta. El nutricionista
// sale del token (req.nutricionistaId), nunca del body: el servicio filtra el
// paciente y sus condiciones por él.

async function listConditions(req, res, next) {
  try {
    const conditions = await patientConditionService.list(req.validated.params.id, req.nutricionistaId);
    res.status(200).json(conditions);
  } catch (error) {
    next(error);
  }
}

async function createCondition(req, res, next) {
  try {
    const condition = await patientConditionService.create(
      req.validated.params.id,
      req.nutricionistaId,
      req.validated.body,
    );
    res.status(201).json(condition);
  } catch (error) {
    next(error);
  }
}

async function updateCondition(req, res, next) {
  try {
    const { id, conditionId } = req.validated.params;
    const condition = await patientConditionService.update(conditionId, id, req.nutricionistaId, req.validated.body);
    res.status(200).json(condition);
  } catch (error) {
    next(error);
  }
}

async function deleteCondition(req, res, next) {
  try {
    const { id, conditionId } = req.validated.params;
    await patientConditionService.remove(conditionId, id, req.nutricionistaId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = { listConditions, createCondition, updateCondition, deleteCondition };
