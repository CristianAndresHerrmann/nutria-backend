const { indexCatalog } = require('./catalogIndex');
const { pathologyRuleFindings, pathologyRuleScopes } = require('./pathologyRule');

const GROUPS = [
  { id: 'cereales', parentId: null },
  { id: 'panificados', parentId: 'cereales' },
  { id: 'carnes', parentId: null },
  { id: 'fiambres', parentId: 'carnes' },
  { id: 'azucares', parentId: null },
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
  food('pan', 'Pan francés', 'panificados'),
  food('pan-sin-tacc', 'Pan sin TACC', 'panificados'),
  food('jamon', 'Jamón cocido', 'fiambres'),
  food('salame', 'Salame casero', 'fiambres', { nutritionistId: 'nutri-1' }),
  food('pollo', 'Pollo', 'carnes'),
  food('azucar', 'Azúcar', 'azucares'),
];

const ingredient = (id) => {
  const { name, foodGroupId } = FOODS.find((row) => row.id === id);
  return { food: { id, name, foodGroupId } };
};

const RECIPES = [
  { id: 'sandwich', name: 'Sándwich de jamón', ingredients: [ingredient('pan'), ingredient('jamon')] },
  { id: 'pollo-solo', name: 'Pollo al horno', ingredients: [ingredient('pollo')] },
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
const unrecognizedItem = { id: 'item-x', type: 'unrecognized', originalText: 'pan casero' };

const pathology = (id, pathologyId, name) => ({ id, type: 'pathology', pathologyId, foodId: null, foodGroupId: null, pathology: { name } });
const CELIAC = pathology('c-1', 'celiaquia', 'Celiaquía');
const HYPERTENSION = pathology('c-2', 'hta', 'Hipertensión');

const onFood = (id, pathologyId, foodId, severity) => ({ id, pathologyId, foodId, foodGroupId: null, severity, source: `Fuente ${id}, p. 1` });
const onGroup = (id, pathologyId, foodGroupId, severity) => ({ id, pathologyId, foodId: null, foodGroupId, severity, source: `Fuente ${id}, p. 1` });

const BREAD_EXCLUDED = onFood('r-pan', 'celiaquia', 'pan', 'prohibited');
const COLD_CUTS_MODERATED = onGroup('r-fiambres', 'hta', 'fiambres', 'moderate');

function findingsFor(item, rules, conditions = [CELIAC, HYPERTENSION]) {
  return pathologyRuleFindings(item, pathologyRuleScopes(rules, conditions, GROUPS), CATALOG);
}

describe('pathologyRuleFindings (RF-43, RF-47; R-05)', () => {
  describe('dispara', () => {
    it('una regla prohibitiva sobre el alimento bloquea, con la regla y su fuente', () => {
      expect(findingsFor(foodItem('pan'), [BREAD_EXCLUDED])).toEqual([
        {
          type: 'pathology_rule',
          severity: 'blocking',
          optionId: null,
          optionItemId: 'item-pan',
          patientConditionId: null,
          clinicalRuleId: 'r-pan',
          message: 'Pan francés: excluido por Celiaquía (Fuente r-pan, p. 1)',
        },
      ]);
    });

    it('una regla a moderar advierte, sin bloquear', () => {
      const findings = findingsFor(foodItem('azucar'), [onFood('r-azucar', 'hta', 'azucar', 'moderate')]);

      expect(findings).toEqual([
        expect.objectContaining({ severity: 'warning', clinicalRuleId: 'r-azucar', message: 'Azúcar: a moderar por Hipertensión (Fuente r-azucar, p. 1)' }),
      ]);
    });

    it('un alimento del grupo de la regla', () => {
      expect(findingsFor(foodItem('jamon'), [COLD_CUTS_MODERATED])).toEqual([expect.objectContaining({ clinicalRuleId: 'r-fiambres', optionItemId: 'item-jamon' })]);
    });

    it('un alimento de un subgrupo del grupo de la regla', () => {
      const findings = findingsFor(foodItem('jamon'), [onGroup('r-carnes', 'hta', 'carnes', 'moderate')]);

      expect(findings).toEqual([expect.objectContaining({ clinicalRuleId: 'r-carnes' })]);
    });

    it('un alimento privado del nutricionista en el grupo de la regla', () => {
      expect(findingsFor(foodItem('salame'), [COLD_CUTS_MODERATED])).toEqual([
        expect.objectContaining({ message: 'Salame casero: a moderar por Hipertensión (Fuente r-fiambres, p. 1)' }),
      ]);
    });

    it('el ingrediente de una receta, nombrado en el mensaje', () => {
      expect(findingsFor(recipeItem('sandwich'), [BREAD_EXCLUDED])).toEqual([
        expect.objectContaining({ message: 'Receta Sándwich de jamón, ingrediente Pan francés: excluido por Celiaquía (Fuente r-pan, p. 1)' }),
      ]);
    });

    it('un ítem de grupo comprendido en el grupo de la regla', () => {
      expect(findingsFor(groupItem('fiambres', 'Fiambres y embutidos'), [COLD_CUTS_MODERATED])).toEqual([
        expect.objectContaining({ optionItemId: 'item-fiambres', message: 'Grupo Fiambres y embutidos: a moderar por Hipertensión (Fuente r-fiambres, p. 1)' }),
      ]);
    });

    it('un hallazgo por cada regla que alcanza al ítem, de cada patología', () => {
      const findings = findingsFor(recipeItem('sandwich'), [BREAD_EXCLUDED, COLD_CUTS_MODERATED]);

      expect(findings.map(({ clinicalRuleId, severity }) => [clinicalRuleId, severity])).toEqual([
        ['r-pan', 'blocking'],
        ['r-fiambres', 'warning'],
      ]);
    });
  });

  describe('no dispara', () => {
    it('una regla de una patología que el paciente no tiene', () => {
      expect(findingsFor(foodItem('pan'), [BREAD_EXCLUDED], [HYPERTENSION])).toEqual([]);
    });

    it('sin patologías, aunque el paciente tenga otras condiciones', () => {
      const allergy = { id: 'c-3', type: 'allergy', pathologyId: null, foodId: 'pan', foodGroupId: null, food: { name: 'Pan francés' } };

      expect(findingsFor(foodItem('pan'), [BREAD_EXCLUDED], [allergy])).toEqual([]);
    });

    it('un alimento sin regla, aunque sea del mismo grupo (Pan sin TACC)', () => {
      expect(findingsFor(foodItem('pan-sin-tacc'), [BREAD_EXCLUDED])).toEqual([]);
    });

    it('un ítem de grupo más amplio que la regla (DA-30)', () => {
      expect(findingsFor(groupItem('panificados', 'Panificados y harinas'), [BREAD_EXCLUDED])).toEqual([]);
      expect(findingsFor(groupItem('carnes', 'Carnes'), [COLD_CUTS_MODERATED])).toEqual([]);
    });

    it('una receta sin ingredientes alcanzados', () => {
      expect(findingsFor(recipeItem('pollo-solo'), [BREAD_EXCLUDED, COLD_CUTS_MODERATED])).toEqual([]);
    });

    it('un ítem no reconocido (tiene R-02)', () => {
      expect(findingsFor(unrecognizedItem, [BREAD_EXCLUDED])).toEqual([]);
    });
  });
});
