const { optionItemSchema } = require('./plan.schema');

const FOOD_ID = '11111111-1111-1111-1111-111111111111';
const FOOD_GROUP_ID = '22222222-2222-2222-2222-222222222222';
const RECIPE_ID = '33333333-3333-3333-3333-333333333333';

function issuesByField(result) {
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

// La misma regla que option_item_type_chk: cada tipo referencia exactamente lo
// suyo. El CHECK de la base se verifica aparte, contra Postgres.
describe('plan.schema — optionItemSchema', () => {
  it.each([
    ['un alimento', { type: 'food', foodId: FOOD_ID }],
    ['un grupo de alimentos', { type: 'food_group', foodGroupId: FOOD_GROUP_ID }],
    ['una receta', { type: 'recipe', recipeId: RECIPE_ID }],
    ['un ítem no reconocido', { type: 'unrecognized', originalText: 'Tostadas de pan de algarroba' }],
  ])('acepta %s', (_, item) => {
    const result = optionItemSchema.safeParse(item);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(item);
  });

  it('recorta el texto de un ítem no reconocido', () => {
    const result = optionItemSchema.safeParse({ type: 'unrecognized', originalText: '  Mate cocido  ' });

    expect(result.data.originalText).toBe('Mate cocido');
  });

  it.each([
    ['un alimento con recipeId', { type: 'food', foodId: FOOD_ID, recipeId: RECIPE_ID }, 'recipeId'],
    ['un alimento con originalText', { type: 'food', foodId: FOOD_ID, originalText: 'Manzana' }, 'originalText'],
    ['un alimento con foodGroupId', { type: 'food', foodId: FOOD_ID, foodGroupId: FOOD_GROUP_ID }, 'foodGroupId'],
    ['un grupo con foodId', { type: 'food_group', foodGroupId: FOOD_GROUP_ID, foodId: FOOD_ID }, 'foodId'],
    ['una receta con foodId', { type: 'recipe', recipeId: RECIPE_ID, foodId: FOOD_ID }, 'foodId'],
    ['un no reconocido con foodId', { type: 'unrecognized', originalText: 'Manzana', foodId: FOOD_ID }, 'foodId'],
  ])('rechaza %s', (_, item, field) => {
    const result = optionItemSchema.safeParse(item);

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain(`"${field}"`);
  });

  it.each([
    ['un alimento sin foodId', { type: 'food' }, 'foodId'],
    ['un grupo sin foodGroupId', { type: 'food_group' }, 'foodGroupId'],
    ['una receta sin recipeId', { type: 'recipe' }, 'recipeId'],
    ['un no reconocido sin texto', { type: 'unrecognized' }, 'originalText'],
    ['un no reconocido con texto vacío', { type: 'unrecognized', originalText: '' }, 'originalText'],
    ['un no reconocido solo con espacios', { type: 'unrecognized', originalText: '   ' }, 'originalText'],
    ['un no reconocido demasiado largo', { type: 'unrecognized', originalText: 'a'.repeat(301) }, 'originalText'],
    ['un foodId que no es guid', { type: 'food', foodId: 'manzana' }, 'foodId'],
  ])('rechaza %s, señalando el campo', (_, item, field) => {
    const result = optionItemSchema.safeParse(item);

    expect(result.success).toBe(false);
    expect(issuesByField(result)).toHaveProperty(field);
  });

  // La copia del catálogo (DA-16) la arma el backend: si la mandara el cliente,
  // un plan podría guardar un nombre o categorías que el alimento no tiene.
  it.each([
    ['foodName', { type: 'food', foodId: FOOD_ID, foodName: 'Manzana' }],
    ['foodCategories', { type: 'food', foodId: FOOD_ID, foodCategories: ['fiber'] }],
    ['foodGroupName', { type: 'food_group', foodGroupId: FOOD_GROUP_ID, foodGroupName: 'Frutas' }],
  ])('rechaza la copia del catálogo enviada por el cliente (%s)', (field, item) => {
    const result = optionItemSchema.safeParse(item);

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe(`Campo no admitido: "${field}"`);
  });

  it.each([
    ['un tipo desconocido', { type: 'drink', foodId: FOOD_ID }],
    ['un ítem sin tipo', { foodId: FOOD_ID }],
  ])('rechaza %s', (_, item) => {
    const result = optionItemSchema.safeParse(item);

    expect(result.success).toBe(false);
    expect(result.error.issues[0]).toMatchObject({ path: ['type'], message: 'El tipo de ítem no es válido' });
  });
});
