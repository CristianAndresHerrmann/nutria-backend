const { createFoodSchema, updateFoodSchema, listFoodsQuerySchema } = require('./food.schema');

const GROUP_ID = '33333333-3333-3333-3333-333333333333';

function issuesByField(result) {
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

const validFood = { name: 'Caballa', foodGroupId: GROUP_ID, categories: ['protein', 'healthy_fat'] };

describe('food.schema — categorías (RF-25)', () => {
  it('acepta un alimento con dos categorías válidas', () => {
    const result = createFoodSchema.safeParse(validFood);

    expect(result.success).toBe(true);
    expect(result.data.categories).toEqual(['protein', 'healthy_fat']);
  });

  it('acepta cada una de las seis categorías del modelo', () => {
    const categories = ['protein', 'carbohydrate', 'fiber', 'vegetable', 'healthy_fat', 'infusion'];

    for (const category of categories) {
      expect(createFoodSchema.safeParse({ ...validFood, categories: [category] }).success).toBe(true);
    }
  });

  it('rechaza un alimento sin categorías', () => {
    const result = createFoodSchema.safeParse({ ...validFood, categories: [] });

    expect(result.success).toBe(false);
    expect(issuesByField(result).categories).toBe('Indicá al menos una categoría');
  });

  it('rechaza un alimento sin el campo categories', () => {
    const { categories: _categories, ...withoutCategories } = validFood;

    const result = createFoodSchema.safeParse(withoutCategories);

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('categories');
  });

  it('rechaza una categoría que no existe en el modelo', () => {
    const result = createFoodSchema.safeParse({ ...validFood, categories: ['protein', 'dulce'] });

    expect(result.success).toBe(false);
    expect(issuesByField(result).categories).toBe('La categoría no es válida');
  });

  it('rechaza categorías repetidas', () => {
    const result = createFoodSchema.safeParse({ ...validFood, categories: ['protein', 'protein'] });

    expect(result.success).toBe(false);
    expect(issuesByField(result).categories).toBe('Hay categorías repetidas');
  });
});

describe('food.schema — resto del alta y la edición', () => {
  it('normaliza los espacios del nombre', () => {
    const result = createFoodSchema.safeParse({ ...validFood, name: '  Pan   francés ' });

    expect(result.data.name).toBe('Pan francés');
  });

  it('rechaza un nombre vacío o solo con espacios', () => {
    const result = createFoodSchema.safeParse({ ...validFood, name: '   ' });

    expect(result.success).toBe(false);
    expect(issuesByField(result).name).toBe('El nombre del alimento es obligatorio');
  });

  it('exige el grupo', () => {
    const result = createFoodSchema.safeParse({ ...validFood, foodGroupId: undefined });

    expect(issuesByField(result).foodGroupId).toBe('Indicá el grupo de alimentos');
  });

  it('el alta no acepta active: el alimento nace vigente', () => {
    expect(createFoodSchema.safeParse({ ...validFood, active: false }).success).toBe(false);
  });

  it('rechaza createdById y editable en el body: el autor sale del token', () => {
    expect(createFoodSchema.safeParse({ ...validFood, createdById: GROUP_ID }).success).toBe(false);
    expect(updateFoodSchema.safeParse({ ...validFood, active: true, editable: true }).success).toBe(false);
  });

  it('la edición exige active, para que omitirlo no dé de baja ni reactive sin querer', () => {
    const result = updateFoodSchema.safeParse(validFood);

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty('active');
    expect(updateFoodSchema.safeParse({ ...validFood, active: false }).success).toBe(true);
  });
});

describe('food.schema — query del listado', () => {
  it('sin parámetros lista solo vigentes', () => {
    const result = listFoodsQuerySchema.safeParse({});

    expect(result.data).toEqual({ search: null, groupId: null, includeInactive: false });
  });

  it('convierte includeInactive a booleano', () => {
    expect(listFoodsQuerySchema.safeParse({ includeInactive: 'true' }).data.includeInactive).toBe(true);
    expect(listFoodsQuerySchema.safeParse({ includeInactive: 'si' }).success).toBe(false);
  });

  it('rechaza un groupId que no es UUID y un parámetro desconocido', () => {
    expect(listFoodsQuerySchema.safeParse({ groupId: 'carnes' }).success).toBe(false);
    expect(listFoodsQuerySchema.safeParse({ page: '2' }).success).toBe(false);
  });
});
