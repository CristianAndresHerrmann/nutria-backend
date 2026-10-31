const { z } = require('zod');
const { loginSchema } = require('../schemas/auth.schema');
const { createNutritionistSchema, setNutritionistActiveSchema, resetNutritionistPasswordSchema } = require('../schemas/adminNutritionist.schema');
const { createPatientSchema } = require('../schemas/patient.schema');
const { createFoodSchema } = require('../schemas/food.schema');
const { createRecipeSchema, updateRecipeSchema, setRecipeAvailabilitySchema } = require('../schemas/recipe.schema');
const { createRecommendationSchema, updateRecommendationSchema } = require('../schemas/recommendation.schema');
const { patientConditionSchema } = require('../schemas/patientCondition.schema');
const { consultationSchema, createConsultationSchema } = require('../schemas/consultation.schema');
const { consultationMeasurementSchema, measurementSchema } = require('../schemas/measurement.schema');
const { generatePlanSchema, updatePlanSchema } = require('../schemas/plan.schema');
const annotations = require('./requestAnnotations.json');

// Mismos nombres que referencian las rutas. Los tipos, campos y límites salen
// del validador real; las respuestas siguen documentadas en components.js.
const requestValidators = {
  LoginRequest: loginSchema,
  NutritionistAccountInput: createNutritionistSchema,
  NutritionistActiveInput: setNutritionistActiveSchema,
  NutritionistPasswordInput: resetNutritionistPasswordSchema,
  PatientInput: createPatientSchema,
  FoodInput: createFoodSchema,
  RecipeInput: createRecipeSchema,
  RecipeUpdateInput: updateRecipeSchema,
  RecipeAvailabilityInput: setRecipeAvailabilitySchema,
  ClinicalRecommendationInput: createRecommendationSchema,
  ClinicalRecommendationUpdateInput: updateRecommendationSchema,
  PatientConditionInput: patientConditionSchema,
  ConsultationInput: consultationSchema,
  ConsultationCreateInput: createConsultationSchema,
  ConsultationMeasurementInput: consultationMeasurementSchema,
  MeasurementInput: measurementSchema,
  GeneratePlanInput: generatePlanSchema,
  PlanInput: updatePlanSchema,
};

function toRequestSchema(schema) {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    override({ zodSchema, jsonSchema }) {
      // optionalField convierte undefined a null. La opcionalidad declarada
      // por Zod no contempla ese preprocess; se consulta al validador del campo.
      if (zodSchema instanceof z.ZodObject) {
        const required = Object.entries(zodSchema.shape)
          .filter(([, field]) => !field.safeParse(undefined).success)
          .map(([name]) => name);
        if (required.length) jsonSchema.required = required;
        else delete jsonSchema.required;
      }
      // Zod omite algunos defaults cuando hay transformaciones anidadas, aun
      // cuando el valor por defecto (por ejemplo []) es representable en JSON.
      if (zodSchema instanceof z.ZodDefault && jsonSchema.default === undefined) {
        const parsed = zodSchema.safeParse(undefined);
        if (parsed.success) jsonSchema.default = parsed.data;
      }
      // Los normalizadores de texto validan longitud después de transformarlo
      // (catalogName, requiredText, nombre de cuenta). Se conservan esos topes,
      // aplicados al texto normalizado, además del tipo de entrada.
      if (zodSchema instanceof z.ZodPipe && zodSchema.out instanceof z.ZodString && jsonSchema.type === 'string') {
        Object.assign(jsonSchema, z.toJSONSchema(zodSchema.out, { target: 'openapi-3.0', io: 'input' }));
      }
    },
  });
}

function annotate(schema, notes, path) {
  const { properties, items, ...metadata } = notes;
  for (const key of Object.keys(metadata)) {
    if (!['description', 'example', 'format', 'uniqueItems'].includes(key)) {
      throw new Error(`La anotación ${path}.${key} debe derivarse de Zod`);
    }
  }
  Object.assign(schema, metadata);
  for (const [name, child] of Object.entries(properties ?? {})) {
    if (!schema.properties?.[name]) throw new Error(`Anotación OpenAPI sin campo: ${path}.${name}`);
    annotate(schema.properties[name], child, `${path}.${name}`);
  }
  if (items) {
    if (!schema.items) throw new Error(`Anotación OpenAPI sin items: ${path}`);
    annotate(schema.items, items, `${path}[]`);
  }
  return schema;
}

const requestSchemas = Object.fromEntries(Object.entries(requestValidators)
  .map(([name, schema]) => [name, annotate(toRequestSchema(schema), annotations[name] ?? {}, name)]));

module.exports = { requestSchemas, requestValidators, toRequestSchema };
