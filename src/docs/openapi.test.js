const openapiSpec = require('./openapi');

// Las fallas de swagger-jsdoc son silenciosas: un bloque @openapi mal indentado
// hace que la operación entera desaparezca del spec sin error ni advertencia, y
// un $ref con un typo rompe la UI recién cuando alguien la abre. Estos tests
// cubren esos dos casos.

// Toda operación documentada del backend. Es una lista literal a propósito: si
// alguien agrega una ruta y se olvida de documentarla, este test falla.
const EXPECTED_OPERATIONS = [
  'get /health',
  'get /health/ia',
  'post /auth/login',
  'get /patients',
  'post /patients',
  'get /patients/{id}',
  'put /patients/{id}',
  'get /patients/{id}/conditions',
  'post /patients/{id}/conditions',
  'put /patients/{id}/conditions/{conditionId}',
  'delete /patients/{id}/conditions/{conditionId}',
  'get /patients/{id}/consultations',
  'post /patients/{id}/consultations',
  'get /patients/{id}/consultations/{consultationId}',
  'put /patients/{id}/consultations/{consultationId}',
  'get /patients/{id}/measurements',
  'post /patients/{id}/measurements',
  'put /patients/{id}/measurements/{measurementId}',
  'delete /patients/{id}/measurements/{measurementId}',
  'get /food-groups',
  'get /food-groups/{id}',
  'get /foods',
  'post /foods',
  'get /foods/{id}',
  'get /pathologies',
  'get /pathologies/{id}',
  'get /recipes',
  'post /recipes',
  'get /recipes/{id}',
  'put /recipes/{id}',
];

const PROTECTED_OPERATIONS = [
  ['/patients', 'get'],
  ['/patients', 'post'],
  ['/patients/{id}', 'get'],
  ['/patients/{id}', 'put'],
  ['/patients/{id}/conditions', 'get'],
  ['/patients/{id}/conditions', 'post'],
  ['/patients/{id}/conditions/{conditionId}', 'put'],
  ['/patients/{id}/conditions/{conditionId}', 'delete'],
  ['/patients/{id}/consultations', 'get'],
  ['/patients/{id}/consultations', 'post'],
  ['/patients/{id}/consultations/{consultationId}', 'get'],
  ['/patients/{id}/consultations/{consultationId}', 'put'],
  ['/patients/{id}/measurements', 'get'],
  ['/patients/{id}/measurements', 'post'],
  ['/patients/{id}/measurements/{measurementId}', 'put'],
  ['/patients/{id}/measurements/{measurementId}', 'delete'],
  ['/food-groups', 'get'],
  ['/food-groups/{id}', 'get'],
  ['/foods', 'get'],
  ['/foods', 'post'],
  ['/foods/{id}', 'get'],
  ['/pathologies', 'get'],
  ['/pathologies/{id}', 'get'],
  ['/recipes', 'get'],
  ['/recipes', 'post'],
  ['/recipes/{id}', 'get'],
  ['/recipes/{id}', 'put'],
];

function listOperations(spec) {
  const operations = [];
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of Object.keys(pathItem)) {
      operations.push(`${method} ${path}`);
    }
  }
  return operations.sort();
}

function collectRefs(node, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
    return found;
  }

  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push(value);
      else collectRefs(value, found);
    }
  }

  return found;
}

function resolveRef(spec, ref) {
  // Solo referencias internas: '#/components/schemas/Patient'.
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((current, segment) => (current ? current[segment] : undefined), spec);
}

describe('spec OpenAPI del backend', () => {
  it('se genera como documento 3.0 con título y versión', () => {
    expect(openapiSpec.openapi).toBe('3.0.3');
    expect(openapiSpec.info.title).toBe('nutria-backend');
    expect(openapiSpec.info.version).toBeTruthy();
  });

  it('documenta exactamente las operaciones implementadas', () => {
    expect(listOperations(openapiSpec)).toEqual([...EXPECTED_OPERATIONS].sort());
  });

  it('declara bearerAuth como esquema de seguridad', () => {
    expect(openapiSpec.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it.each(PROTECTED_OPERATIONS)('%s %s exige token y documenta el 401', (path, method) => {
    const operation = openapiSpec.paths[path][method];

    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation.responses['401']).toBeDefined();
  });

  it('deja públicas las rutas que no pasan por requireAuth', () => {
    expect(openapiSpec.paths['/health'].get.security).toBeUndefined();
    expect(openapiSpec.paths['/health/ia'].get.security).toBeUndefined();
    expect(openapiSpec.paths['/auth/login'].post.security).toBeUndefined();
  });

  it('documenta el alta de paciente como 201 y no como 200', () => {
    const responses = openapiSpec.paths['/patients'].post.responses;

    expect(responses['201']).toBeDefined();
    expect(responses['200']).toBeUndefined();
  });

  it('documenta el alta de alimento como 201, con el 409 por nombre repetido', () => {
    const responses = openapiSpec.paths['/foods'].post.responses;

    expect(responses['201']).toBeDefined();
    expect(responses['409']).toBeDefined();
  });

  it('documenta el alta de condición como 201 con el 409 por duplicado, y la baja como 204', () => {
    const create = openapiSpec.paths['/patients/{id}/conditions'].post.responses;
    const remove = openapiSpec.paths['/patients/{id}/conditions/{conditionId}'].delete.responses;

    expect(create['201']).toBeDefined();
    expect(create['409']).toBeDefined();
    expect(remove['204']).toBeDefined();
  });

  it('documenta el alta de consulta como 201, y no documenta su borrado', () => {
    const create = openapiSpec.paths['/patients/{id}/consultations'].post.responses;

    expect(create['201']).toBeDefined();
    expect(openapiSpec.paths['/patients/{id}/consultations/{consultationId}'].delete).toBeUndefined();
  });

  it('no documenta edición ni borrado de alimentos: el nutricionista no los modifica', () => {
    expect(openapiSpec.paths['/foods/{id}'].put).toBeUndefined();
    expect(openapiSpec.paths['/foods/{id}'].delete).toBeUndefined();
  });

  it('documenta el alta de receta como 201, y no documenta su borrado: la baja es lógica', () => {
    expect(openapiSpec.paths['/recipes'].post.responses['201']).toBeDefined();
    expect(openapiSpec.paths['/recipes/{id}'].delete).toBeUndefined();
  });

  it('documenta el 503 del diagnóstico de IA', () => {
    expect(openapiSpec.paths['/health/ia'].get.responses['503']).toBeDefined();
  });

  it('describe el error con el formato { error: { code, message, details? } }', () => {
    const errorSchema = openapiSpec.components.schemas.Error;

    expect(errorSchema.properties.error.required).toEqual(['code', 'message']);
    expect(errorSchema.properties.error.properties.details.properties.fields).toBeDefined();
  });

  it('no deja ningún $ref colgado', () => {
    const refs = collectRefs(openapiSpec);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(resolveRef(openapiSpec, ref), `$ref sin destino: ${ref}`).toBeDefined();
    }
  });
});
