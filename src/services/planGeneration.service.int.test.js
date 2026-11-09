const recipes = require('../repositories/recipe.repository');
const planRepository = require('../repositories/plan.repository');
const patientRepository = require('../repositories/patient.repository');
const recommendationRepository = require('../repositories/recommendation.repository');
const planValidationService = require('./planValidation.service');
const { createPlanGenerationService } = require('./planGeneration.service');
const { prisma, createCatalog, createTenant } = require('../test/integration');

// La generación con los repositorios reales y Postgres: solo el cliente de IA es un
// fake, que guarda lo que recibe. Lo que no llega en candidate_recipes, la IA no lo
// puede proponer por código (RF-37).
const GENERATION = {
  provider: 'fake',
  model: 'fake-test',
  template_version: 'plan_proposal_v4',
  duration_ms: 1,
  input_tokens: 1,
  output_tokens: 1,
  reasoning_tokens: 0,
  raw_response: '{}',
};

function setup() {
  const contexts = [];
  const iaClient = {
    postJson: async (_path, context) => {
      contexts.push(context);
      return {
        proposal: {
          situational_diagnosis: 'Diagnóstico ficticio',
          introduction: 'Introducción ficticia',
          objectives: 'Objetivos ficticios',
          general_recommendations: 'Generales ficticias',
          contextual_recommendations: 'Contextuales ficticias',
          thematic_recommendations: 'Temáticas ficticias',
          meals: context.meal_types.map((mealType) => ({
            meal_type: mealType,
            instructions: null,
            options: context.candidate_recipes.map(({ code }) => ({
              description: null,
              items: [{ type: 'recipe', code }],
            })),
          })),
        },
        generation: GENERATION,
      };
    },
  };
  const service = createPlanGenerationService({
    planRepository,
    patientRepository,
    recommendationRepository,
    planValidationService,
    iaClient,
    generationTimeoutMs: 1000,
  });
  return { service, contexts };
}

const LUNCH = { mealTypes: ['lunch'] };
const candidateNames = (context) => context.candidate_recipes.map(({ name }) => name);

describe('generación del plan — candidatas reales por nutricionista (RNF-05)', () => {
  let catalog;
  let first;
  let second;

  beforeEach(async () => {
    catalog = await createCatalog();
    first = await createTenant('primero');
    second = await createTenant('segundo');
    await recipes.upsertCommon({ name: 'Receta común ficticia' }, [{ foodId: catalog.food.id }], ['lunch']);
    await recipes.create(first.nutritionist.id, { name: 'Receta privada de la primera cuenta' }, [{ foodId: catalog.food.id }], ['lunch']);
    await recipes.create(second.nutritionist.id, { name: 'Receta privada de la segunda cuenta' }, [{ foodId: catalog.food.id }], ['lunch']);
  });

  it('cada cuenta ofrece a la IA las comunes y las suyas, nunca las privadas de otra', async () => {
    const { service, contexts } = setup();

    await service.generate(second.patient.id, second.nutritionist.id, LUNCH);
    await service.generate(first.patient.id, first.nutritionist.id, LUNCH);

    expect(candidateNames(contexts[0]).sort()).toEqual(['Receta común ficticia', 'Receta privada de la segunda cuenta']);
    expect(candidateNames(contexts[1]).sort()).toEqual(['Receta común ficticia', 'Receta privada de la primera cuenta']);
  });

  it('el plan guardado y su traza no contienen recetas privadas de otra cuenta', async () => {
    const { service } = setup();

    const plan = await service.generate(second.patient.id, second.nutritionist.id, LUNCH);

    const items = await prisma.optionItem.findMany({
      where: { option: { planMeal: { planId: plan.id } } },
      include: { recipe: { select: { name: true, nutritionistId: true } } },
    });
    expect(items).toHaveLength(2);
    for (const { recipe } of items) expect([null, second.nutritionist.id]).toContain(recipe.nutritionistId);

    const trace = await prisma.aiGeneration.findFirstOrThrow({ where: { planId: plan.id } });
    expect(JSON.stringify(trace.contextSent)).not.toContain('Receta privada de la primera cuenta');
  });

  it('un paciente de otra cuenta da 404 y no llama a la IA', async () => {
    const { service, contexts } = setup();

    await expect(service.generate(first.patient.id, second.nutritionist.id, LUNCH)).rejects.toMatchObject({ status: 404 });
    expect(contexts).toEqual([]);
  });

  it('no ofrece las recetas alcanzadas por una regla prohibitiva de la patología, y sí las que solo se moderan', async () => {
    const prohibited = await prisma.food.create({ data: { name: 'Alimento prohibido ficticio', foodGroupId: catalog.group.id } });
    const moderated = await prisma.food.create({ data: { name: 'Alimento a moderar ficticio', foodGroupId: catalog.group.id } });
    await recipes.upsertCommon({ name: 'Común con prohibido' }, [{ foodId: prohibited.id }], ['lunch']);
    await recipes.upsertCommon({ name: 'Común a moderar' }, [{ foodId: moderated.id }], ['lunch']);
    await prisma.patientCondition.create({ data: { patientId: second.patient.id, type: 'pathology', pathologyId: catalog.pathology.id } });
    await prisma.clinicalRule.createMany({
      data: [
        { pathologyId: catalog.pathology.id, foodId: prohibited.id, severity: 'prohibited', source: 'Fuente ficticia, p. 1' },
        { pathologyId: catalog.pathology.id, foodId: moderated.id, severity: 'moderate', source: 'Fuente ficticia, p. 2' },
      ],
    });
    const { service, contexts } = setup();

    await service.generate(second.patient.id, second.nutritionist.id, LUNCH);
    expect(candidateNames(contexts[0])).toContain('Común a moderar');
    expect(candidateNames(contexts[0])).not.toContain('Común con prohibido');

    // Sin la patología, la misma receta sí se ofrece.
    await service.generate(first.patient.id, first.nutritionist.id, LUNCH);
    expect(candidateNames(contexts[1])).toContain('Común con prohibido');
  });

  it('copia al plan las recomendaciones vigentes de la patología: comunes y propias, nunca las de otra cuenta (DA-43)', async () => {
    await prisma.patientCondition.create({ data: { patientId: second.patient.id, type: 'pathology', pathologyId: catalog.pathology.id } });
    await prisma.clinicalRecommendation.createMany({
      data: [
        { pathologyId: catalog.pathology.id, title: 'Común ficticia', text: 'Texto común.' },
        { pathologyId: catalog.pathology.id, title: 'Común dada de baja', text: 'No va.', active: false },
        { pathologyId: catalog.pathology.id, nutritionistId: second.nutritionist.id, title: 'Propia ficticia', text: 'Texto propio.' },
        { pathologyId: catalog.pathology.id, nutritionistId: first.nutritionist.id, title: 'De otra cuenta', text: 'No va.' },
      ],
    });
    const { service } = setup();

    const plan = await service.generate(second.patient.id, second.nutritionist.id, LUNCH);

    const saved = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(saved.clinicalRecommendations).toBe('Común ficticia\nTexto común.\n\nPropia ficticia\nTexto propio.');
  });
});
