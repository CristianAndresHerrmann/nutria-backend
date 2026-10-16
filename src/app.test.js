const jwt = require('jsonwebtoken');
const app = require('./app');
const patientService = require('./services/patient.service');
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

  return { status: response.status, contentType: response.headers.get('content-type'), text, json: JSON.parse(text) };
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
