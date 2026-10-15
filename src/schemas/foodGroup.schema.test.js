const { createFoodGroupSchema } = require('./foodGroup.schema');
const { createPathologySchema } = require('./pathology.schema');

const PARENT_ID = '33333333-3333-3333-3333-333333333333';

describe('foodGroup.schema', () => {
  it('acepta un grupo raíz solo con nombre', () => {
    const result = createFoodGroupSchema.safeParse({ name: 'Aves' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'Aves', description: null, parentId: null });
  });

  it('acepta un subgrupo con su padre', () => {
    const result = createFoodGroupSchema.safeParse({ name: 'Aves', parentId: PARENT_ID });

    expect(result.data.parentId).toBe(PARENT_ID);
  });

  it('rechaza un parentId que no es UUID', () => {
    const result = createFoodGroupSchema.safeParse({ name: 'Aves', parentId: 'carnes' });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['parentId']);
  });

  it('rechaza createdById en el body', () => {
    expect(createFoodGroupSchema.safeParse({ name: 'Aves', createdById: PARENT_ID }).success).toBe(false);
  });
});

describe('pathology.schema', () => {
  it('acepta nombre y descripción opcional', () => {
    const result = createPathologySchema.safeParse({ name: ' Hipotiroidismo ', description: '' });

    expect(result.data).toEqual({ name: 'Hipotiroidismo', description: null });
  });

  it('rechaza un nombre vacío', () => {
    const result = createPathologySchema.safeParse({ name: '' });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('El nombre de la patología es obligatorio');
  });
});
