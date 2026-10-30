const jwt = require('jsonwebtoken');
const app = require('./app');
const patients = require('./repositories/patient.repository');
const consultations = require('./repositories/consultation.repository');
const measurements = require('./repositories/measurement.repository');
const recipes = require('./repositories/recipe.repository');
const { prisma, createCatalog, createTenant, snapshotDatabase } = require('./test/integration');

let server;
let baseUrl;
let catalog;
let owner;
let other;
let records;

beforeAll(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

beforeEach(async () => {
  catalog = await createCatalog();
  owner = await createTenant('owner');
  other = await createTenant('other');
  const condition = await prisma.patientCondition.create({ data: { patientId: owner.patient.id, type: 'allergy', foodId: catalog.food.id } });
  const consultation = await consultations.create(owner.patient.id, owner.nutritionist.id,
    { type: 'first', date: new Date('2026-01-01') }, [{ description: 'Hábito ficticio' }], [{ type: 'weight', value: 70, unit: 'kg' }]);
  const measurement = await prisma.measurement.findFirst({ where: { consultationId: consultation.id } });
  const plan = await prisma.plan.create({ data: { patientId: owner.patient.id, nutritionistId: owner.nutritionist.id, introduction: 'Borrador ficticio' } });
  const recipe = await recipes.create(owner.nutritionist.id, { name: 'Receta privada ficticia' }, [{ foodId: catalog.food.id }], ['lunch']);
  records = { condition, consultation, measurement, plan, recipe };
});

async function request(path, nutritionist = owner.nutritionist, method = 'GET', body) {
  const headers = {};
  if (nutritionist) headers.authorization = `Bearer ${jwt.sign({}, process.env.JWT_SECRET, { subject: nutritionist.id, expiresIn: '1h' })}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

function resourceCases() {
  const root = `/patients/${owner.patient.id}`;
  const conditionBody = { type: 'allergy', foodId: catalog.food.id, observations: 'Cambio ficticio' };
  const consultationBody = { type: 'first', date: '2026-01-01', observations: 'Cambio ficticio' };
  const measurementBody = { type: 'weight', value: 71, date: '2026-01-01' };
  const recipeBody = { name: 'Cambio ficticio', ingredients: [{ foodId: catalog.food.id }], mealTypes: ['lunch'] };
  return {
    patient: { list: '/patients', detail: root, id: owner.patient.id, update: root, body: { firstName: 'Cambio ficticio', lastName: 'Prueba' } },
    condition: { list: `${root}/conditions`, id: records.condition.id, update: `${root}/conditions/${records.condition.id}`, body: conditionBody, create: `${root}/conditions`, remove: `${root}/conditions/${records.condition.id}` },
    consultation: { list: `${root}/consultations`, detail: `${root}/consultations/${records.consultation.id}`, id: records.consultation.id, update: `${root}/consultations/${records.consultation.id}`, body: consultationBody, create: `${root}/consultations` },
    measurement: { list: `${root}/measurements`, id: records.measurement.id, update: `${root}/measurements/${records.measurement.id}`, body: measurementBody, create: `${root}/measurements`, remove: `${root}/measurements/${records.measurement.id}` },
    plan: { list: `${root}/plans`, detail: `${root}/plans/${records.plan.id}`, id: records.plan.id, update: `${root}/plans/${records.plan.id}`, body: { introduction: 'Cambio ficticio', meals: [] }, create: `${root}/plans/generate`, createBody: { mealTypes: ['lunch'] } },
    recipe: { list: '/recipes', detail: `/recipes/${records.recipe.id}`, id: records.recipe.id, update: `/recipes/${records.recipe.id}`, body: recipeBody },
  };
}

describe('API real + Postgres — aislamiento por nutricionista', () => {
  it.each(['patient', 'condition', 'consultation', 'measurement', 'plan', 'recipe'])('%s: solo el dueño lee y escribe; un ajeno no altera la base', async (name) => {
    const resource = resourceCases()[name];
    const ownList = await request(resource.list);
    expect(ownList.status).toBe(200);
    expect(ownList.body.map(({ id }) => id)).toContain(resource.id);
    if (resource.detail) {
      const ownDetail = await request(resource.detail);
      expect(ownDetail.status).toBe(200);
      expect(ownDetail.body.id).toBe(resource.id);
    }
    // Un body válido también debe atravesar las capas hasta la escritura real.
    const ownUpdate = await request(resource.update, owner.nutritionist, 'PUT', resource.body);
    expect(ownUpdate.status).toBe(200);
    expect(ownUpdate.body.id).toBe(resource.id);
    const before = await snapshotDatabase();

    const foreignList = await request(resource.list, other.nutritionist);
    if (name === 'patient' || name === 'recipe') {
      expect(foreignList.status).toBe(200);
      expect(foreignList.body.map(({ id }) => id)).not.toContain(resource.id);
    } else expect(foreignList.status).toBe(404);
    if (resource.detail) expect((await request(resource.detail, other.nutritionist)).status).toBe(404);
    expect((await request(resource.update, other.nutritionist, 'PUT', resource.body)).status).toBe(404);
    if (resource.create) {
      expect((await request(resource.create, other.nutritionist, 'POST', resource.createBody || resource.body)).status).toBe(404);
    }
    if (resource.remove) expect((await request(resource.remove, other.nutritionist, 'DELETE')).status).toBe(404);
    expect((await request(resource.list, null)).status).toBe(401);
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('los IDs de hijos ajenos tampoco funcionan bajo un paciente propio', async () => {
    const before = await snapshotDatabase();
    const foreignCases = resourceCases();
    for (const name of ['condition', 'consultation', 'measurement', 'plan']) {
      const resource = foreignCases[name];
      const path = resource.update.replace(owner.patient.id, other.patient.id);
      expect((await request(path, other.nutritionist, 'PUT', resource.body)).status).toBe(404);
      if (resource.detail) {
        expect((await request(resource.detail.replace(owner.patient.id, other.patient.id), other.nutritionist)).status).toBe(404);
      }
    }
    expect(await snapshotDatabase()).toEqual(before);
  });
});

it('los repositorios filtran consultas y mediciones incluso sin el control previo del servicio', async () => {
  const before = await snapshotDatabase();
  const patientId = owner.patient.id;
  const nutritionistId = other.nutritionist.id;
  expect(await patients.findByIdForNutritionist(patientId, nutritionistId)).toBeNull();
  expect(await patients.updateForNutritionist(patientId, nutritionistId, { firstName: 'No debe persistir' })).toBeNull();
  expect(await patients.countConditionsForNutritionist(patientId, nutritionistId, ['allergy'])).toBe(0);
  expect(await patients.countConditionsForNutritionist(patientId, owner.nutritionist.id, ['allergy'])).toBe(1);
  expect(await consultations.findAllForPatient(patientId, nutritionistId)).toEqual([]);
  expect(await consultations.findByIdForPatient(records.consultation.id, patientId, nutritionistId)).toBeNull();
  expect(await consultations.updateForPatient(records.consultation.id, patientId, nutritionistId, { observations: 'No debe persistir' })).toBeNull();
  expect(await measurements.findAllForPatient(patientId, nutritionistId)).toEqual([]);
  expect(await measurements.findByIdForPatient(records.measurement.id, patientId, nutritionistId)).toBeNull();
  expect(await measurements.updateForPatient(records.measurement.id, patientId, nutritionistId, { value: 80 })).toBe(false);
  expect(await measurements.deleteForPatient(records.measurement.id, patientId, nutritionistId)).toBe(false);
  expect(await recipes.findVisibleById(records.recipe.id, nutritionistId)).toBeNull();
  expect(await recipes.updateOwn(records.recipe.id, nutritionistId, { name: 'No debe persistir' }, [], [])).toBeNull();
  expect(await snapshotDatabase()).toEqual(before);
});

it('las recetas comunes siguen visibles y las privadas quedan limitadas a su dueño', async () => {
  const common = await recipes.upsertCommon({ name: 'Receta común ficticia' }, [{ foodId: catalog.food.id }], ['lunch']);
  expect((await recipes.findVisible(owner.nutritionist.id)).map(({ id }) => id)).toEqual(expect.arrayContaining([common.id, records.recipe.id]));
  expect((await recipes.findVisible(other.nutritionist.id)).map(({ id }) => id)).toEqual([common.id]);
  const before = await snapshotDatabase();
  expect(await recipes.updateOwn(common.id, owner.nutritionist.id, { name: 'No debe persistir' }, [], [])).toBeNull();
  expect(await snapshotDatabase()).toEqual(before);
});

describe('PATCH de disponibilidad de recetas — API real + Postgres (AUD-008)', () => {
  it('una baja desde un listado desactualizado preserva la edición y todos los hijos actuales', async () => {
    const path = `/recipes/${records.recipe.id}`;
    const staleRow = (await request(path)).body;
    const secondFood = await prisma.food.create({ data: { name: 'Segundo alimento ficticio', foodGroupId: catalog.group.id } });
    const edit = await request(path, owner.nutritionist, 'PUT', {
      name: 'Receta editada en otra pestaña', preparation: 'Preparación nueva', finalNote: 'Nota nueva',
      cookingMethod: 'no_cooking', timeMinutes: 15, purchasePlace: 'Lugar ficticio',
      ingredients: [{ foodId: secondFood.id, quantityDescription: '2 unidades' }, { foodId: catalog.food.id, quantityDescription: '1 taza' }],
      mealTypes: ['dinner', 'lunch'],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.name).not.toBe(staleRow.name);
    // La baja se decide desde la copia vieja; ningún otro campo de esa fila viaja.
    const current = await recipes.findVisibleById(records.recipe.id, owner.nutritionist.id);
    const before = await snapshotDatabase();
    const patched = await request(path, owner.nutritionist, 'PATCH', { availableInCatalog: !staleRow.availableInCatalog });
    expect(patched.status).toBe(200);
    expect(patched.body).toEqual({ ...edit.body, availableInCatalog: false, updatedAt: expect.any(String) });
    expect(await recipes.findVisibleById(records.recipe.id, owner.nutritionist.id))
      .toEqual({ ...current, availableInCatalog: false, updatedAt: expect.any(Date) });
    const after = await snapshotDatabase();
    expect(after).toEqual({
      ...before,
      Recipe: before.Recipe.map((row) => ({ ...row, availableInCatalog: false, updatedAt: expect.any(Date) })),
    });
    expect((await request('/recipes')).body.map(({ id }) => id)).not.toContain(records.recipe.id);
    expect((await request('/recipes?includeUnavailable=true')).body.map(({ id }) => id)).toContain(records.recipe.id);
    // La misma baja se puede repetir y la reactivación conserva la edición.
    expect((await request(path, owner.nutritionist, 'PATCH', { availableInCatalog: false })).status).toBe(200);
    const restored = await request(path, owner.nutritionist, 'PATCH', { availableInCatalog: true });
    expect(restored.status).toBe(200);
    expect(restored.body).toEqual({ ...edit.body, availableInCatalog: true, updatedAt: expect.any(String) });
    expect((await request('/recipes')).body.map(({ id }) => id)).toContain(records.recipe.id);
  });

  it('rechaza accesos ajenos, comunes y sin autorización sin cambiar ninguna tabla', async () => {
    const common = await recipes.upsertCommon({ name: 'Receta común ficticia' }, [{ foodId: catalog.food.id }], ['lunch']);
    const admin = await prisma.nutritionist.create({ data: { name: 'Administrador ficticio', email: 'admin@example.test', passwordHash: 'unused', role: 'admin' } });
    const before = await snapshotDatabase();
    const body = { availableInCatalog: false };
    const path = `/recipes/${records.recipe.id}`;
    const foreign = await request(path, other.nutritionist, 'PATCH', body);
    const missing = await request('/recipes/00000000-0000-4000-8000-000000000099', owner.nutritionist, 'PATCH', body);
    expect(foreign.status).toBe(404);
    expect(missing).toEqual(foreign);
    expect((await request(`/recipes/${common.id}`, owner.nutritionist, 'PATCH', body)).status).toBe(403);
    expect((await request(path, null, 'PATCH', body)).status).toBe(401);
    expect((await request(path, admin, 'PATCH', body)).status).toBe(403);
    // Defensa del repositorio incluso si alguien omite el control del servicio.
    expect(await recipes.setAvailabilityOwn(records.recipe.id, other.nutritionist.id, false)).toBeNull();
    expect(await recipes.setAvailabilityOwn(common.id, owner.nutritionist.id, false)).toBeNull();
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('rechaza bodies mal tipados, campos de reemplazo y queries desconocidas sin escribir', async () => {
    const path = `/recipes/${records.recipe.id}`;
    const before = await snapshotDatabase();
    for (const body of [{}, { availableInCatalog: 'false' }, { availableInCatalog: false, name: 'Copia vieja' },
      { availableInCatalog: false, ingredients: [] }, { availableInCatalog: false, nutritionistId: other.nutritionist.id }]) {
      const response = await request(path, owner.nutritionist, 'PATCH', body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await request(`${path}?unexpected=true`, owner.nutritionist, 'PATCH', { availableInCatalog: false })).status).toBe(400);
    expect(await snapshotDatabase()).toEqual(before);
  });
});
