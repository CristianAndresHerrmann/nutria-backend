const { z } = require('zod');
const { MealType } = require('@prisma/client');

// Respuesta de POST /plan-proposals de nutria-ia (contrato de T33, DA-28). El
// servicio ya valida la salida del proveedor, pero el backend no confía en eso:
// lo que no respeta el contrato no llega a la base. Mismos topes que los modelos
// Pydantic de app/schemas/plan_proposal.py; la propuesta es estricta como allá
// (extra="forbid"). Pydantic serializa los opcionales ausentes como null.
const code = z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/);
const proposalText = z.string().trim().min(1).max(4000);
const shortText = z.string().trim().min(1).max(500).nullish();

const proposalItemSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('food'), code }),
  z.strictObject({ type: z.literal('food_group'), code }),
  z.strictObject({ type: z.literal('recipe'), code }),
  z.strictObject({ type: z.literal('free_text'), text: z.string().trim().min(1).max(200) }),
]);

const proposedMealSchema = z.strictObject({
  meal_type: z.enum(Object.values(MealType)),
  instructions: shortText,
  options: z
    .array(z.strictObject({ description: shortText, items: z.array(proposalItemSchema).min(1).max(15) }))
    .min(1)
    .max(10),
});

const planProposalSchema = z.strictObject({
  situational_diagnosis: proposalText,
  introduction: proposalText,
  objectives: proposalText,
  general_recommendations: proposalText,
  contextual_recommendations: proposalText,
  thematic_recommendations: proposalText,
  meals: z.array(proposedMealSchema).min(1).max(4),
});

// Datos de la llamada al proveedor que se registran en ai_generation (RF-41,
// RNF-11). raw_response es null solo si el proveedor no respondió.
const generationInfoSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  template_version: z.string().min(1),
  duration_ms: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative().nullish(),
  output_tokens: z.number().int().nonnegative().nullish(),
  raw_response: z.string().nullish(),
});

// Una propuesta usable siempre trae la respuesta cruda (ai_generation_response_chk).
const planProposalResponseSchema = z.object({
  proposal: planProposalSchema,
  generation: generationInfoSchema.extend({ raw_response: z.string() }),
});

module.exports = { planProposalResponseSchema, generationInfoSchema };
