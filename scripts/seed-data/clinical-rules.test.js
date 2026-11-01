const { RuleSeverity } = require('@prisma/client');
const { FOOD_GROUPS, FOODS, PATHOLOGIES } = require('./catalogs');
const { CLINICAL_RULES } = require('./clinical-rules');

// La base solo controla el destino (clinical_rule_target_chk) y la fuente no vacía
// (clinical_rule_source_chk). Acá se controla el resto antes de correr el seed:
// un nombre que no existe corta el seed, y un par repetido se fusiona sin aviso.
const foodNames = new Set(FOODS.map(({ name }) => name));
const groupNames = new Set(FOOD_GROUPS.map(({ name }) => name));
const pathologyNames = new Set(PATHOLOGIES.map(({ name }) => name));

const target = ({ food, foodGroup }) => (food ? `alimento ${food}` : `grupo ${foodGroup}`);

describe('datos del seed — reglas clínicas por patología (T35)', () => {
  it('cada regla apunta a un alimento o a un grupo, no a los dos', () => {
    expect(CLINICAL_RULES.filter(({ food, foodGroup }) => Boolean(food) === Boolean(foodGroup))).toEqual([]);
  });

  it('cada regla tiene fuente con página (RF-47)', () => {
    expect(CLINICAL_RULES.filter(({ source }) => !/\bpp?\. \d+/.test(source ?? ''))).toEqual([]);
  });

  it('la severidad es una del enum', () => {
    expect(CLINICAL_RULES.filter(({ severity }) => !Object.values(RuleSeverity).includes(severity))).toEqual([]);
  });

  it('la patología, el alimento o el grupo existen en el catálogo del seed', () => {
    const missing = CLINICAL_RULES.filter(
      ({ pathology, food, foodGroup }) =>
        !pathologyNames.has(pathology) || (food ? !foodNames.has(food) : !groupNames.has(foodGroup)),
    );
    expect(missing).toEqual([]);
  });

  it('no repite el par patología y alimento o grupo', () => {
    const keys = CLINICAL_RULES.map((rule) => `${rule.pathology} → ${target(rule)}`);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('celiaquía no alcanza a las variantes sin TACC que el catálogo ofrece como alternativa', () => {
    const celiac = CLINICAL_RULES.filter(({ pathology, severity }) => pathology === 'Celiaquía' && severity === 'prohibited');
    expect(celiac.map(({ food }) => food).filter((food) => /sin TACC/.test(food))).toEqual([]);
  });
});
