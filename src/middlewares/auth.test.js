const jwt = require('jsonwebtoken');
const requireAuth = require('./auth');

describe('requireAuth middleware', () => {
  it('rechaza una request sin header de autorización con 401', () => {
    const req = { headers: {} };
    const next = vi.fn();

    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.nutricionistaId).toBeUndefined();
  });

  it('rechaza un token inválido con 401', () => {
    const req = { headers: { authorization: 'Bearer token-invalido' } };
    const next = vi.fn();

    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rechaza un token expirado con 401', () => {
    const expiredToken = jwt.sign({ sub: 'nutri-1' }, process.env.JWT_SECRET, { expiresIn: -1 });
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const next = vi.fn();

    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rechaza con 401 un token bien formado pero firmado con otro secreto', () => {
    const forged = jwt.sign({ sub: 'nutri-1' }, 'otro-secreto', { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${forged}` } };
    const next = vi.fn();

    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.nutricionistaId).toBeUndefined();
  });

  it('rechaza con 401 un token válido que no identifica a ningún nutricionista (sin sub)', () => {
    const tokenSinSub = jwt.sign({ rol: 'nutricionista' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${tokenSinSub}` } };
    const next = vi.fn();

    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.nutricionistaId).toBeUndefined();
  });

  it('con un token válido, inyecta nutricionistaId desde el payload verificado — nunca desde lo que ya traiga la request', () => {
    const token = jwt.sign({ sub: 'nutri-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
      nutricionistaId: 'valor-enviado-por-el-cliente',
    };
    const next = vi.fn();

    requireAuth(req, {}, next);

    expect(req.nutricionistaId).toBe('nutri-1');
    expect(next).toHaveBeenCalledWith();
  });
});
