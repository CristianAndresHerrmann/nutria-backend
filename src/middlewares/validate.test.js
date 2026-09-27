const { z } = require('zod');
const validate = require('./validate');
const { emptyQuerySchema } = require('../schemas/common.schema');
const { patientIdParamsSchema } = require('../schemas/patient.schema');

const bodySchema = z.strictObject({
  firstName: z.string().min(1, 'El nombre es obligatorio'),
  age: z.coerce.number(),
});

function run(middleware, req) {
  const next = vi.fn();
  middleware(req, {}, next);
  return next;
}

describe('validate middleware', () => {
  it('deja los datos parseados en req.validated y sigue', () => {
    const req = { body: { firstName: 'Ana', age: '30' }, query: {} };

    const next = run(validate({ body: bodySchema, query: emptyQuerySchema }), req);

    expect(next).toHaveBeenCalledWith();
    // Parseados, no crudos: age llega como número.
    expect(req.validated).toEqual({ body: { firstName: 'Ana', age: 30 }, query: {} });
  });

  it('un body inválido da 400 VALIDATION_ERROR con el mensaje de cada campo en details.fields', () => {
    const req = { body: { firstName: '', age: 'abc' } };

    const next = run(validate({ body: bodySchema }), req);

    const error = next.mock.calls[0][0];
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'El nombre es obligatorio' });
    expect(error.details.fields).toMatchObject({ firstName: 'El nombre es obligatorio' });
    expect(error.details.fields).toHaveProperty('age');
    expect(req.validated).toBeUndefined();
  });

  it('un body ausente se valida como objeto vacío en vez de romper', () => {
    const next = run(validate({ body: bodySchema }), {});

    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('un parámetro de query desconocido da 400', () => {
    const next = run(validate({ query: emptyQuerySchema }), { query: { page: '2' } });

    expect(next.mock.calls[0][0]).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('con notFoundOnInvalidParams, un id que no es UUID da 404 sin details', () => {
    const middleware = validate({ params: patientIdParamsSchema }, { notFoundOnInvalidParams: 'Paciente no encontrado' });

    const next = run(middleware, { params: { id: 'no-es-un-uuid' } });

    const error = next.mock.calls[0][0];
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Paciente no encontrado' });
    expect(error.details).toBeUndefined();
  });

  it('valida los params antes que el body: un id inválido da 404 aunque el body también sea inválido', () => {
    const middleware = validate(
      { params: patientIdParamsSchema, body: bodySchema },
      { notFoundOnInvalidParams: 'Paciente no encontrado' },
    );

    const next = run(middleware, { params: { id: 'x' }, body: {} });

    expect(next.mock.calls[0][0].status).toBe(404);
  });

  it('acepta un id con forma de UUID', () => {
    const req = { params: { id: '11111111-1111-1111-1111-111111111111' } };

    const next = run(validate({ params: patientIdParamsSchema }), req);

    expect(next).toHaveBeenCalledWith();
    expect(req.validated.params.id).toBe('11111111-1111-1111-1111-111111111111');
  });
});
