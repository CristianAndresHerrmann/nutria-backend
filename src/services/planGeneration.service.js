const { AiGenerationResult } = require('@prisma/client');
const config = require('../config/env');
const iaClient = require('../clients/ia.client');
const { iaUnavailable } = require('../clients/ia.client');
const planRepository = require('../repositories/plan.repository');
const patientRepository = require('../repositories/patient.repository');
const clinicalRuleRepository = require('../repositories/clinicalRule.repository');
const planValidationService = require('./planValidation.service');
const AppError = require('../utils/AppError');
const { PATIENT_NOT_FOUND_MESSAGE } = require('./patient.service');
const { allowedCatalog } = require('../domain/generacion/allowedCatalog');
const { buildGenerationContext } = require('../domain/generacion/buildContext');
const { resolveProposal, proposalMatchesMealTypes } = require('../domain/generacion/resolveProposal');
const { validationResult } = require('../domain/reglas/validatePlan');
const { planProposalResponseSchema, generationInfoSchema } = require('../schemas/iaProposal.schema');

const PLAN_PROPOSALS_PATH = '/plan-proposals';

// Cómo terminó la llamada al proveedor, según el reason del error controlado.
// Las fallas sin datos del proveedor (servicio caído, timeout del backend) no
// tienen con qué registrarse: quedan solo en el log.
const FAILED_RESULTS = {
  provider_timeout: AiGenerationResult.timeout,
  provider_error: AiGenerationResult.provider_error,
  invalid_output: AiGenerationResult.invalid_response,
};

// Columnas de ai_generation a partir de details.generation del servicio.
function generationRow(info, contextSent) {
  return {
    contextSent,
    provider: info.provider,
    model: info.model,
    templateVersion: info.template_version,
    durationMs: info.duration_ms,
    inputTokens: info.input_tokens ?? null,
    outputTokens: info.output_tokens ?? null,
    rawResponse: info.raw_response ?? null,
  };
}

// Generación asistida del plan (RF-34, RF-37, RF-38, RF-41, RF-43; T37):
//   1. Arma el contexto mínimo y anonimizado (RNF-07) con el catálogo permitido.
//   2. Llama a nutria-ia, fuera de toda transacción.
//   3. Valida la respuesta contra el contrato, la resuelve a ítems y la pasa por
//      el motor de reglas.
//   4. Guarda el borrador, sus ítems, sus hallazgos y la traza en una sola
//      transacción (RNF-02: nunca queda un plan a medias).
// Si la IA falla, responde 503 IA_UNAVAILABLE con reason y no crea ningún plan;
// la traza de la falla queda sin plan cuando el servicio informó la llamada al
// proveedor (DA-31). El paciente sale del filtro por el nutricionista del token
// (RNF-05): uno ajeno da 404 sin llamar a la IA.
function createPlanGenerationService({
  planRepository: plans,
  patientRepository: patients,
  clinicalRuleRepository: clinicalRules,
  planValidationService: validation,
  iaClient: ia,
  generationTimeoutMs,
}) {
  // La traza de una falla no puede tapar el error de la IA: si no se puede
  // escribir, queda en el log y el cliente recibe igual el 503.
  async function recordFailure(patientId, nutritionistId, reason, info, contextSent) {
    const parsed = generationInfoSchema.safeParse(info);
    // Una respuesta inválida se registra con la respuesta cruda
    // (ai_generation_response_chk): sin ella no hay traza que guardar.
    if (!parsed.success || (reason === 'invalid_output' && !parsed.data.raw_response)) {
      console.error(`generación: la falla ${reason} no trae datos válidos de la llamada al proveedor`);
      return;
    }
    try {
      await plans.recordFailedGeneration(patientId, nutritionistId, {
        ...generationRow(parsed.data, contextSent),
        result: FAILED_RESULTS[reason],
      });
    } catch (error) {
      console.error('generación: no se pudo registrar la traza de la falla', error);
    }
  }

  // Una falla sin datos del proveedor (servicio caído, timeout del backend,
  // respuesta ilegible) no puede ir a ai_generation (DA-31). Queda como una
  // línea JSON en el log, para contarla junto con las trazas (RNF-11). Solo el id
  // interno del paciente: ningún dato suyo.
  function logUntracedFailure(patientId, reason, startedAt) {
    console.warn(
      JSON.stringify({ event: 'ai_generation_untraced', reason, patientId, durationMs: Date.now() - startedAt }),
    );
  }

  async function requestProposal(patientId, nutritionistId, context) {
    const startedAt = Date.now();
    try {
      return await ia.postJson(PLAN_PROPOSALS_PATH, context, { timeoutMs: generationTimeoutMs });
    } catch (error) {
      const reason = error.details?.reason;
      if (error.generation && FAILED_RESULTS[reason]) {
        await recordFailure(patientId, nutritionistId, reason, error.generation, context);
      } else if (error.code === 'IA_UNAVAILABLE') {
        logUntracedFailure(patientId, reason, startedAt);
      }
      throw error;
    }
  }

  return {
    async generate(patientId, nutritionistId, { mealTypes }) {
      const patient = await patients.findByIdForNutritionist(patientId, nutritionistId);
      if (!patient) throw new AppError(404, PATIENT_NOT_FOUND_MESSAGE);

      const inputs = await validation.loadInputs(patientId, nutritionistId);
      const pathologyIds = inputs.conditions.map(({ pathologyId }) => pathologyId).filter(Boolean);
      const prohibitedRules = await clinicalRules.findActiveProhibitedForPathologies(pathologyIds);

      const allowed = allowedCatalog({
        ...inputs.catalog,
        conditions: inputs.conditions,
        prohibitedRules,
        mealTypes,
        cooks: patient.cooks,
      });
      const { context, codes } = buildGenerationContext({
        patient,
        conditions: inputs.conditions,
        catalog: allowed,
        mealTypes,
      });

      const response = await requestProposal(patientId, nutritionistId, context);

      const parsed = planProposalResponseSchema.safeParse(response);
      if (!parsed.success || !proposalMatchesMealTypes(parsed.data.proposal, mealTypes)) {
        await recordFailure(patientId, nutritionistId, 'invalid_output', response?.generation, context);
        throw iaUnavailable('invalid_output');
      }

      const { fields, meals } = resolveProposal(parsed.data.proposal, codes);
      const findings = validation.computeFindings({ meals }, inputs);

      return plans.createGenerated(nutritionistId, {
        patientId,
        fields,
        meals,
        findings,
        generation: {
          ...generationRow(parsed.data.generation, context),
          result: AiGenerationResult.success,
          validationResult: validationResult(findings),
        },
      });
    },
  };
}

module.exports = createPlanGenerationService({
  planRepository,
  patientRepository,
  clinicalRuleRepository,
  planValidationService,
  iaClient,
  generationTimeoutMs: config.iaGenerationTimeoutMs,
});
module.exports.createPlanGenerationService = createPlanGenerationService;
