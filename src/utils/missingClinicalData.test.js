const { RESTRICTION_CONDITION_TYPES, isMissingClinicalData } = require('./missingClinicalData');

describe('isMissingClinicalData', () => {
  it.each([
    ['sin medicación ni condiciones', { medication: null, restrictionConditionCount: 0 }, true],
    ['con medicación solo de espacios', { medication: '   ', restrictionConditionCount: 0 }, true],
    ['con medicación', { medication: 'Levotiroxina 50 mcg', restrictionConditionCount: 0 }, false],
    ['con una condición restrictiva', { medication: null, restrictionConditionCount: 1 }, false],
    ['con medicación y condiciones', { medication: 'Metformina', restrictionConditionCount: 2 }, false],
  ])('%s → %s', (_label, input, expected) => {
    expect(isMissingClinicalData(input)).toBe(expected);
  });

  it('solo cuentan patologías, alergias e intolerancias (no rechazos ni preferencias)', () => {
    expect(RESTRICTION_CONDITION_TYPES).toEqual(['pathology', 'allergy', 'intolerance']);
  });
});
