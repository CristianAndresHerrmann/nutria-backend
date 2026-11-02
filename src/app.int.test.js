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

describe('Edición del borrador — API real + Postgres (T40, RF-46)', () => {
  it('los bloqueos siguen a lo que se guarda y a las condiciones actuales del paciente', async () => {
    const path = `/patients/${owner.patient.id}/plans/${records.plan.id}`;
    const otherFood = await prisma.food.create({ data: { name: 'Otro alimento ficticio', foodGroupId: catalog.group.id } });
    const blocking = ({ findings }) => findings.filter(({ severity }) => severity === 'blocking').map(({ type }) => type);
    const save = (items) => request(path, owner.nutritionist, 'PUT', {
      introduction: 'Borrador ficticio', meals: [{ mealType: 'lunch', options: [{ items }] }],
    });

    // El paciente es alérgico a catalog.food, que también es ingrediente de la receta.
    const blocked = await save([
      { type: 'unrecognized', originalText: 'Texto ficticio' },
      { type: 'food', foodId: catalog.food.id },
      { type: 'recipe', recipeId: records.recipe.id },
    ]);
    expect(blocked.status).toBe(200);
    expect(blocking(blocked.body)).toEqual(['unrecognized_item', 'direct_condition', 'direct_condition']);

    const fixed = await save([{ type: 'food', foodId: otherFood.id }]);
    expect(fixed.status).toBe(200);
    expect(blocking(fixed.body)).toEqual([]);
    expect(blocking((await request(path)).body)).toEqual([]);

    // Una condición nueva se refleja al reabrir el borrador, sin volver a guardarlo.
    const condition = await request(`/patients/${owner.patient.id}/conditions`, owner.nutritionist, 'POST', { type: 'intolerance', foodId: otherFood.id });
    expect(condition.status).toBe(201);
    const reopened = (await request(path)).body;
    expect(blocking(reopened)).toEqual(['direct_condition']);
    expect(reopened.findings[0].patientConditionId).toBe(condition.body.id);
  });

  it('las reglas de las patologías del paciente se guardan como hallazgos con su regla (T35)', async () => {
    const path = `/patients/${owner.patient.id}/plans/${records.plan.id}`;
    const moderated = await prisma.food.create({ data: { name: 'Alimento a moderar ficticio', foodGroupId: catalog.group.id } });
    await prisma.patientCondition.create({ data: { patientId: owner.patient.id, type: 'pathology', pathologyId: catalog.pathology.id } });
    const rule = await prisma.clinicalRule.create({
      data: { pathologyId: catalog.pathology.id, foodId: moderated.id, severity: 'moderate', source: 'Fuente ficticia, p. 1' },
    });
    const ruleFindings = ({ findings }) => findings.filter(({ type }) => type === 'pathology_rule');

    const saved = await request(path, owner.nutritionist, 'PUT', {
      introduction: 'Borrador ficticio', meals: [{ mealType: 'lunch', options: [{ items: [{ type: 'food', foodId: moderated.id }] }] }],
    });
    expect(saved.status).toBe(200);
    expect(ruleFindings(saved.body)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        clinicalRuleId: rule.id,
        patientConditionId: null,
        message: 'Alimento a moderar ficticio: a moderar por Patología ficticia (Fuente ficticia, p. 1)',
      }),
    ]);

    // Dar de baja la regla la saca al reabrir el borrador.
    await prisma.clinicalRule.update({ where: { id: rule.id }, data: { active: false } });
    expect(ruleFindings((await request(path)).body)).toEqual([]);
  });
});

describe('Curación del catálogo por el administrador — API real + Postgres (T25)', () => {
  let admin;

  beforeEach(async () => {
    admin = await prisma.nutritionist.create({
      data: { name: 'Administrador ficticio', email: 'admin@example.test', passwordHash: 'unused', role: 'admin' },
    });
  });

  const itemsOf = (plan) => plan.meals.flatMap(({ options }) => options.flatMap(({ items }) => items));

  it('corrige las categorías y el grupo de un privado de punta a punta; el plan conserva su copia (DA-16)', async () => {
    const created = await request('/foods', owner.nutritionist, 'POST', {
      name: 'Kéfir ficticio', foodGroupId: catalog.group.id, categories: ['protein'],
    });
    expect(created.status).toBe(201);
    const foodId = created.body.id;
    const planPath = `/patients/${owner.patient.id}/plans/${records.plan.id}`;
    const saved = await request(planPath, owner.nutritionist, 'PUT', {
      introduction: 'Borrador ficticio', meals: [{ mealType: 'lunch', options: [{ items: [{ type: 'food', foodId }] }] }],
    });
    expect(saved.status).toBe(200);

    const otherGroup = await request('/admin/food-groups', admin, 'POST', { name: 'Otro grupo ficticio' });
    expect(otherGroup.status).toBe(201);
    const corrected = await request(`/admin/foods/${foodId}`, admin, 'PUT', {
      name: 'Kéfir corregido', foodGroupId: otherGroup.body.id, categories: ['protein', 'healthy_fat'],
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({
      common: false,
      owner: { id: owner.nutritionist.id },
      createdBy: { id: owner.nutritionist.id },
    });

    // La nutricionista ve el alimento corregido; el plan, la copia que guardó.
    expect((await request(`/foods/${foodId}`)).body).toMatchObject({
      name: 'Kéfir corregido', foodGroupId: otherGroup.body.id, categories: ['protein', 'healthy_fat'],
    });
    expect(itemsOf((await request(planPath)).body)).toEqual([
      expect.objectContaining({ foodId, foodName: 'Kéfir ficticio', foodCategories: ['protein'] }),
    ]);
    // Corregirlo no lo hace visible para otro nutricionista.
    expect((await request(`/foods/${foodId}`, other.nutritionist)).status).toBe(404);
  });

  it('un grupo no puede quedar dentro de uno de sus subgrupos (400) y la base no cambia', async () => {
    const parent = (await request('/admin/food-groups', admin, 'POST', { name: 'Raíz ficticia' })).body;
    const child = (await request('/admin/food-groups', admin, 'POST', { name: 'Hijo ficticio', parentId: parent.id })).body;
    const grandchild = (await request('/admin/food-groups', admin, 'POST', { name: 'Nieto ficticio', parentId: child.id })).body;
    const before = await snapshotDatabase();

    const response = await request(`/admin/food-groups/${parent.id}`, admin, 'PUT', { name: 'Raíz ficticia', parentId: grandchild.id });

    expect(response.status).toBe(400);
    expect(response.body.error.details.fields.parentId).toBe('Un grupo no puede quedar dentro de sí mismo ni de uno de sus subgrupos');
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('pasa un privado al común: choca con un privado vigente de otro, se renombra y la actividad conserva a la autora', async () => {
    const own = (await request('/foods', owner.nutritionist, 'POST', { name: 'Caballa ficticia', foodGroupId: catalog.group.id, categories: ['protein'] })).body;
    await request('/foods', other.nutritionist, 'POST', { name: 'caballa ficticia', foodGroupId: catalog.group.id, categories: ['protein'] });
    const before = await snapshotDatabase();

    const conflict = await request(`/admin/foods/${own.id}/promote`, admin, 'POST', {});
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
    expect(conflict.body.error.details.fields.name).toMatch(/Otro nutricionista tiene un alimento privado/);
    expect(await snapshotDatabase()).toEqual(before);

    const promoted = await request(`/admin/foods/${own.id}/promote`, admin, 'POST', { name: 'Caballa ficticia en aceite' });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({ id: own.id, common: true, owner: null, createdBy: { id: owner.nutritionist.id } });
    expect((await request('/foods', other.nutritionist)).body.map(({ name }) => name)).toContain('Caballa ficticia en aceite');
    expect((await request(`/admin/foods/${own.id}/promote`, admin, 'POST', {})).status).toBe(409);

    const activity = await request(`/admin/catalog-activity?nutritionistId=${owner.nutritionist.id}`, admin);
    expect(activity.status).toBe(200);
    expect(activity.body).toEqual([
      { id: own.id, name: 'Caballa ficticia en aceite', active: true, common: true, createdBy: { id: owner.nutritionist.id, name: owner.nutritionist.name }, createdAt: expect.any(String) },
    ]);
    // El común del fixture (sin autor) no es actividad de nadie.
    expect((await request('/admin/catalog-activity', admin)).body.map(({ id }) => id)).not.toContain(catalog.food.id);
  });

  it('un nombre duplicado da CONFLICT al editar un alimento, un grupo y una patología', async () => {
    const before = await snapshotDatabase();
    const otherFood = await prisma.food.create({ data: { name: 'Común ficticio', foodGroupId: catalog.group.id } });
    const after = await snapshotDatabase();

    const food = await request(`/admin/foods/${otherFood.id}`, admin, 'PUT', { name: 'ALIMENTO FICTICIO', foodGroupId: catalog.group.id, categories: ['protein'] });
    const pathology = await request('/admin/pathologies', admin, 'POST', { name: 'patología ficticia' });
    const group = await request('/admin/food-groups', admin, 'POST', { name: 'GRUPO FICTICIO' });

    expect([food.status, pathology.status, group.status]).toEqual([409, 409, 409]);
    expect(await snapshotDatabase()).toEqual(after);
    expect(after.Food).toHaveLength(before.Food.length + 1);
  });
});
