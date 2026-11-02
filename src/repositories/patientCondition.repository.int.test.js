const conditions = require('./patientCondition.repository');
const { prisma, createCatalog, createTenant, snapshotDatabase } = require('../test/integration');

let catalog;
let owner;
let other;

beforeEach(async () => {
  catalog = await createCatalog();
  owner = await createTenant('owner');
  other = await createTenant('other');
});

it('filtra lecturas, duplicados y escrituras por la relación patient.nutritionistId', async () => {
  const data = { type: 'allergy', pathologyId: null, foodId: catalog.food.id, foodGroupId: null };
  const condition = await conditions.create(owner.patient.id, data);
  const before = await snapshotDatabase();
  const { id: patientId } = owner.patient;
  const { id: foreignId } = other.nutritionist;

  expect(await conditions.findAllForPatient(patientId, owner.nutritionist.id)).toMatchObject([{ id: condition.id }]);
  expect(await conditions.findAllForPatient(patientId, foreignId)).toEqual([]);
  expect(await conditions.findByIdForPatient(condition.id, patientId, foreignId)).toBeNull();
  expect(await conditions.findDuplicate(patientId, foreignId, data)).toBeNull();
  expect(await conditions.updateForPatient(condition.id, patientId, foreignId, { observations: 'No debe guardarse' })).toBeNull();
  expect(await conditions.deleteForPatient(condition.id, patientId, foreignId)).toBe(false);
  expect(await snapshotDatabase()).toEqual(before);
});

describe('patient_condition — CHECK de las migraciones', () => {
  it.each([
    ['alimento y grupo juntos', 'patient_condition_food_xor_group_chk', (c) => ({ type: 'allergy', foodId: c.food.id, foodGroupId: c.group.id })],
    ['patología sin referencia', 'patient_condition_pathology_chk', () => ({ type: 'pathology' })],
    ['alergia con patología', 'patient_condition_pathology_chk', (c) => ({ type: 'allergy', foodId: c.food.id, pathologyId: c.pathology.id })],
    ['patología con alimento', 'patient_condition_target_chk', (c) => ({ type: 'pathology', pathologyId: c.pathology.id, foodId: c.food.id })],
    ['alergia sin destino', 'patient_condition_target_chk', () => ({ type: 'allergy' })],
  ])('rechaza %s sin pasar por Zod', async (_label, constraint, data) => {
    await expect(prisma.patientCondition.create({ data: { patientId: owner.patient.id, ...data(catalog) } }))
      .rejects.toThrow(constraint);
    expect(await prisma.patientCondition.count()).toBe(0);
  });

  it('acepta patología, alimento o grupo como destinos válidos', async () => {
    for (const data of [
      { type: 'pathology', pathologyId: catalog.pathology.id },
      { type: 'allergy', foodId: catalog.food.id },
      { type: 'preference', foodGroupId: catalog.group.id },
    ]) {
      await conditions.create(owner.patient.id, data);
    }
    expect(await conditions.findAllForPatient(owner.patient.id, owner.nutritionist.id)).toHaveLength(3);
  });
});
