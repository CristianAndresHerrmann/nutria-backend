const { PLAN_USAGE_TEXT, withUsageText, clinicalRecommendationsText } = require('./planTexts');

describe('planTexts — textos del plan que no redacta la IA (DA-43)', () => {
  it('el texto de uso va primero, y las recomendaciones de la IA después', () => {
    expect(withUsageText('Tomá agua durante el día.')).toBe(`${PLAN_USAGE_TEXT}\n\nTomá agua durante el día.`);
  });

  it('sin recomendaciones de la IA queda solo el texto de uso', () => {
    expect(withUsageText('')).toBe(PLAN_USAGE_TEXT);
    expect(withUsageText('   ')).toBe(PLAN_USAGE_TEXT);
    expect(withUsageText(null)).toBe(PLAN_USAGE_TEXT);
  });

  it('el texto de uso aclara que las opciones son alternativas y explica el método del plato', () => {
    expect(PLAN_USAGE_TEXT).toContain('elegí una sola por comida');
    expect(PLAN_USAGE_TEXT).toContain('la mitad con verduras');
  });

  it('las recomendaciones clínicas se copian con su título, separadas por una línea en blanco', () => {
    const text = clinicalRecommendationsText([
      { title: 'Alimentación reducida en sodio', text: 'Cocinar sin sal.' },
      { title: 'Otra', text: 'Texto.' },
    ]);

    expect(text).toBe('Alimentación reducida en sodio\nCocinar sin sal.\n\nOtra\nTexto.');
  });

  it('sin recomendaciones clínicas queda null', () => {
    expect(clinicalRecommendationsText([])).toBeNull();
  });

  it('copia enteras las que entran en el tope y avisa cuántas quedaron afuera, sin pasarse', () => {
    const recommendations = [
      { title: 'Primera', text: 'a'.repeat(40) },
      { title: 'Segunda', text: 'b'.repeat(40) },
      { title: 'Tercera', text: 'c'.repeat(40) },
    ];
    const maxLength = 160;

    const text = clinicalRecommendationsText(recommendations, maxLength);

    expect(text.length).toBeLessThanOrEqual(maxLength);
    expect(text).toContain(`Primera\n${'a'.repeat(40)}`);
    expect(text).not.toContain('Segunda');
    expect(text).toMatch(/Hay 2 recomendaciones más de estas patologías en el catálogo que no entraron en el plan\.$/);
  });

  it('si entran todas, no agrega ningún aviso', () => {
    const text = clinicalRecommendationsText([{ title: 'Única', text: 'Texto.' }], 20);

    expect(text).toBe('Única\nTexto.');
  });
});
