const { randomUUID } = require('node:crypto');
const plans = require('./plan.repository');
const { prisma, snapshotDatabase, createTenant, draftContent, generationData } = require('../test/integration');

let owner;
let other;

beforeEach(async () => {
  owner = await createTenant('owner');
  other = await createTenant('other');
});

function createGenerated(content = draftContent(), generation = generationData()) {
  return plans.createGenerated(owner.nutritionist.id, { patientId: owner.patient.id, ...content, generation });
}

describe('planes contra Postgres — atomicidad y aislamiento', () => {
  it('guarda juntos el borrador incompleto, sus hijos, hallazgos y traza', async () => {
    const content = draftContent();
    const saved = await createGenerated(content);
    const stored = await plans.findByIdForPatient(saved.id, owner.patient.id, owner.nutritionist.id);

    expect(stored).toEqual(saved);
    expect(stored).toMatchObject({ status: 'draft', introduction: content.fields.introduction, objectives: null });
    expect(stored.meals[0].options[0].items).toMatchObject(content.meals[0].options[0].items);
    expect(stored.findings).toMatchObject(content.findings);
    const trace = await prisma.aiGeneration.findFirst({ where: { planId: saved.id } });
    expect(trace).toMatchObject({ ...generationData(), patientId: owner.patient.id, nutritionistId: owner.nutritionist.id });
  });

  it.each(['finding', 'generation'])('createGenerated revierte todo si falla %s después de crear los hijos', async (failure) => {
    const content = draftContent();
    const generation = generationData();
    if (failure === 'finding') content.findings[0].optionItemId = randomUUID();
    else generation.durationMs = -1;
    const before = await snapshotDatabase();

    const operation = createGenerated(content, generation);
    if (failure === 'finding') await expect(operation).rejects.toMatchObject({ code: 'P2003' });
    else await expect(operation).rejects.toThrow('ai_generation_metrics_chk');

    expect(await snapshotDatabase()).toEqual(before);
  });

  it('replaceDraft reemplaza hijos y hallazgos, conserva la traza y permite guardar sin comidas', async () => {
    const original = await createGenerated();
    const replacement = draftContent();
    replacement.fields.introduction = 'Edición ficticia';
    const saved = await plans.replaceDraft(original.id, owner.patient.id, owner.nutritionist.id, replacement);

    expect(saved.introduction).toBe('Edición ficticia');
    expect(saved.meals[0].id).toBe(replacement.meals[0].id);
    expect(saved.findings).toMatchObject(replacement.findings);
    expect(await prisma.optionItem.findUnique({ where: { id: original.meals[0].options[0].items[0].id } })).toBeNull();
    expect(await prisma.aiGeneration.count({ where: { planId: original.id } })).toBe(1);

    const empty = await plans.replaceDraft(original.id, owner.patient.id, owner.nutritionist.id, {
      fields: { introduction: null }, meals: [], findings: [],
    });
    expect(empty).toMatchObject({ introduction: null, meals: [], findings: [] });
  });

  it.each(['meal', 'finding'])('replaceDraft restaura textos, hijos y hallazgos si falla %s tras borrarlos', async (failure) => {
    const original = await createGenerated();
    const replacement = draftContent();
    replacement.fields.introduction = 'No debe persistir';
    if (failure === 'meal') {
      // La primera comida ya se insertó cuando la segunda viola la unicidad.
      replacement.meals.push({ id: randomUUID(), mealType: 'lunch', options: [] });
    } else replacement.findings[0].optionItemId = randomUUID();
    const before = await snapshotDatabase();

    await expect(plans.replaceDraft(original.id, owner.patient.id, owner.nutritionist.id, replacement))
      .rejects.toMatchObject({ code: failure === 'meal' ? 'P2002' : 'P2003' });

    expect(await snapshotDatabase()).toEqual(before);
  });

  it('un nutricionista ajeno no lee, reemplaza ni revalida un plan', async () => {
    const original = await createGenerated();
    const before = await snapshotDatabase();
    const foreignId = other.nutritionist.id;

    expect(await plans.findAllForPatient(owner.patient.id, foreignId)).toEqual([]);
    expect(await plans.findByIdForPatient(original.id, owner.patient.id, foreignId)).toBeNull();
    expect(await plans.replaceDraft(original.id, owner.patient.id, foreignId, draftContent())).toBeNull();
    expect(await plans.replaceFindings(original.id, foreignId, [])).toBeNull();
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('un plan tampoco se encuentra bajo otro paciente del mismo nutricionista', async () => {
    const original = await createGenerated();
    const sibling = await prisma.patient.create({ data: { firstName: 'Otro ficticio', lastName: 'Prueba', nutritionistId: owner.nutritionist.id } });
    const before = await snapshotDatabase();

    expect(await plans.findByIdForPatient(original.id, sibling.id, owner.nutritionist.id)).toBeNull();
    expect(await plans.replaceDraft(original.id, sibling.id, owner.nutritionist.id, draftContent())).toBeNull();
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('createManyAndReturn devuelve los hallazgos persistidos y elimina los anteriores', async () => {
    const original = await createGenerated();
    const findings = [{ type: 'composition', severity: 'warning', optionId: original.meals[0].options[0].id, message: 'Composición ficticia' }];

    const returned = await plans.replaceFindings(original.id, owner.nutritionist.id, findings);

    expect(returned).toHaveLength(1);
    expect(returned).toMatchObject(findings);
    expect(await prisma.finding.findMany({ where: { planId: original.id } })).toEqual(returned);
    expect(await prisma.finding.findUnique({ where: { id: original.findings[0].id } })).toBeNull();
  });

  it('las FK compuestas rechazan planes y trazas sobre un paciente ajeno', async () => {
    const before = await snapshotDatabase();
    await expect(plans.createGenerated(other.nutritionist.id, {
      patientId: owner.patient.id, ...draftContent(), generation: generationData(),
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(plans.recordFailedGeneration(owner.patient.id, other.nutritionist.id,
      generationData({ result: 'timeout', rawResponse: null, validationResult: null })))
      .rejects.toMatchObject({ code: 'P2003' });
    expect(await snapshotDatabase()).toEqual(before);
  });
});

describe('ai_generation — CHECK de las migraciones', () => {
  it.each([
    ['durationMs', -1, 'ai_generation_metrics_chk'],
    ['inputTokens', -1, 'ai_generation_metrics_chk'],
    ['outputTokens', -1, 'ai_generation_metrics_chk'],
    ['rawResponse', null, 'ai_generation_response_chk'],
    ['planId', null, 'ai_generation_plan_chk'],
  ])('rechaza %s = %s', async (field, value, constraint) => {
    const plan = await prisma.plan.create({ data: { patientId: owner.patient.id, nutritionistId: owner.nutritionist.id } });
    const before = await snapshotDatabase();
    await expect(prisma.aiGeneration.create({ data: {
      ...generationData(), patientId: owner.patient.id, nutritionistId: owner.nutritionist.id, planId: plan.id,
      [field]: value,
    } })).rejects.toThrow(constraint);
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('invalid_response también exige respuesta cruda', async () => {
    await expect(plans.recordFailedGeneration(owner.patient.id, owner.nutritionist.id,
      generationData({ result: 'invalid_response', rawResponse: null, validationResult: null })))
      .rejects.toThrow('ai_generation_response_chk');
  });

  it('una falla no admite resultado de validación ni plan', async () => {
    await expect(plans.recordFailedGeneration(owner.patient.id, owner.nutritionist.id,
      generationData({ result: 'timeout', rawResponse: null }))).rejects.toThrow('ai_generation_validation_chk');
    const plan = await prisma.plan.create({ data: { patientId: owner.patient.id, nutritionistId: owner.nutritionist.id } });
    await expect(prisma.aiGeneration.create({ data: {
      ...generationData({ result: 'provider_error', rawResponse: null, validationResult: null }),
      patientId: owner.patient.id, nutritionistId: owner.nutritionist.id, planId: plan.id,
    } })).rejects.toThrow('ai_generation_plan_chk');
  });

  it.each(['timeout', 'provider_error', 'invalid_response'])('guarda una falla %s sin plan', async (result) => {
    const trace = await plans.recordFailedGeneration(owner.patient.id, owner.nutritionist.id,
      generationData({ result, rawResponse: result === 'invalid_response' ? 'respuesta ficticia inválida' : null, validationResult: null }));
    expect(trace).toMatchObject({ result, planId: null, patientId: owner.patient.id, nutritionistId: owner.nutritionist.id });
    expect(await prisma.aiGeneration.findUnique({ where: { id: trace.id } })).toEqual(trace);
  });
});
