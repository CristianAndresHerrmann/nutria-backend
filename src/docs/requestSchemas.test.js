const { z } = require('zod');
const { optionalField } = require('../schemas/common.schema');
const { requestSchemas, toRequestSchema } = require('./requestSchemas');
const spec = require('./openapi');

describe('cuerpos OpenAPI derivados de Zod (AUD-005)', () => {
  it('un campo nuevo y sus restricciones aparecen sin una segunda definición', () => {
    const initial = z.strictObject({ title: z.string().min(1).max(12) });
    const changed = initial.extend({ state: z.enum(['draft', 'ready']) });

    const documented = toRequestSchema(changed);

    expect(documented).toMatchObject({
      type: 'object', additionalProperties: false, required: ['title', 'state'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 12 },
        state: { type: 'string', enum: ['draft', 'ready'] },
      },
    });
  });

  it('distingue ausencia, nullable y defaults aunque haya un preprocess', () => {
    const validator = z.strictObject({
      title: z.string(),
      note: optionalField(z.string().max(7)),
      amount: optionalField(z.coerce.number().positive()),
      active: z.boolean().default(false),
    });
    expect(validator.parse({ title: 'Ejemplo' })).toEqual({ title: 'Ejemplo', note: null, amount: null, active: false });

    expect(toRequestSchema(validator)).toMatchObject({
      required: ['title'],
      properties: {
        note: { type: 'string', nullable: true, maxLength: 7 },
        amount: { type: 'number', nullable: true, minimum: 0, exclusiveMinimum: true },
        active: { type: 'boolean', default: false },
      },
    });
  });

  it('no oculta tipos que no se pueden representar en OpenAPI', () => {
    expect(() => toRequestSchema(z.strictObject({ unsupported: z.map(z.string(), z.string()) }))).toThrow();
  });

  it('el paciente solo exige nombre y apellido y conserva la regla del responsable', () => {
    const patient = requestSchemas.PatientInput;
    expect(patient.required).toEqual(['firstName', 'lastName']);
    expect(patient.properties.birthDate).toMatchObject({ type: 'string', nullable: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
    expect(patient.properties.birthDate.example).toBe('1992-03-14');
    expect(patient.description).toContain('menor de 18 años');
    expect(patient.description).toContain('guardianContact');
  });

  it('conserva los límites aplicados después de normalizar los textos', () => {
    expect(requestSchemas.NutritionistAccountInput.properties.name).toMatchObject({ minLength: 1, maxLength: 100 });
    expect(requestSchemas.FoodInput.properties.name).toMatchObject({ minLength: 1, maxLength: 100 });
    expect(requestSchemas.ClinicalRecommendationInput.properties.title).toMatchObject({ minLength: 1, maxLength: 150 });
    expect(requestSchemas.ClinicalRecommendationInput.properties.text).toMatchObject({ minLength: 1, maxLength: 5000 });
  });

  it('los opcionales anidados tampoco se vuelven obligatorios', () => {
    const recipe = requestSchemas.RecipeInput;
    expect(recipe.required).toEqual(['name', 'mealTypes', 'ingredients']);
    expect(recipe.properties.ingredients).toMatchObject({ minItems: 1, maxItems: 50 });
    expect(recipe.properties.ingredients.items.required).toEqual(['foodId']);
    expect(recipe.properties.ingredients.items.properties.quantityDescription).toMatchObject({ nullable: true, maxLength: 200 });
    expect(recipe.properties.mealTypes.uniqueItems).toBe(true);
  });

  it('la consulta de alta documenta sus hijos en el mismo objeto estricto', () => {
    const consultation = requestSchemas.ConsultationCreateInput;
    expect(consultation.allOf).toBeUndefined();
    expect(consultation.required).toEqual(['date', 'type']);
    expect(consultation.additionalProperties).toBe(false);
    expect(consultation.properties.habits).toMatchObject({ maxItems: 20, default: [] });
    expect(consultation.properties.habits.items.properties.description).toMatchObject({ minLength: 1, maxLength: 500 });
    expect(consultation.properties.measurements).toMatchObject({ maxItems: 30, default: [] });
    expect(consultation.properties.measurements.items.required).toEqual(['type', 'value']);
  });

  it('las mediciones documentan fecha de entrada, límites y reglas cruzadas', () => {
    const measurement = requestSchemas.MeasurementInput;
    expect(measurement.required).toEqual(['type', 'value', 'date']);
    expect(measurement.properties.date).toMatchObject({ type: 'string', format: 'date' });
    expect(measurement.properties.value).toMatchObject({ minimum: 0, exclusiveMinimum: true, maximum: 999999.99 });
    expect(measurement.properties.detail.description).toContain('skinfold');
    expect(measurement.properties.consultationId.description).toContain('mismo paciente');
  });

  it('documenta cada variante de ítem con su referencia obligatoria y sus propios campos', () => {
    const meal = requestSchemas.PlanInput.properties.meals.items;
    const option = meal.properties.options.items;
    const item = option.properties.items.items;
    expect(requestSchemas.PlanInput.required).toEqual(['meals']);
    expect(meal.required).toEqual(['mealType', 'options']);
    expect(option.required).toEqual(['items']);
    expect(option.properties.items.maxItems).toBe(15);
    const variants = item.oneOf ?? item.anyOf;
    expect(variants).toHaveLength(4);
    for (const [type, reference] of Object.entries({ food: 'foodId', food_group: 'foodGroupId', recipe: 'recipeId', unrecognized: 'originalText' })) {
      const variant = variants.find((candidate) => candidate.properties.type.enum?.includes(type));
      expect(variant.required).toEqual(['type', reference]);
      expect(variant.additionalProperties).toBe(false);
      expect(Object.keys(variant.properties)).toEqual(['type', reference]);
    }
  });

  it('el PATCH de receta documenta solo la disponibilidad obligatoria y sin campos extra', () => {
    expect(requestSchemas.RecipeAvailabilityInput).toMatchObject({
      type: 'object', additionalProperties: false, required: ['availableInCatalog'],
      properties: { availableInCatalog: { type: 'boolean' } },
    });
    expect(Object.keys(requestSchemas.RecipeAvailabilityInput.properties)).toEqual(['availableInCatalog']);
  });

  it('todas las operaciones con body referencian un schema generado', () => {
    let bodies = 0;
    for (const operations of Object.values(spec.paths)) {
      for (const operation of Object.values(operations)) {
        if (!operation.requestBody) continue;
        const name = operation.requestBody.content['application/json'].schema.$ref.split('/').at(-1);
        expect(requestSchemas[name], name).toBeDefined();
        expect(spec.components.schemas[name]).toEqual(requestSchemas[name]);
        bodies += 1;
      }
    }
    expect(bodies).toBeGreaterThan(0);
  });
});
