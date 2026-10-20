const jwt = require('jsonwebtoken');
const app = require('./app');
const patientService = require('./services/patient.service');
const patientConditionService = require('./services/patientCondition.service');
const consultationService = require('./services/consultation.service');
const foodGroupService = require('./services/foodGroup.service');
const foodService = require('./services/food.service');
const pathologyService = require('./services/pathology.service');

// Integración liviana: la app real levantada en un puerto efímero, sin base ni
// servicio de IA. Cada caso corta antes de llegar a Prisma (ruta inexistente,
// body inválido, sin token, id inválido) o stubbea el fetch hacia la IA, así que
// no necesita Postgres. Verifica el criterio de T7 desde afuera: ningún fallo
// termina en respuesta vacía ni expone un stack, y todos usan el mismo formato.

// Se guarda antes de cualquier stub: los tests que simulan la IA caída
// reemplazan el fetch global, pero las requests de este archivo tienen que
// seguir saliendo.
const realFetch = globalThis.fetch;

let server;
let baseUrl;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function request(path, { method = 'GET', body, rawBody, token } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await realFetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();

  return { status: response.status, contentType: response.headers.get('content-type'), text, json: text ? JSON.parse(text) : null };
}

function expectUniformError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.contentType).toContain('application/json');
  expect(response.json.error).toMatchObject({ code, message: expect.any(String) });
  expect(response.json.error.message.length).toBeGreaterThan(0);
  expect(response.text).not.toMatch(/stack|at .+\.js:\d+/);
}

const validToken = () => jwt.sign({ sub: 'nutri-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('formato uniforme de error de punta a punta', () => {
  it('una ruta inexistente responde 404 con el formato uniforme', async () => {
    const response = await request('/no-existe');

    expectUniformError(response, 404, 'NOT_FOUND');
    expect(response.json.error.message).toBe('Ruta no encontrada');
  });

  it('un body que no es JSON responde 400 INVALID_JSON sin el mensaje del parser', async () => {
    const response = await request('/auth/login', { method: 'POST', rawBody: '{bad' });

    expectUniformError(response, 400, 'INVALID_JSON');
    expect(response.text).not.toContain('Unexpected');
  });

  it('un login con email inválido responde 400 con el error en details.fields.email', async () => {
    const response = await request('/auth/login', { method: 'POST', body: { email: 'no-es-email', password: 'x' } });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields.email).toBe('El email no tiene un formato válido');
  });

  it('una ruta protegida sin token responde 401', async () => {
    const response = await request('/patients');

    expectUniformError(response, 401, 'UNAUTHORIZED');
  });

  it('un alta de paciente inválida responde 400 con cada campo en details.fields', async () => {
    const response = await request('/patients', {
      method: 'POST',
      token: validToken(),
      body: { firstName: '', lastName: 'Gómez', birthDate: '2015-01-01' },
    });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields).toMatchObject({
      firstName: 'El nombre es obligatorio',
      guardianName: expect.any(String),
    });
  });

  it('una fecha de nacimiento inexistente (30/02) responde 400 con el error en details.fields.birthDate', async () => {
    const response = await request('/patients', {
      method: 'POST',
      token: validToken(),
      body: { firstName: 'Ana', lastName: 'Diaz', birthDate: '2023-02-30' },
    });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields).toEqual({ birthDate: 'La fecha de nacimiento no es válida' });
  });

  it('un dato clínico inválido responde 400 con el error en su campo de details.fields', async () => {
    const response = await request('/patients', {
      method: 'POST',
      token: validToken(),
      body: { firstName: 'Ana', lastName: 'Diaz', medicalHistory: 'a'.repeat(2001), cooks: 'si' },
    });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields).toEqual({
      medicalHistory: 'No puede superar los 2000 caracteres',
      cooks: 'Debe ser sí o no',
    });
  });

  it('un id que no es UUID responde 404, igual que un paciente inexistente', async () => {
    const response = await request('/patients/no-es-un-uuid', { token: validToken() });

    expectUniformError(response, 404, 'NOT_FOUND');
    expect(response.json.error.message).toBe('Paciente no encontrado');
    expect(response.json.error.details).toBeUndefined();
  });

  it('un parámetro de query desconocido responde 400', async () => {
    const response = await request('/patients?page=2', { token: validToken() });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
  });
});

// Las capas tienen sus tests de aislamiento; estos verifican el cableado entre
// ellas en cada ruta de pacientes. Sin requireAuth, req.nutricionistaId quedaría
// undefined y Prisma ignoraría ese filtro: el agujero no lo detectaría ningún
// test de capa. El servicio se espía, así que no hace falta base.
describe('rutas de pacientes — autenticación y aislamiento de punta a punta', () => {
  const PATIENT_ID = '11111111-1111-1111-1111-111111111111';
  const tokenFor = (nutritionistId) => jwt.sign({ sub: nutritionistId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const fakePatient = (nutritionistId) => ({
    id: PATIENT_ID,
    nutritionistId,
    firstName: 'Ana',
    lastName: 'Diaz',
    birthDate: null,
    referenceWeight: null,
  });

  function spyOnPatientService() {
    return {
      list: vi.spyOn(patientService, 'listForNutritionist').mockResolvedValue([]),
      get: vi
        .spyOn(patientService, 'getForNutritionist')
        .mockImplementation(async (_id, n) => ({ ...fakePatient(n), missingClinicalData: true })),
      create: vi.spyOn(patientService, 'createForNutritionist').mockImplementation(async (n) => fakePatient(n)),
      update: vi.spyOn(patientService, 'updateForNutritionist').mockImplementation(async (_id, n) => fakePatient(n)),
    };
  }

  // Incluye datos clínicos (T16): viajan por las mismas rutas y con el mismo
  // nutricionista del token que el resto de la ficha.
  const body = { firstName: 'Ana', lastName: 'Diaz', medicalHistory: 'Hipotiroidismo familiar', cooks: true };

  it.each([
    ['GET', '/patients'],
    ['GET', `/patients/${PATIENT_ID}`],
    ['POST', '/patients'],
    ['PUT', `/patients/${PATIENT_ID}`],
  ])('%s %s sin token responde 401 y no llega al servicio', async (method, path) => {
    const spies = spyOnPatientService();

    const response = await request(path, { method, body: method === 'GET' ? undefined : body });

    expectUniformError(response, 401, 'UNAUTHORIZED');
    Object.values(spies).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it.each(['nutri-1', 'nutri-2'])('cada ruta pasa al servicio el nutricionista del token (%s)', async (nutritionistId) => {
    const spies = spyOnPatientService();
    const token = tokenFor(nutritionistId);

    await request('/patients', { token });
    await request(`/patients/${PATIENT_ID}`, { token });
    await request('/patients', { method: 'POST', token, body });
    await request(`/patients/${PATIENT_ID}`, { method: 'PUT', token, body });

    expect(spies.list).toHaveBeenCalledWith(nutritionistId);
    expect(spies.get).toHaveBeenCalledWith(PATIENT_ID, nutritionistId);
    expect(spies.create).toHaveBeenCalledWith(nutritionistId, expect.objectContaining(body));
    expect(spies.update).toHaveBeenCalledWith(PATIENT_ID, nutritionistId, expect.objectContaining(body));
  });

  it('un nutritionistId en el body se rechaza con 400 y no llega al servicio', async () => {
    const spies = spyOnPatientService();
    const token = tokenFor('nutri-1');
    const intruso = { ...body, nutritionistId: 'nutri-2' };

    const alta = await request('/patients', { method: 'POST', token, body: intruso });
    const edicion = await request(`/patients/${PATIENT_ID}`, { method: 'PUT', token, body: intruso });

    expectUniformError(alta, 400, 'VALIDATION_ERROR');
    expectUniformError(edicion, 400, 'VALIDATION_ERROR');
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('la respuesta no expone el nutritionistId', async () => {
    spyOnPatientService();

    const response = await request(`/patients/${PATIENT_ID}`, { token: tokenFor('nutri-1') });

    expect(response.status).toBe(200);
    expect(response.json).not.toHaveProperty('nutritionistId');
  });

  it('el detalle incluye el aviso de datos clínicos faltantes (RF-45)', async () => {
    spyOnPatientService();

    const response = await request(`/patients/${PATIENT_ID}`, { token: tokenFor('nutri-1') });

    expect(response.status).toBe(200);
    expect(response.json.missingClinicalData).toBe(true);
  });
});

// Catálogos (T15). Grupos y patologías: solo lectura con token. Alimentos: el
// nutricionista del token llega al servicio (decide qué privados ve y es el dueño
// de lo que da de alta), y no hay rutas de edición ni de borrado. El servicio se
// espía, así que no hace falta base.
describe('rutas de catálogos — autenticación y alimentos privados de punta a punta', () => {
  const ITEM_ID = '22222222-2222-2222-2222-222222222222';
  const GROUP_ID = '33333333-3333-3333-3333-333333333333';
  const tokenFor = (nutritionistId) => jwt.sign({ sub: nutritionistId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const body = { name: 'Caballa', foodGroupId: GROUP_ID, categories: ['protein', 'healthy_fat'] };
  const fakeFood = (nutritionistId) => ({
    id: ITEM_ID,
    name: 'Caballa',
    active: true,
    foodGroupId: GROUP_ID,
    nutritionistId,
    foodGroup: { id: GROUP_ID, name: 'Pescados', parentId: null },
    categories: [{ category: 'protein' }, { category: 'healthy_fat' }],
  });

  function spyOnServices() {
    return {
      groupList: vi.spyOn(foodGroupService, 'list').mockResolvedValue([]),
      groupGet: vi.spyOn(foodGroupService, 'get').mockResolvedValue({ id: ITEM_ID, name: 'Aves', parentId: null }),
      pathologyList: vi.spyOn(pathologyService, 'list').mockResolvedValue([]),
      pathologyGet: vi.spyOn(pathologyService, 'get').mockResolvedValue({ id: ITEM_ID, name: 'Gota' }),
      foodList: vi.spyOn(foodService, 'list').mockImplementation(async (n) => [fakeFood(n)]),
      foodGet: vi.spyOn(foodService, 'get').mockImplementation(async (_id, n) => fakeFood(n)),
      foodCreate: vi.spyOn(foodService, 'create').mockImplementation(async (n) => fakeFood(n)),
    };
  }

  it.each([
    ['GET', '/food-groups'],
    ['GET', `/food-groups/${ITEM_ID}`],
    ['GET', '/pathologies'],
    ['GET', `/pathologies/${ITEM_ID}`],
    ['GET', '/foods'],
    ['GET', `/foods/${ITEM_ID}`],
    ['POST', '/foods'],
  ])('%s %s sin token responde 401 y no llega al servicio', async (method, path) => {
    const spies = spyOnServices();

    const response = await request(path, { method, body: method === 'POST' ? body : undefined });

    expectUniformError(response, 401, 'UNAUTHORIZED');
    Object.values(spies).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it.each(['nutri-1', 'nutri-2'])('cada ruta de alimentos pasa al servicio el nutricionista del token (%s)', async (nutritionistId) => {
    const spies = spyOnServices();
    const token = tokenFor(nutritionistId);

    await request(`/foods?search=caba&groupId=${GROUP_ID}`, { token });
    await request(`/foods/${ITEM_ID}`, { token });
    const alta = await request('/foods', { method: 'POST', token, body });

    expect(spies.foodList).toHaveBeenCalledWith(nutritionistId, { search: 'caba', groupId: GROUP_ID });
    expect(spies.foodGet).toHaveBeenCalledWith(ITEM_ID, nutritionistId);
    expect(spies.foodCreate).toHaveBeenCalledWith(nutritionistId, body);
    expect(alta.status).toBe(201);
  });

  it('un nutritionistId en el body se rechaza con 400 y no llega al servicio', async () => {
    const spies = spyOnServices();

    const alta = await request('/foods', { method: 'POST', token: tokenFor('nutri-1'), body: { ...body, nutritionistId: 'nutri-2' } });

    expectUniformError(alta, 400, 'VALIDATION_ERROR');
    expect(spies.foodCreate).not.toHaveBeenCalled();
  });

  it('la respuesta aplana las categorías y no expone el dueño', async () => {
    spyOnServices();

    const response = await request(`/foods/${ITEM_ID}`, { token: tokenFor('nutri-1') });

    expect(response.status).toBe(200);
    expect(response.json.categories).toEqual(['protein', 'healthy_fat']);
    expect(response.json).not.toHaveProperty('nutritionistId');
  });

  it('un alimento sin categorías responde 400 en details.fields.categories', async () => {
    const spies = spyOnServices();

    const response = await request('/foods', { method: 'POST', token: tokenFor('nutri-1'), body: { ...body, categories: [] } });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields.categories).toBe('Indicá al menos una categoría');
    expect(spies.foodCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/foods/no-es-un-uuid'],
    ['GET', '/food-groups/no-es-un-uuid'],
    ['GET', '/pathologies/no-es-un-uuid'],
  ])('%s %s responde 404', async (method, path) => {
    spyOnServices();

    expectUniformError(await request(path, { token: tokenFor('nutri-1') }), 404, 'NOT_FOUND');
  });

  it.each([
    ['PUT', `/foods/${ITEM_ID}`],
    ['DELETE', `/foods/${ITEM_ID}`],
    ['POST', '/food-groups'],
    ['PUT', `/food-groups/${ITEM_ID}`],
    ['POST', '/pathologies'],
    ['PUT', `/pathologies/${ITEM_ID}`],
  ])('%s %s no existe: el nutricionista no modifica el catálogo', async (method, path) => {
    const response = await request(path, { method, token: tokenFor('nutri-1'), body: { name: 'x' } });

    expectUniformError(response, 404, 'NOT_FOUND');
    expect(response.json.error.message).toBe('Ruta no encontrada');
  });
});

describe('GET /health/ia', () => {
  it('responde 200 con el estado del servicio de IA', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ status: 'ok', service: 'nutria-ia' }) })),
    );

    const response = await request('/health/ia');

    expect(response.status).toBe(200);
    expect(response.json.ia).toMatchObject({ status: 'ok', service: 'nutria-ia', latencyMs: expect.any(Number) });
  });

  it('con el servicio de IA caído responde 503 controlado y el backend sigue atendiendo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const response = await request('/health/ia');

    expectUniformError(response, 503, 'IA_UNAVAILABLE');
    expect(response.json.error.details).toEqual({ reason: 'unreachable' });

    const health = await request('/health');
    expect(health.status).toBe(200);
  });
});

describe('rutas de condiciones del paciente — autenticación, aislamiento y validación de punta a punta', () => {
  const PATIENT_ID = '11111111-1111-1111-1111-111111111111';
  const CONDITION_ID = '44444444-4444-4444-4444-444444444444';
  const FOOD_ID = '22222222-2222-2222-2222-222222222222';
  const GROUP_ID = '33333333-3333-3333-3333-333333333333';
  const tokenFor = (nutritionistId) => jwt.sign({ sub: nutritionistId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const body = { type: 'allergy', foodId: FOOD_ID, observations: 'Urticaria' };
  const fakeCondition = { id: CONDITION_ID, patientId: PATIENT_ID, type: 'allergy', foodId: FOOD_ID };

  function spyOnConditionService() {
    return {
      list: vi.spyOn(patientConditionService, 'list').mockResolvedValue([fakeCondition]),
      create: vi.spyOn(patientConditionService, 'create').mockResolvedValue(fakeCondition),
      update: vi.spyOn(patientConditionService, 'update').mockResolvedValue(fakeCondition),
      remove: vi.spyOn(patientConditionService, 'remove').mockResolvedValue(undefined),
    };
  }

  const collection = `/patients/${PATIENT_ID}/conditions`;
  const item = `${collection}/${CONDITION_ID}`;

  it.each([
    ['GET', collection],
    ['POST', collection],
    ['PUT', item],
    ['DELETE', item],
  ])('%s %s sin token responde 401 y no llega al servicio', async (method, path) => {
    const spies = spyOnConditionService();

    const response = await request(path, { method, body: ['POST', 'PUT'].includes(method) ? body : undefined });

    expectUniformError(response, 401, 'UNAUTHORIZED');
    Object.values(spies).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it.each(['nutri-1', 'nutri-2'])('cada ruta pasa al servicio el nutricionista del token (%s)', async (nutritionistId) => {
    const spies = spyOnConditionService();
    const token = tokenFor(nutritionistId);

    await request(collection, { token });
    const alta = await request(collection, { method: 'POST', token, body });
    await request(item, { method: 'PUT', token, body });
    const baja = await request(item, { method: 'DELETE', token });

    const parsed = expect.objectContaining({ type: 'allergy', foodId: FOOD_ID, foodGroupId: null, pathologyId: null });
    expect(spies.list).toHaveBeenCalledWith(PATIENT_ID, nutritionistId);
    expect(spies.create).toHaveBeenCalledWith(PATIENT_ID, nutritionistId, parsed);
    expect(spies.update).toHaveBeenCalledWith(CONDITION_ID, PATIENT_ID, nutritionistId, parsed);
    expect(spies.remove).toHaveBeenCalledWith(CONDITION_ID, PATIENT_ID, nutritionistId);
    expect(alta.status).toBe(201);
    expect(baja.status).toBe(204);
    expect(baja.text).toBe('');
  });

  it.each([
    ['alimento y grupo a la vez', { type: 'allergy', foodId: FOOD_ID, foodGroupId: GROUP_ID }, 'foodGroupId'],
    ['patología sin pathologyId', { type: 'pathology' }, 'pathologyId'],
    ['rechazo sin alimento ni grupo', { type: 'rejection' }, 'foodId'],
    ['patología con un alimento', { type: 'pathology', pathologyId: GROUP_ID, foodId: FOOD_ID }, 'foodId'],
  ])('%s responde 400 VALIDATION_ERROR con el campo en details.fields', async (_caso, invalid, field) => {
    const spies = spyOnConditionService();

    const response = await request(collection, { method: 'POST', token: tokenFor('nutri-1'), body: invalid });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields).toHaveProperty(field);
    expect(spies.create).not.toHaveBeenCalled();
  });

  it.each(['nutritionistId', 'patientId'])('un %s en el body se rechaza con 400 y no llega al servicio', async (key) => {
    const spies = spyOnConditionService();

    const response = await request(collection, { method: 'POST', token: tokenFor('nutri-1'), body: { ...body, [key]: PATIENT_ID } });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(spies.create).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/patients/no-es-un-uuid/conditions', 'Paciente no encontrado'],
    ['DELETE', `${collection}/no-es-un-uuid`, 'Condición no encontrada'],
    ['DELETE', `/patients/no-es-un-uuid/conditions/${CONDITION_ID}`, 'Condición no encontrada'],
  ])('%s %s responde 404', async (method, path, message) => {
    const spies = spyOnConditionService();

    const response = await request(path, { method, token: tokenFor('nutri-1') });

    expectUniformError(response, 404, 'NOT_FOUND');
    expect(response.json.error.message).toBe(message);
    Object.values(spies).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});

describe('rutas de consultas del paciente — autenticación, aislamiento y validación de punta a punta', () => {
  const PATIENT_ID = '11111111-1111-1111-1111-111111111111';
  const CONSULTATION_ID = '55555555-5555-5555-5555-555555555555';
  const tokenFor = (nutritionistId) => jwt.sign({ sub: nutritionistId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const body = { date: '2026-10-01', type: 'first', motivation: 'Más energía' };
  const fakeConsultation = { id: CONSULTATION_ID, patientId: PATIENT_ID, type: 'first', habits: [] };

  function spyOnConsultationService() {
    return {
      list: vi.spyOn(consultationService, 'list').mockResolvedValue([fakeConsultation]),
      get: vi.spyOn(consultationService, 'get').mockResolvedValue(fakeConsultation),
      create: vi.spyOn(consultationService, 'create').mockResolvedValue(fakeConsultation),
      update: vi.spyOn(consultationService, 'update').mockResolvedValue(fakeConsultation),
    };
  }

  const collection = `/patients/${PATIENT_ID}/consultations`;
  const item = `${collection}/${CONSULTATION_ID}`;

  it.each([
    ['GET', collection],
    ['POST', collection],
    ['GET', item],
    ['PUT', item],
  ])('%s %s sin token responde 401 y no llega al servicio', async (method, path) => {
    const spies = spyOnConsultationService();

    const response = await request(path, { method, body: ['POST', 'PUT'].includes(method) ? body : undefined });

    expectUniformError(response, 401, 'UNAUTHORIZED');
    Object.values(spies).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it.each(['nutri-1', 'nutri-2'])('cada ruta pasa al servicio el nutricionista del token (%s)', async (nutritionistId) => {
    const spies = spyOnConsultationService();
    const token = tokenFor(nutritionistId);
    const habits = [{ description: 'Caminar 30 minutos' }];

    await request(collection, { token });
    const alta = await request(collection, { method: 'POST', token, body: { ...body, habits } });
    await request(item, { token });
    const edicion = await request(item, { method: 'PUT', token, body });

    const parsed = expect.objectContaining({
      date: new Date('2026-10-01T00:00:00.000Z'),
      type: 'first',
      motivation: 'Más energía',
      observations: null,
    });
    expect(spies.list).toHaveBeenCalledWith(PATIENT_ID, nutritionistId);
    expect(spies.create).toHaveBeenCalledWith(PATIENT_ID, nutritionistId, parsed);
    expect(spies.create.mock.calls[0][2].habits).toEqual(habits);
    expect(spies.get).toHaveBeenCalledWith(CONSULTATION_ID, PATIENT_ID, nutritionistId);
    expect(spies.update).toHaveBeenCalledWith(CONSULTATION_ID, PATIENT_ID, nutritionistId, parsed);
    expect(alta.status).toBe(201);
    expect(edicion.status).toBe(200);
  });

  it('una consulta sin mediciones ni hábitos se acepta con 201 (RNF-09)', async () => {
    const spies = spyOnConsultationService();

    const response = await request(collection, {
      method: 'POST',
      token: tokenFor('nutri-1'),
      body: { date: '2026-10-01', type: 'follow_up' },
    });

    expect(response.status).toBe(201);
    expect(spies.create.mock.calls[0][2]).toMatchObject({ type: 'follow_up', habits: [] });
  });

  it.each([
    ['sin fecha', { type: 'first' }, 'date'],
    ['con fecha inexistente', { date: '2026-02-30', type: 'first' }, 'date'],
    ['sin tipo', { date: '2026-10-01' }, 'type'],
    ['con tipo inválido', { date: '2026-10-01', type: 'control' }, 'type'],
    ['con un hábito sin descripción', { ...body, habits: [{ description: '' }] }, 'habits'],
  ])('un alta %s responde 400 VALIDATION_ERROR con el campo en details.fields', async (_caso, invalid, field) => {
    const spies = spyOnConsultationService();

    const response = await request(collection, { method: 'POST', token: tokenFor('nutri-1'), body: invalid });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields).toHaveProperty(field);
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('el PUT con hábitos responde 400: se cargan solo al crear la consulta', async () => {
    const spies = spyOnConsultationService();

    const response = await request(item, {
      method: 'PUT',
      token: tokenFor('nutri-1'),
      body: { ...body, habits: [{ description: 'Caminar' }] },
    });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(spies.update).not.toHaveBeenCalled();
  });

  it.each(['nutritionistId', 'patientId'])('un %s en el body se rechaza con 400 y no llega al servicio', async (key) => {
    const spies = spyOnConsultationService();

    const response = await request(collection, { method: 'POST', token: tokenFor('nutri-1'), body: { ...body, [key]: PATIENT_ID } });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(spies.create).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/patients/no-es-un-uuid/consultations', 'Paciente no encontrado'],
    ['GET', `${collection}/no-es-un-uuid`, 'Consulta no encontrada'],
    ['PUT', `/patients/no-es-un-uuid/consultations/${CONSULTATION_ID}`, 'Consulta no encontrada'],
  ])('%s %s responde 404', async (method, path, message) => {
    const spies = spyOnConsultationService();

    const response = await request(path, { method, token: tokenFor('nutri-1'), body: method === 'PUT' ? body : undefined });

    expectUniformError(response, 404, 'NOT_FOUND');
    expect(response.json.error.message).toBe(message);
    Object.values(spies).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
