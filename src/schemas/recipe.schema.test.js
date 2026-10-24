const { createRecipeSchema, updateRecipeSchema, listRecipesQuerySchema } = require('./recipe.schema');

const FOOD_1 = '11111111-1111-1111-1111-111111111111';
const FOOD_2 = '22222222-2222-2222-2222-222222222222';
const FOOD_3 = '33333333-3333-3333-3333-333333333333';

function issuesByField(result) {
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

const validRecipe = {
  name: 'Ensalada de arroz y atún',
  mealTypes: ['lunch', 'dinner'],
  ingredients: [
    { foodId: FOOD_1, quantityDescription: '1 taza cocida' },
    { foodId: FOOD_2, quantityDescription: '1 lata' },
    { foodId: FOOD_3 },
  ],
};

describe('recipe.schema — alta', () => {
  it('acepta una receta mínima y completa los opcionales con null', () => {
    const result = createRecipeSchema.safeParse(validRecipe);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      preparation: null,
      finalNote: null,
      cookingMethod: null,
      timeMinutes: null,
      purchasePlace: null,
    });
    expect(result.data.ingredients[2]).toEqual({ foodId: FOOD_3, quantityDescription: null });
  });

  it('acepta todos los campos opcionales', () => {
    const result = createRecipeSchema.safeParse({
      ...validRecipe,
      preparation: '1. Hervir el arroz.',
      finalNote: 'Se conserva en heladera.',
      cookingMethod: 'stovetop',
      timeMinutes: 25,
      purchasePlace: 'Supermercado',
    });

    expect(result.success).toBe(true);
  });

  it('normaliza los espacios del nombre y lo exige', () => {
    expect(createRecipeSchema.parse({ ...validRecipe, name: '  Budín   de  avena ' }).name).toBe('Budín de avena');
    expect(issuesByField(createRecipeSchema.safeParse({ ...validRecipe, name: '   ' })).name).toBe(
      'El nombre de la receta es obligatorio',
    );
  });

  it.each([
    [[], 'Indicá al menos un tipo de comida'],
    [['lunch', 'lunch'], 'Hay tipos de comida repetidos'],
    [['brunch'], 'El tipo de comida no es válido'],
  ])('rechaza los tipos de comida %j', (mealTypes, message) => {
    const result = createRecipeSchema.safeParse({ ...validRecipe, mealTypes });

    expect(result.success).toBe(false);
    expect(issuesByField(result).mealTypes).toBe(message);
  });

  it('rechaza una receta sin ingredientes', () => {
    const result = createRecipeSchema.safeParse({ ...validRecipe, ingredients: [] });

    expect(issuesByField(result).ingredients).toBe('Agregá al menos un ingrediente');
  });

  it('rechaza un alimento repetido: las tandas van en la preparación', () => {
    const result = createRecipeSchema.safeParse({
      ...validRecipe,
      ingredients: [{ foodId: FOOD_1 }, { foodId: FOOD_1, quantityDescription: 'el resto' }],
    });

    expect(issuesByField(result).ingredients).toMatch(/alimentos repetidos/);
  });

  it.each([
    ['texto libre en vez de un alimento', { name: 'harina' }],
    ['un id que no es UUID', { foodId: 'harina' }],
    ['el orden mandado por el cliente', { foodId: FOOD_1, order: 1 }],
  ])('rechaza un ingrediente con %s', (_label, ingredient) => {
    const result = createRecipeSchema.safeParse({ ...validRecipe, ingredients: [ingredient] });

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('ingredients');
  });

  it.each([0, -5, 12.5, 1441, '20'])('rechaza el tiempo %j', (timeMinutes) => {
    const result = createRecipeSchema.safeParse({ ...validRecipe, timeMinutes });

    expect(issuesByField(result)).toHaveProperty('timeMinutes');
  });

  it('rechaza un método de cocción desconocido', () => {
    const result = createRecipeSchema.safeParse({ ...validRecipe, cookingMethod: 'airfryer' });

    expect(issuesByField(result).cookingMethod).toBe('El método de cocción no es válido');
  });

  it.each([
    ['nutritionistId', 'nutri-2'],
    ['origin', 'ai_generated'],
    ['availableInCatalog', false],
  ])('el alta rechaza %s en el body', (key, value) => {
    expect(createRecipeSchema.safeParse({ ...validRecipe, [key]: value }).success).toBe(false);
  });
});

describe('recipe.schema — edición', () => {
  it('acepta la baja lógica y deja availableInCatalog sin definir si no viene', () => {
    expect(updateRecipeSchema.parse({ ...validRecipe, availableInCatalog: false }).availableInCatalog).toBe(false);
    expect(updateRecipeSchema.parse(validRecipe).availableInCatalog).toBeUndefined();
  });

  it('rechaza un availableInCatalog que no es booleano, y el origen', () => {
    expect(updateRecipeSchema.safeParse({ ...validRecipe, availableInCatalog: 'no' }).success).toBe(false);
    expect(updateRecipeSchema.safeParse({ ...validRecipe, origin: 'professional' }).success).toBe(false);
  });
});

describe('recipe.schema — query del listado', () => {
  it('sin parámetros, solo disponibles y sin filtros', () => {
    expect(listRecipesQuerySchema.parse({})).toEqual({ mealType: null, includeUnavailable: false, patientId: null });
  });

  it('parsea los filtros', () => {
    expect(listRecipesQuerySchema.parse({ mealType: 'breakfast', includeUnavailable: 'true', patientId: FOOD_1 })).toEqual({
      mealType: 'breakfast',
      includeUnavailable: true,
      patientId: FOOD_1,
    });
  });

  it.each([{ mealType: 'brunch' }, { includeUnavailable: 'si' }, { patientId: 'x' }, { search: 'arroz' }])(
    'rechaza %j',
    (query) => {
      expect(listRecipesQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});
