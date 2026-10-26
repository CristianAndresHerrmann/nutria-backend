const express = require('express');
const { createLoginRateLimiter, TOO_MANY_LOGIN_ATTEMPTS_MESSAGE } = require('./rateLimit');
const errorHandler = require('./errorHandler');
const AppError = require('../utils/AppError');

// App mínima con el limitador real y el errorHandler real: el login de verdad
// usa una instancia con el límite de la configuración, y su contador no se
// puede reiniciar entre tests. Un body con ok: true simula un login exitoso.
let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.post('/login', createLoginRateLimiter({ windowMs: 60_000, limit: 2 }), (req, res, next) => {
    if (req.body.ok) return res.status(200).json({ token: 'x' });
    next(new AppError(401, 'Credenciales inválidas'));
  });
  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function login(ok) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok }),
  });
  return { status: response.status, json: await response.json() };
}

describe('rate limit del login', () => {
  it('los logins exitosos no consumen el límite; superados los fallidos, responde 429 con el formato uniforme', async () => {
    expect((await login(true)).status).toBe(200);
    expect((await login(true)).status).toBe(200);
    expect((await login(true)).status).toBe(200);

    expect((await login(false)).status).toBe(401);
    expect((await login(false)).status).toBe(401);

    const blocked = await login(false);
    expect(blocked.status).toBe(429);
    expect(blocked.json).toEqual({ error: { code: 'TOO_MANY_REQUESTS', message: TOO_MANY_LOGIN_ATTEMPTS_MESSAGE } });

    // Bloqueado, ni siquiera la contraseña correcta pasa hasta que vence la ventana.
    expect((await login(true)).status).toBe(429);
  });
});
