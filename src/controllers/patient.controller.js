const patientService = require('../services/patient.service');
const { createPatientSchema, updatePatientSchema } = require('../schemas/patient.schema');
const { serializePatient, serializePatients } = require('../serializers/patient.serializer');
const AppError = require('../utils/AppError');

// undefined cuando ningún issue apunta a un campo puntual (ej. una clave no
// reconocida por el .strictObject) — así AppError no adjunta un `fields: {}`
// vacío que no aporta nada sobre el error.
function fieldsFromZodError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key && !(key in fields)) fields[key] = issue.message;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

function parseOrThrow(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || 'Datos inválidos', fieldsFromZodError(parsed.error));
  }
  return parsed.data;
}

async function getPatients(req, res, next) {
  try {
    const patients = await patientService.listForNutritionist(req.nutricionistaId);
    res.status(200).json(serializePatients(patients));
  } catch (error) {
    next(error);
  }
}

async function getPatientById(req, res, next) {
  try {
    const patient = await patientService.getForNutritionist(req.params.id, req.nutricionistaId);
    res.status(200).json(serializePatient(patient));
  } catch (error) {
    next(error);
  }
}

async function createPatient(req, res, next) {
  try {
    const data = parseOrThrow(createPatientSchema, req.body);
    const patient = await patientService.createForNutritionist(req.nutricionistaId, data);
    res.status(201).json(serializePatient(patient));
  } catch (error) {
    next(error);
  }
}

async function updatePatient(req, res, next) {
  try {
    const data = parseOrThrow(updatePatientSchema, req.body);
    const patient = await patientService.updateForNutritionist(req.params.id, req.nutricionistaId, data);
    res.status(200).json(serializePatient(patient));
  } catch (error) {
    next(error);
  }
}

module.exports = { getPatients, getPatientById, createPatient, updatePatient };
