const errorHandler = require('./errorHandler');
const AppError = require('../utils/AppError');

function createRes({ headersSent = false } = {}) {
  const res = { headersSent };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

const req = { method: 'GET', originalUrl: '/algo' };

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responde un AppError con { error: { code, message } } y su status', () => {
    const res = createRes();

    errorHandler(new AppError(401, 'No autenticado'), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } });
  });

  it('incluye details cuando el AppError los trae', () => {
    const res = createRes();
    const details = { fields: { firstName: 'El nombre es obligatorio' } };

    errorHandler(new AppError(400, 'El nombre es obligatorio', { code: 'VALIDATION_ERROR', details }), req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_ERROR', message: 'El nombre es obligatorio', details },
    });
  });

  it('un error inesperado sale como 500 genérico, sin stack ni el mensaje interno', () => {
    const res = createRes();
    const error = new Error('relation "patient" does not exist at /app/src/repositories/x.js');

    errorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(JSON.stringify(body)).not.toContain('/app/src');
    // El detalle no se pierde: queda en el log del servidor.
    expect(console.error).toHaveBeenCalled();
  });

  it('un error que no es una instancia de Error también sale como 500', () => {
    const res = createRes();

    errorHandler('algo raro', req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
  });

  it('un body que no es JSON válido da 400 INVALID_JSON sin el mensaje del parser', () => {
    const res = createRes();
    const error = Object.assign(new SyntaxError('Unexpected token b in JSON at position 1'), {
      type: 'entity.parse.failed',
      status: 400,
    });

    errorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es JSON válido' },
    });
  });

  it('un body demasiado grande da 413', () => {
    const res = createRes();

    errorHandler(Object.assign(new Error('request entity too large'), { type: 'entity.too.large' }), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json.mock.calls[0][0].error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('una violación de unicidad de Prisma (P2002) da 409 con el campo en details.fields', () => {
    const res = createRes();
    const error = Object.assign(new Error('Unique constraint failed on the fields: (email)'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
    });

    errorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    const { error: body } = res.json.mock.calls[0][0];
    expect(body.code).toBe('CONFLICT');
    expect(body.details.fields).toHaveProperty('email');
    expect(body.message).not.toContain('Unique constraint');
  });

  it('un registro inexistente de Prisma (P2025) da 404', () => {
    const res = createRes();
    const error = Object.assign(new Error('Record not found'), { name: 'PrismaClientKnownRequestError', code: 'P2025' });

    errorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('la base caída da 503 y no un 500 con el error de conexión', () => {
    const res = createRes();
    const error = Object.assign(new Error('Cannot reach database server at postgres:5432'), {
      name: 'PrismaClientInitializationError',
    });

    errorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('postgres');
  });

  it('si la respuesta ya empezó a salir, delega en Express en vez de mandar otra', () => {
    const res = createRes({ headersSent: true });
    const next = vi.fn();
    const error = new Error('falló a mitad de camino');

    errorHandler(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});
