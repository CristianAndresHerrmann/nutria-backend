const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const app = require('../app');
const { ensureAdmin } = require('../../scripts/create-admin');
const { prisma, snapshotDatabase } = require('../test/integration');

const PASSWORD = 'Clave-ficticia-inicial-1!';
let server;
let baseUrl;
let admin;
let target;
let other;

beforeAll(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  [admin, target, other] = await Promise.all([
    ['admin', 'admin'], ['target', 'nutritionist'], ['other', 'nutritionist'],
  ].map(([label, role]) => prisma.nutritionist.create({ data: {
    name: `Cuenta ficticia ${label}`, email: `${label}@example.test`, role, passwordHash,
  } })));
});

async function request(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

async function login(account, password = PASSWORD) {
  const response = await request('/auth/login', { method: 'POST', body: { email: account.email, password } });
  expect(response.status).toBe(200);
  expect(response.body.nutritionist).not.toHaveProperty('tokenVersion');
  return response.body.token;
}

function reset(token, account, password) {
  return request(`/admin/nutritionists/${account.id}/password`, { token, method: 'PUT', body: { password } });
}

const claims = (token) => jwt.verify(token, process.env.JWT_SECRET);

it('dos restablecimientos dentro del mismo segundo revocan todas las sesiones anteriores y permiten el nuevo login', async () => {
  // Solo se fija Date.now para el iat de JWT; los timers y el servidor HTTP son reales.
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const adminToken = await login(admin);
  const oldToken = await login(target);
  const otherToken = await login(other);
  const legacyToken = jwt.sign({ sub: target.id, role: 'nutritionist' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  expect((await request('/patients', { token: legacyToken })).status).toBe(200);

  expect((await reset(adminToken, target, 'Nueva-clave-ficticia-1!')).status).toBe(204);
  for (const token of [oldToken, legacyToken]) {
    const response = await request('/patients', { token });
    expect(response).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Token inválido o expirado' } } });
  }
  expect((await request('/auth/login', { method: 'POST', body: { email: target.email, password: PASSWORD } })).status).toBe(401);
  const firstNewToken = await login(target, 'Nueva-clave-ficticia-1!');
  expect((await request('/patients', { token: firstNewToken })).status).toBe(200);

  expect((await reset(adminToken, target, 'Nueva-clave-ficticia-2!')).status).toBe(204);
  expect((await request('/patients', { token: firstNewToken })).status).toBe(401);
  const secondNewToken = await login(target, 'Nueva-clave-ficticia-2!');
  expect((await request('/patients', { token: secondNewToken })).status).toBe(200);
  expect([oldToken, firstNewToken, secondNewToken].map((token) => claims(token).tokenVersion)).toEqual([0, 1, 2]);
  expect(new Set([oldToken, firstNewToken, secondNewToken].map((token) => claims(token).iat)).size).toBe(1);
  expect((await request('/patients', { token: otherToken })).status).toBe(200);
  const accounts = await request('/admin/nutritionists', { token: adminToken });
  expect(accounts.status).toBe(200);
  expect(accounts.body.every((account) => !('tokenVersion' in account) && !('passwordHash' in account))).toBe(true);
});

it('los restablecimientos concurrentes incrementan la versión sin perder revocaciones', async () => {
  const adminToken = await login(admin);
  const oldToken = await login(target);
  const passwords = ['Concurrente-ficticia-A!', 'Concurrente-ficticia-B!'];

  const results = await Promise.all(passwords.map((password) => reset(adminToken, target, password)));

  expect(results.map(({ status }) => status)).toEqual([204, 204]);
  const stored = await prisma.nutritionist.findUnique({ where: { id: target.id } });
  expect(stored.tokenVersion).toBe(2);
  expect((await request('/patients', { token: oldToken })).status).toBe(401);
  const intermediateToken = jwt.sign({ sub: target.id, tokenVersion: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  expect((await request('/patients', { token: intermediateToken })).status).toBe(401);
  const winner = (await bcrypt.compare(passwords[0], stored.passwordHash)) ? passwords[0] : passwords[1];
  const newToken = await login(target, winner);
  expect(claims(newToken).tokenVersion).toBe(2);
  expect((await request('/patients', { token: newToken })).status).toBe(200);
});

it('un nutricionista no puede restablecer otra cuenta y el panel no modifica administradores ni IDs inexistentes', async () => {
  const adminToken = await login(admin);
  const otherToken = await login(other);
  const before = await snapshotDatabase();

  expect((await reset(otherToken, target, 'No-debe-guardarse-1!')).status).toBe(403);
  expect((await reset(adminToken, admin, 'No-debe-guardarse-1!')).status).toBe(404);
  expect((await reset(adminToken, { id: randomUUID() }, 'No-debe-guardarse-1!')).status).toBe(404);
  expect((await request(`/admin/nutritionists/${target.id}/password`, {
    token: adminToken, method: 'PUT', body: { password: 'No-debe-guardarse-1!', tokenVersion: 0 },
  })).status).toBe(400);
  expect(await snapshotDatabase()).toEqual(before);
});

it('rotar la contraseña mediante create-admin también invalida el token anterior del administrador', async () => {
  const oldAdminToken = await login(admin);
  const otherToken = await login(other);

  await ensureAdmin(prisma, { email: admin.email, name: admin.name, password: 'Nueva-admin-ficticia-1!' });

  expect((await request('/admin/nutritionists', { token: oldAdminToken })).status).toBe(401);
  const newAdminToken = await login(admin, 'Nueva-admin-ficticia-1!');
  expect(claims(newAdminToken).tokenVersion).toBe(1);
  expect((await request('/admin/nutritionists', { token: newAdminToken })).status).toBe(200);
  expect((await request('/patients', { token: otherToken })).status).toBe(200);
});
