const jwt = require('jsonwebtoken');
const app = require('./app');
const patientService = require('./services/patient.service');
const foodGroupService = require('./services/foodGroup.service');
const foodService = require('./services/food.service');
const pathologyService = require('./services/pathology.service');
const AppError = require('./utils/AppError');

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
      get: vi.spyOn(patientService, 'getForNutritionist').mockImplementation(async (_id, n) => fakePatient(n)),
      create: vi.spyOn(patientService, 'createForNutritionist').mockImplementation(async (n) => fakePatient(n)),
      update: vi.spyOn(patientService, 'updateForNutritionist').mockImplementation(async (_id, n) => fakePatient(n)),
    };
  }

  const body = { firstName: 'Ana', lastName: 'Diaz' };

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
});

// Mismo criterio que pacientes, para los tres catálogos comunes: cada ruta exige
// token y le pasa al servicio el nutricionista del token, que es el autor en el
// alta y el que tiene que coincidir en la edición. El servicio se espía.
describe('rutas de catálogos — autenticación y autoría de punta a punta', () => {
  const ITEM_ID = '22222222-2222-2222-2222-222222222222';
  const GROUP_ID = '33333333-3333-3333-3333-333333333333';
  const tokenFor = (nutritionistId) => jwt.sign({ sub: nutritionistId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const CATALOGS = [
    {
      path: '/food-groups',
      service: foodGroupService,
      body: { name: 'Aves' },
      item: (createdById) => ({ id: ITEM_ID, name: 'Aves', description: null, parentId: null, createdById }),
    },
    {
      path: '/foods',
      service: foodService,
      body: { name: 'Caballa', foodGroupId: GROUP_ID, categories: ['protein', 'healthy_fat'] },
      updateExtra: { active: true },
      item: (createdById) => ({
        id: ITEM_ID,
        name: 'Caballa',
        active: true,
        foodGroupId: GROUP_ID,
        createdById,
        foodGroup: { id: GROUP_ID, name: 'Pescados', parentId: null },
        categories: [{ category: 'protein' }, { category: 'healthy_fat' }],
      }),
    },
    {
      path: '/pathologies',
      service: pathologyService,
      body: { name: 'Gota' },
      item: (createdById) => ({ id: ITEM_ID, name: 'Gota', description: null, createdById }),
    },
  ];

  function spyOnService({ service, item }) {
    return {
      list: vi.spyOn(service, 'list').mockResolvedValue([item('nutri-1')]),
      get: vi.spyOn(service, 'get').mockResolvedValue(item('nutri-1')),
      create: vi.spyOn(service, 'create').mockImplementation(async (n) => item(n)),
      update: vi.spyOn(service, 'update').mockImplementation(async (_id, n) => item(n)),
    };
  }

  describe.each(CATALOGS)('$path', (catalog) => {
    const { path, body, updateExtra = {} } = catalog;
    const updateBody = { ...body, ...updateExtra };

    it.each([
      ['GET', path],
      ['GET', `${path}/${ITEM_ID}`],
      ['POST', path],
      ['PUT', `${path}/${ITEM_ID}`],
    ])('%s %s sin token responde 401 y no llega al servicio', async (method, url) => {
      const spies = spyOnService(catalog);

      const response = await request(url, { method, body: method === 'GET' ? undefined : updateBody });

      expectUniformError(response, 401, 'UNAUTHORIZED');
      Object.values(spies).forEach((spy) => expect(spy).not.toHaveBeenCalled());
    });

    it.each(['nutri-1', 'nutri-2'])('alta y edición pasan al servicio el nutricionista del token (%s)', async (nutritionistId) => {
      const spies = spyOnService(catalog);
      const token = tokenFor(nutritionistId);

      const alta = await request(path, { method: 'POST', token, body });
      await request(`${path}/${ITEM_ID}`, { method: 'PUT', token, body: updateBody });

      expect(alta.status).toBe(201);
      expect(spies.create).toHaveBeenCalledWith(nutritionistId, expect.objectContaining(body));
      expect(spies.update).toHaveBeenCalledWith(ITEM_ID, nutritionistId, expect.objectContaining(body));
    });

    it('un createdById en el body se rechaza con 400 y no llega al servicio', async () => {
      const spies = spyOnService(catalog);

      const alta = await request(path, { method: 'POST', token: tokenFor('nutri-1'), body: { ...body, createdById: ITEM_ID } });

      expectUniformError(alta, 400, 'VALIDATION_ERROR');
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('la respuesta trae editable según el token y no expone el autor', async () => {
      spyOnService(catalog);

      const propio = await request(`${path}/${ITEM_ID}`, { token: tokenFor('nutri-1') });
      const ajeno = await request(`${path}/${ITEM_ID}`, { token: tokenFor('nutri-2') });

      expect(propio.json).toMatchObject({ id: ITEM_ID, editable: true });
      expect(ajeno.json).toMatchObject({ id: ITEM_ID, editable: false });
      expect(propio.json).not.toHaveProperty('createdById');
    });

    it('un id que no es UUID responde 404', async () => {
      const spies = spyOnService(catalog);

      const response = await request(`${path}/no-es-un-uuid`, { token: tokenFor('nutri-1') });

      expectUniformError(response, 404, 'NOT_FOUND');
      expect(spies.get).not.toHaveBeenCalled();
    });
  });

  it('GET /foods pasa al servicio los filtros ya parseados', async () => {
    const spies = spyOnService(CATALOGS[1]);

    const response = await request(`/foods?search=caba&groupId=${GROUP_ID}&includeInactive=true`, {
      token: tokenFor('nutri-1'),
    });

    expect(response.status).toBe(200);
    expect(response.json[0].categories).toEqual(['protein', 'healthy_fat']);
    expect(spies.list).toHaveBeenCalledWith({ search: 'caba', groupId: GROUP_ID, includeInactive: true });
  });

  it('un alimento sin categorías responde 400 en details.fields.categories', async () => {
    const spies = spyOnService(CATALOGS[1]);

    const response = await request('/foods', {
      method: 'POST',
      token: tokenFor('nutri-1'),
      body: { name: 'Caballa', foodGroupId: GROUP_ID, categories: [] },
    });

    expectUniformError(response, 400, 'VALIDATION_ERROR');
    expect(response.json.error.details.fields.categories).toBe('Indicá al menos una categoría');
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('un nombre repetido llega como 409 CONFLICT con details.fields.name', async () => {
    const message = 'Ya existe un alimento con ese nombre';
    vi.spyOn(foodService, 'create').mockRejectedValue(new AppError(409, message, { details: { fields: { name: message } } }));

    const response = await request('/foods', {
      method: 'POST',
      token: tokenFor('nutri-1'),
      body: { name: 'leche', foodGroupId: GROUP_ID, categories: ['protein'] },
    });

    expectUniformError(response, 409, 'CONFLICT');
    expect(response.json.error.details.fields.name).toBe(message);
  });

  it('editar un ítem ajeno llega como 403 FORBIDDEN', async () => {
    vi.spyOn(foodService, 'update').mockRejectedValue(new AppError(403, 'Solo quien cargó este ítem puede modificarlo'));

    const response = await request(`/foods/${ITEM_ID}`, {
      method: 'PUT',
      token: tokenFor('nutri-2'),
      body: { name: 'Caballa', foodGroupId: GROUP_ID, categories: ['protein'], active: false },
    });

    expectUniformError(response, 403, 'FORBIDDEN');
  });

  it('no hay DELETE de alimentos: la baja es lógica y el borrado físico no se expone', async () => {
    const response = await request(`/foods/${ITEM_ID}`, { method: 'DELETE', token: tokenFor('nutri-1') });

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
