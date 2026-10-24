const {
  createRecommendationSchema,
  updateRecommendationSchema,
  listRecommendationsQuerySchema,
} = require('./recommendation.schema');

const PATHOLOGY_ID = '11111111-1111-1111-1111-111111111111';

function issuesByField(result) {
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

const valid = { pathologyId: PATHOLOGY_ID, title: 'Ejemplo ficticio', text: 'Texto de ejemplo.' };

describe('recommendation.schema — alta', () => {
  it('acepta una recomendación completa', () => {
    expect(createRecommendationSchema.parse(valid)).toEqual(valid);
  });

  it('exige patología, título y texto', () => {
    const result = createRecommendationSchema.safeParse({});

    expect(issuesByField(result)).toEqual({
      pathologyId: 'Elegí una patología',
      title: 'El título es obligatorio',
      text: 'El texto es obligatorio',
    });
  });

  it('un título o un texto con solo espacios cuentan como vacíos', () => {
    const result = createRecommendationSchema.safeParse({ ...valid, title: '   ', text: '\n  ' });

    expect(issuesByField(result)).toEqual({ title: 'El título es obligatorio', text: 'El texto es obligatorio' });
  });

  it('normaliza los espacios del título y conserva los saltos de línea del texto', () => {
    const result = createRecommendationSchema.safeParse({ ...valid, title: '  Dos   palabras ', text: ' Uno.\nDos. ' });

    expect(result.data).toMatchObject({ title: 'Dos palabras', text: 'Uno.\nDos.' });
  });

  it('limita el largo del título y del texto', () => {
    const result = createRecommendationSchema.safeParse({ ...valid, title: 'a'.repeat(151), text: 'a'.repeat(5001) });

    expect(issuesByField(result)).toEqual({
      title: 'No puede superar los 150 caracteres',
      text: 'No puede superar los 5000 caracteres',
    });
  });

  it.each([
    ['nutritionistId', 'nutri-2'],
    ['active', false],
  ])('rechaza %s en el alta', (key, value) => {
    expect(createRecommendationSchema.safeParse({ ...valid, [key]: value }).success).toBe(false);
  });
});

describe('recommendation.schema — edición', () => {
  it('active es opcional: omitido no aparece', () => {
    const result = updateRecommendationSchema.safeParse(valid);

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('active');
  });

  it('acepta la baja lógica y rechaza un active que no es booleano', () => {
    expect(updateRecommendationSchema.safeParse({ ...valid, active: false }).data.active).toBe(false);
    expect(issuesByField(updateRecommendationSchema.safeParse({ ...valid, active: 'no' }))).toEqual({
      active: 'Debe ser verdadero o falso',
    });
  });
});

describe('recommendation.schema — query del listado', () => {
  it('sin parámetros, todas las patologías y solo vigentes', () => {
    expect(listRecommendationsQuerySchema.parse({})).toEqual({ pathologyId: null, includeInactive: false });
  });

  it('parsea el filtro por patología y includeInactive', () => {
    expect(listRecommendationsQuerySchema.parse({ pathologyId: PATHOLOGY_ID, includeInactive: 'true' })).toEqual({
      pathologyId: PATHOLOGY_ID,
      includeInactive: true,
    });
  });

  it('rechaza una patología que no es UUID, un booleano inválido y parámetros desconocidos', () => {
    expect(issuesByField(listRecommendationsQuerySchema.safeParse({ pathologyId: 'x', includeInactive: 'si' }))).toEqual({
      pathologyId: 'La patología no es válida',
      includeInactive: 'Debe ser true o false',
    });
    expect(listRecommendationsQuerySchema.safeParse({ search: 'x' }).success).toBe(false);
  });
});
