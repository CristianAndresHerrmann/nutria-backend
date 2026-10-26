const { conditionScopes } = require('../../utils/recipeConditionFilter');
const { indexCatalog } = require('./catalogIndex');
const { directConditionFindings } = require('./directCondition');

const GROUPS = [
  { id: 'carnes', parentId: null },
  { id: 'pescados', parentId: 'carnes' },
  { id: 'lacteos', parentId: null },
  { id: 'frutas', parentId: null },
  { id: 'cereales', parentId: null },
];

const food = (id, name, foodGroupId, extra = {}) => ({
  id,
  name,
  foodGroupId,
  active: true,
  nutritionistId: null,
  categories: [],
  ...extra,
});

const FOODS = [
  food('leche', 'Leche', 'lacteos'),
  food('queso', 'Queso', 'lacteos'),
  food('atun', 'Atún', 'pescados'),
  food('banana', 'Banana', 'frutas'),
  food('pan', 'Pan', 'cereales'),
  food('avena', 'Avena', 'cereales'),
  food('kefir', 'Kéfir casero', 'lacteos', { nutritionistId: 'nutri-1' }),
];

const ingredient = (id) => {
  const { name, foodGroupId } = FOODS.find((row) => row.id === id);
  return { food: { id, name, foodGroupId } };
};

const RECIPES = [
  { id: 'avena-con-leche', name: 'Avena con leche', ingredients: [ingredient('avena'), ingredient('leche')] },
  { id: 'tostada-con-queso', name: 'Tostada con queso y leche', ingredients: [ingredient('pan'), ingredient('queso'), ingredient('leche')] },
  { id: 'avena-sola', name: 'Avena cocida', ingredients: [ingredient('avena')] },
];

const CATALOG = indexCatalog({ foods: FOODS, groups: GROUPS, recipes: RECIPES });

const foodItem = (foodId) => ({
  id: `item-${foodId}`,
  type: 'food',
  foodId,
  foodName: FOODS.find((row) => row.id === foodId).name,
  foodCategories: [],
});
const groupItem = (foodGroupId, foodGroupName) => ({ id: `item-${foodGroupId}`, type: 'food_group', foodGroupId, foodGroupName });
const recipeItem = (recipeId) => ({ id: `item-${recipeId}`, type: 'recipe', recipeId });

const onFood = (id, type, foodId, name) => ({ id, type, foodId, foodGroupId: null, food: { name }, foodGroup: null });
const onGroup = (id, type, foodGroupId, name) => ({ id, type, foodId: null, foodGroupId, food: null, foodGroup: { name } });

function findingsFor(item, conditions) {
  return directConditionFindings(item, conditionScopes(conditions, GROUPS), CATALOG);
}

describe('directConditionFindings (RF-37, RF-43)', () => {
  describe('dispara un bloqueo', () => {
    it('alimento directo de una alergia', () => {
      const findings = findingsFor(foodItem('leche'), [onFood('c-1', 'allergy', 'leche', 'Leche')]);

      expect(findings).toEqual([
        {
          type: 'direct_condition',
          severity: 'blocking',
          optionId: null,
          optionItemId: 'item-leche',
          patientConditionId: 'c-1',
          message: 'Leche: alergia del paciente (Leche)',
        },
      ]);
    });

    it('alimento del grupo de una intolerancia', () => {
      const findings = findingsFor(foodItem('queso'), [onGroup('c-1', 'intolerance', 'lacteos', 'Lácteos')]);

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toBe('Queso: intolerancia del paciente (Lácteos)');
    });

    it('alimento de un subgrupo del grupo de un rechazo', () => {
      const findings = findingsFor(foodItem('atun'), [onGroup('c-1', 'rejection', 'carnes', 'Carnes, pescados y huevos')]);

      expect(findings.map(({ patientConditionId }) => patientConditionId)).toEqual(['c-1']);
    });

    it('ingrediente de una receta, nombrado en el mensaje', () => {
      const findings = findingsFor(recipeItem('avena-con-leche'), [onFood('c-1', 'allergy', 'leche', 'Leche')]);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ optionItemId: 'item-avena-con-leche', patientConditionId: 'c-1' });
      expect(findings[0].message).toBe('Receta Avena con leche, ingrediente Leche: alergia del paciente (Leche)');
    });

    it('varios ingredientes alcanzados por la misma condición dan un solo hallazgo', () => {
      const findings = findingsFor(recipeItem('tostada-con-queso'), [onGroup('c-1', 'intolerance', 'lacteos', 'Lácteos')]);

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toBe('Receta Tostada con queso y leche, ingredientes Queso, Leche: intolerancia del paciente (Lácteos)');
    });

    it('alimento privado del nutricionista, por condición directa y por su grupo', () => {
      const findings = findingsFor(foodItem('kefir'), [
        onFood('c-1', 'allergy', 'kefir', 'Kéfir casero'),
        onGroup('c-2', 'intolerance', 'lacteos', 'Lácteos'),
      ]);

      expect(findings.map(({ patientConditionId }) => patientConditionId)).toEqual(['c-1', 'c-2']);
    });

    it('ítem de grupo comprendido en el grupo de la condición (un subgrupo)', () => {
      const findings = findingsFor(groupItem('pescados', 'Pescados'), [onGroup('c-1', 'rejection', 'carnes', 'Carnes, pescados y huevos')]);

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toBe('Grupo Pescados: rechazo del paciente (Carnes, pescados y huevos)');
    });

    it('un hallazgo por cada condición que alcanza al ítem, en el orden de las condiciones', () => {
      const findings = findingsFor(foodItem('leche'), [
        onGroup('c-2', 'intolerance', 'lacteos', 'Lácteos'),
        onFood('c-1', 'allergy', 'leche', 'Leche'),
      ]);

      expect(findings.map(({ patientConditionId }) => patientConditionId)).toEqual(['c-2', 'c-1']);
    });
  });

  describe('no dispara', () => {
    it('una preferencia, por alimento o por grupo', () => {
      const conditions = [onFood('c-1', 'preference', 'leche', 'Leche'), onGroup('c-2', 'preference', 'lacteos', 'Lácteos')];

      expect(findingsFor(foodItem('leche'), conditions)).toEqual([]);
      expect(findingsFor(recipeItem('avena-con-leche'), conditions)).toEqual([]);
      expect(findingsFor(groupItem('lacteos', 'Lácteos'), conditions)).toEqual([]);
    });

    it('una patología: sus restricciones son reglas clínicas (T35)', () => {
      const conditions = [{ id: 'c-1', type: 'pathology', pathologyId: 'celiaquia', foodId: null, foodGroupId: null }];

      expect(findingsFor(foodItem('pan'), conditions)).toEqual([]);
    });

    it('un alimento o una receta sin nada restringido', () => {
      const conditions = [onFood('c-1', 'allergy', 'leche', 'Leche')];

      expect(findingsFor(foodItem('pan'), conditions)).toEqual([]);
      expect(findingsFor(recipeItem('avena-sola'), conditions)).toEqual([]);
    });

    it('un ítem de grupo más amplio que la condición (DA-30)', () => {
      expect(findingsFor(groupItem('frutas', 'Frutas'), [onFood('c-1', 'allergy', 'banana', 'Banana')])).toEqual([]);
      expect(findingsFor(groupItem('carnes', 'Carnes'), [onGroup('c-1', 'rejection', 'pescados', 'Pescados')])).toEqual([]);
    });

    it('un ítem no reconocido: tiene su propio hallazgo', () => {
      const item = { id: 'item-x', type: 'unrecognized', originalText: 'leche de almendras' };

      expect(findingsFor(item, [onGroup('c-1', 'intolerance', 'lacteos', 'Lácteos')])).toEqual([]);
    });
  });

  it('un alimento que no está en el catálogo es un error, no un ítem que se saltea', () => {
    const item = { ...foodItem('leche'), foodId: 'privado-de-otro' };

    expect(() => findingsFor(item, [onFood('c-1', 'allergy', 'leche', 'Leche')])).toThrow(/no está en el catálogo/);
  });
});
