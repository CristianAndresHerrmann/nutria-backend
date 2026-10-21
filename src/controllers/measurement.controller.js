const measurementService = require('../services/measurement.service');

// La validación la hace el middleware validate en la ruta. El nutricionista
// sale del token (req.nutricionistaId), nunca del body: el servicio filtra el
// paciente y sus mediciones por él.

async function listMeasurements(req, res, next) {
  try {
    const measurements = await measurementService.list(req.validated.params.id, req.nutricionistaId);
    res.status(200).json(measurements);
  } catch (error) {
    next(error);
  }
}

async function createMeasurement(req, res, next) {
  try {
    const measurement = await measurementService.create(
      req.validated.params.id,
      req.nutricionistaId,
      req.validated.body,
    );
    res.status(201).json(measurement);
  } catch (error) {
    next(error);
  }
}

async function updateMeasurement(req, res, next) {
  try {
    const { id, measurementId } = req.validated.params;
    const measurement = await measurementService.update(measurementId, id, req.nutricionistaId, req.validated.body);
    res.status(200).json(measurement);
  } catch (error) {
    next(error);
  }
}

async function deleteMeasurement(req, res, next) {
  try {
    const { id, measurementId } = req.validated.params;
    await measurementService.remove(measurementId, id, req.nutricionistaId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = { listMeasurements, createMeasurement, updateMeasurement, deleteMeasurement };
