const { resolveProposal, proposalMatchesMealTypes } = require('./resolveProposal');

const CODES = {
  foods: new Map([['A1', { id: 'pollo', name: 'Pollo', foodGroupId: 'carnes', categories: [{ category: 'protein' }] }]]),
  groups: new Map([['G1', { id: 'frutas', name: 'Frutas', parentId: null }]]),
  recipes: new Map([['R1', { id: 'tarta', name: 'Tarta de verduras' }]]),
};

const PROPOSAL = {
  situational_diagnosis: 'Diagnóstico',
  introduction: 'Introducción',
  objectives: 'Objetivos',
  general_recommendations: 'Generales',
  contextual_recommendations: 'Contextuales',
  thematic_recommendations: 'Temáticas',
  meals: [
    {
      meal_type: 'lunch',
      instructions: 'Comer sentado',
      options: [
        {
          description: null,
          items: [
            { type: 'food', code: 'A1' },
            { type: 'food_group', code: 'G1' },
            { type: 'recipe', code: 'R1' },
            { type: 'free_text', text: 'Mate cocido' },
            { type: 'food', code: 'A99' },
          ],
        },
      ],
    },
  ],
};

describe('resolveProposal — de códigos a ítems del plan', () => {
  it('copia los textos y deja las recomendaciones clínicas vacías (DA-28)', () => {
    const { fields } = resolveProposal(PROPOSAL, CODES);

    expect(fields).toEqual({
      situationalDiagnosis: 'Diagnóstico',
      introduction: 'Introducción',
      objectives: 'Objetivos',
      generalRecommendations: 'Generales',
      contextualRecommendations: 'Contextuales',
      clinicalRecommendations: null,
      thematicRecommendations: 'Temáticas',
    });
  });

  it('resuelve cada ítem a su tipo, con la copia del catálogo (DA-16)', () => {
    const { meals } = resolveProposal(PROPOSAL, CODES);
    const items = meals[0].options[0].items.map(({ id: _id, ...item }) => item);

    expect(items).toEqual([
      { order: 1, type: 'food', foodId: 'pollo', foodName: 'Pollo', foodCategories: ['protein'] },
      { order: 2, type: 'food_group', foodGroupId: 'frutas', foodGroupName: 'Frutas' },
      { order: 3, type: 'recipe', recipeId: 'tarta' },
      { order: 4, type: 'unrecognized', originalText: 'Mate cocido' },
      { order: 5, type: 'unrecognized', originalText: 'Código desconocido: A99' },
    ]);
  });

  it('arma comidas y opciones con ids propios y el orden por posición', () => {
    const { meals } = resolveProposal(PROPOSAL, CODES);

    expect(meals[0]).toMatchObject({ mealType: 'lunch', instructions: 'Comer sentado' });
    expect(meals[0].options[0]).toMatchObject({ order: 1, description: null });
    const allIds = [meals[0].id, meals[0].options[0].id, ...meals[0].options[0].items.map(({ id }) => id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('proposalMatchesMealTypes', () => {
  const meals = (...types) => ({ meals: types.map((type) => ({ meal_type: type })) });

  it('acepta exactamente las comidas pedidas, en cualquier orden', () => {
    expect(proposalMatchesMealTypes(meals('dinner', 'lunch'), ['lunch', 'dinner'])).toBe(true);
  });

  it.each([
    ['falta una', meals('lunch'), ['lunch', 'dinner']],
    ['sobra una', meals('lunch', 'breakfast'), ['lunch']],
    ['repite una', meals('lunch', 'lunch'), ['lunch', 'dinner']],
  ])('rechaza la propuesta si %s', (_, proposal, requested) => {
    expect(proposalMatchesMealTypes(proposal, requested)).toBe(false);
  });
});
