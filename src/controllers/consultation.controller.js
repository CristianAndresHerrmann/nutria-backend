const consultationService = require('../services/consultation.service');

// La validación la hace el middleware validate en la ruta. El nutricionista
// sale del token (req.nutricionistaId), nunca del body: el servicio filtra el
// paciente y sus consultas por él.

async function listConsultations(req, res, next) {
  try {
    const consultations = await consultationService.list(req.validated.params.id, req.nutricionistaId);
    res.status(200).json(consultations);
  } catch (error) {
    next(error);
  }
}

async function getConsultation(req, res, next) {
  try {
    const { id, consultationId } = req.validated.params;
    const consultation = await consultationService.get(consultationId, id, req.nutricionistaId);
    res.status(200).json(consultation);
  } catch (error) {
    next(error);
  }
}

async function createConsultation(req, res, next) {
  try {
    const consultation = await consultationService.create(
      req.validated.params.id,
      req.nutricionistaId,
      req.validated.body,
    );
    res.status(201).json(consultation);
  } catch (error) {
    next(error);
  }
}

async function updateConsultation(req, res, next) {
  try {
    const { id, consultationId } = req.validated.params;
    const consultation = await consultationService.update(
      consultationId,
      id,
      req.nutricionistaId,
      req.validated.body,
    );
    res.status(200).json(consultation);
  } catch (error) {
    next(error);
  }
}

module.exports = { listConsultations, getConsultation, createConsultation, updateConsultation };
