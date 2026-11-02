const { z } = require('zod');
const { MealType, FoodCategoryType, ConditionType, CookingMethod } = require('@prisma/client');
const { planProposalResponseSchema } = require('./iaProposal.schema');
const spec = require('./fixtures/ia.openapi.json');
const { CONTRACT_LIMITS } = require('../domain/generacion/allowedCatalog');
const { CONTEXT_TEXT_MAX_LENGTH } = require('../domain/generacion/buildContext');

// Se compara la validación, sin anotaciones de documentación. OpenAPI usa oneOf
// para los ítems discriminados y Zod anyOf; sus tags const son excluyentes.
const ANNOTATIONS = new Set(['title', 'description', 'default', 'examples', 'discriminator', '$schema']);

function validationShape(schema, document) {
  if (schema === null || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map((value) => validationShape(value, document));
  if (schema.$ref) {
    const referenced = schema.$ref.slice(2).split('/').reduce((value, key) => value[key], document);
    return validationShape(referenced, document);
  }
  const result = {};
  for (const key of Object.keys(schema).sort()) {
    if (ANNOTATIONS.has(key)) continue;
    const value = schema[key];
    if (key === 'properties') {
      result.properties = Object.fromEntries(Object.keys(value).sort().map((name) => [name, validationShape(value[name], document)]));
    } else if (key === 'anyOf' || key === 'oneOf') {
      result.union = value.map((branch) => validationShape(branch, document))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    } else if (key === 'enum' || key === 'required') result[key] = [...value].sort();
    else result[key] = validationShape(value, document);
  }
  return result;
}

describe('contrato backend ↔ IA (OpenAPI versionado, AUD-004)', () => {
  it.each(Object.entries({ MealType, FoodCategoryType, ConditionType, CookingMethod }))('%s coincide con Prisma', (name, values) => {
    expect([...spec.components.schemas[name].enum].sort()).toEqual(Object.values(values).sort());
  });

  it('la propuesta Zod mantiene campos, enums, límites y variantes del contrato de IA', () => {
    const backend = z.toJSONSchema(planProposalResponseSchema, { io: 'input' });
    const response = spec.paths['/plan-proposals'].post.responses['200'].content['application/json'].schema;
    const responseSchema = spec.components.schemas[response.$ref.split('/').at(-1)];
    expect(validationShape(backend.properties.proposal, backend))
      .toEqual(validationShape(responseSchema.properties.proposal, spec));
  });

  it('los topes del catálogo enviado respetan el contrato de entrada de IA', () => {
    const schemas = spec.components.schemas;
    expect(CONTRACT_LIMITS).toEqual({
      foods: schemas.Catalog.properties.foods.maxItems,
      groups: schemas.Catalog.properties.food_groups.maxItems,
      recipes: schemas.PlanProposalRequest.properties.candidate_recipes.maxItems,
    });
  });

  it('el tope de los textos de contexto coincide en todos los campos enviados', () => {
    const schemas = spec.components.schemas;
    for (const name of ['CookingContext', 'OutsideHomeContext', 'WorkContext', 'Habits']) {
      for (const field of Object.values(schemas[name].properties)) {
        const text = field.anyOf?.find((branch) => branch.type === 'string');
        if (text) expect(text.maxLength, `${name}: ${field.title}`).toBe(CONTEXT_TEXT_MAX_LENGTH);
      }
    }
  });
});
