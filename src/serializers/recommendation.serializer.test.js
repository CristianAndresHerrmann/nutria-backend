const { serializeRecommendation } = require('./recommendation.serializer');

describe('recommendation.serializer', () => {
  const base = {
    id: 'r-1',
    pathologyId: 'celiaquia',
    pathology: { id: 'celiaquia', name: 'Celiaquía' },
    title: 'Ejemplo',
    text: 'Texto',
    active: true,
  };

  it('no expone el dueño y marca la propia', () => {
    expect(serializeRecommendation({ ...base, nutritionistId: 'nutri-1' })).toEqual({ ...base, own: true });
  });

  it('marca la común como no propia', () => {
    expect(serializeRecommendation({ ...base, nutritionistId: null })).toEqual({ ...base, own: false });
  });
});
