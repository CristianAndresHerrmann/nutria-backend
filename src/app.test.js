const jwt = require('jsonwebtoken');
const app = require('./app');
const patientService = require('./services/patient.service');

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
