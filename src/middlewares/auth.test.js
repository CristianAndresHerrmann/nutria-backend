const jwt = require('jsonwebtoken');
const { createRequireAuth, requireRole } = require('./auth');

// Cuentas que el repositorio falso conoce. requireAuth lee rol y estado de acá
// en cada request, no del token.
const ACCOUNTS = {
  'nutri-1': { role: 'nutritionist', active: true, tokenVersion: 0 },
  'nutri-baja': { role: 'nutritionist', active: false, tokenVersion: 0 },
  'admin-1': { role: 'admin', active: true, tokenVersion: 0 },
};

function buildRequireAuth(accounts = ACCOUNTS) {
  const repository = { findAuthState: vi.fn(async (id) => accounts[id] || null) };
  return { requireAuth: createRequireAuth({ nutritionistRepository: repository, jwtSecret: process.env.JWT_SECRET }), repository };
}

const sign = (payload, options = { expiresIn: '1h' }) => jwt.sign(payload, process.env.JWT_SECRET, options);
const withToken = (token) => ({ headers: { authorization: `Bearer ${token}` } });

describe('requireAuth middleware', () => {
  it('rechaza una request sin header de autorización con 401', async () => {
    const { requireAuth, repository } = buildRequireAuth();
    const req = { headers: {} };
    const next = vi.fn();

    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.nutricionistaId).toBeUndefined();
    expect(repository.findAuthState).not.toHaveBeenCalled();
  });

  it('rechaza un token inválido con 401', async () => {
    const { requireAuth } = buildRequireAuth();
    const next = vi.fn();

    await requireAuth(withToken('token-invalido'), {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rechaza un token expirado con 401', async () => {
    const { requireAuth } = buildRequireAuth();
    const next = vi.fn();

    await requireAuth(withToken(sign({ sub: 'nutri-1' }, { expiresIn: -1 })), {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rechaza con 401 un token bien formado pero firmado con otro secreto', async () => {
    const { requireAuth } = buildRequireAuth();
    const forged = jwt.sign({ sub: 'nutri-1' }, 'otro-secreto', { expiresIn: '1h' });
    const req = withToken(forged);
    const next = vi.fn();

    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.nutricionistaId).toBeUndefined();
  });

  it('rechaza con 401 un token válido que no identifica a ninguna cuenta (sin sub)', async () => {
    const { requireAuth } = buildRequireAuth();
    const req = withToken(sign({ role: 'nutritionist' }));
    const next = vi.fn();

    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.nutricionistaId).toBeUndefined();
  });

  it('con un token válido, inyecta nutricionistaId desde el payload verificado — nunca desde lo que ya traiga la request', async () => {
    const { requireAuth } = buildRequireAuth();
    const req = { ...withToken(sign({ sub: 'nutri-1', role: 'nutritionist' })), nutricionistaId: 'valor-enviado-por-el-cliente' };
    const next = vi.fn();

    await requireAuth(req, {}, next);

    expect(req.nutricionistaId).toBe('nutri-1');
    expect(req.role).toBe('nutritionist');
    expect(next).toHaveBeenCalledWith();
  });

  it('corta con 401 el token vigente de una cuenta desactivada', async () => {
    const { requireAuth } = buildRequireAuth();
    const req = withToken(sign({ sub: 'nutri-baja', role: 'nutritionist' }));
    const next = vi.fn();

    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: 'Token inválido o expirado' }));
    expect(req.nutricionistaId).toBeUndefined();
  });

  it('rechaza con 401 el token de una cuenta que ya no existe', async () => {
    const { requireAuth } = buildRequireAuth();
    const next = vi.fn();

    await requireAuth(withToken(sign({ sub: 'borrada' })), {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('toma el rol de la base y no del token: un token que dice admin no da acceso de admin', async () => {
    const { requireAuth } = buildRequireAuth();
    const req = withToken(sign({ sub: 'nutri-1', role: 'admin' }));
    const next = vi.fn();

    await requireAuth(req, {}, next);

    expect(req.role).toBe('nutritionist');
  });

  it('un error al leer la cuenta llega al errorHandler en vez de dejar pasar la request', async () => {
    const failure = new Error('base caída');
    const requireAuth = createRequireAuth({
      nutritionistRepository: { findAuthState: vi.fn(async () => { throw failure; }) },
      jwtSecret: process.env.JWT_SECRET,
    });
    const req = withToken(sign({ sub: 'nutri-1' }));
    const next = vi.fn();

    await requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(req.nutricionistaId).toBeUndefined();
  });
});

describe('requireAuth — revocación tras restablecer la contraseña (AUD-016)', () => {
  it.each([
    [undefined, 0, true],
    [undefined, 1, false],
    [0, 1, false],
    [1, 1, true],
    [2, 1, false],
  ])('token versión %s y cuenta versión %s: acceso %s', async (tokenVersion, currentVersion, allowed) => {
    const { requireAuth } = buildRequireAuth({ 'nutri-1': { role: 'nutritionist', active: true, tokenVersion: currentVersion } });
    const req = withToken(sign({ sub: 'nutri-1', tokenVersion }));
    const next = vi.fn();

    await requireAuth(req, {}, next);

    if (allowed) {
      expect(next).toHaveBeenCalledWith();
      expect(req.nutricionistaId).toBe('nutri-1');
    } else {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, message: 'Token inválido o expirado' }));
      expect(req.nutricionistaId).toBeUndefined();
    }
  });

  it.each([null, '0', -1, 0.5, {}])('rechaza una versión mal formada (%j) antes de consultar la cuenta', async (tokenVersion) => {
    const { requireAuth, repository } = buildRequireAuth();
    const next = vi.fn();

    await requireAuth(withToken(sign({ sub: 'nutri-1', tokenVersion })), {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(repository.findAuthState).not.toHaveBeenCalled();
  });

  it('distingue el token anterior y el nuevo aunque tengan exactamente el mismo iat', async () => {
    const { requireAuth } = buildRequireAuth({ 'nutri-1': { role: 'nutritionist', active: true, tokenVersion: 1 } });
    const iat = Math.floor(Date.now() / 1000);
    const before = sign({ sub: 'nutri-1', tokenVersion: 0, iat });
    const after = sign({ sub: 'nutri-1', tokenVersion: 1, iat });
    const rejected = vi.fn();
    const accepted = vi.fn();

    await requireAuth(withToken(before), {}, rejected);
    await requireAuth(withToken(after), {}, accepted);

    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(accepted).toHaveBeenCalledWith();
  });
});

describe('requireRole middleware', () => {
  it.each([
    ['nutritionist', 'nutritionist'],
    ['admin', 'admin'],
  ])('deja pasar a una cuenta %s en una ruta de %s', (role, required) => {
    const next = vi.fn();

    requireRole(required)({ role }, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['admin', 'nutritionist'],
    ['nutritionist', 'admin'],
  ])('responde 403 a una cuenta %s en una ruta de %s', (role, required) => {
    const next = vi.fn();

    requireRole(required)({ role }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'FORBIDDEN' }));
  });
});
