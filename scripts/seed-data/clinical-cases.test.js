const { ConditionType } = require('@prisma/client');
const { FOOD_GROUPS, FOODS, PATHOLOGIES } = require('./catalogs');
const { CLINICAL_CASES } = require('./clinical-cases');

const pathologyNames = new Set(PATHOLOGIES.map(({ name }) => name));
const foodNames = new Set(FOODS.map(({ name }) => name));
const groupNames = new Set(FOOD_GROUPS.map(({ name }) => name));

const conditionsOf = (code) => CLINICAL_CASES.find((clinicalCase) => clinicalCase.code === code).patient.conditions;

describe('datos del seed — casos clínicos del Plan 5.6 (T41)', () => {
  it('no repite códigos ni nombres de paciente (el script de medición busca por nombre)', () => {
    const codes = CLINICAL_CASES.map(({ code }) => code);
    const names = CLINICAL_CASES.map(({ patient }) => `${patient.data.firstName} ${patient.data.lastName}`);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('referencia solo patologías, alimentos y grupos del catálogo común, por su nombre exacto', () => {
    for (const { code, patient } of CLINICAL_CASES) {
      for (const { type, pathology, food, foodGroup } of patient.conditions) {
        expect(Object.values(ConditionType), code).toContain(type);
        if (pathology) expect(pathologyNames.has(pathology), `${code}: ${pathology}`).toBe(true);
        if (food) expect(foodNames.has(food), `${code}: ${food}`).toBe(true);
        if (foodGroup) expect(groupNames.has(foodGroup), `${code}: ${foodGroup}`).toBe(true);
      }
    }
  });

  it('cubre los casos del Plan 5.6, más uno sin condiciones y uno con rechazo de un grupo', () => {
    const pathologies = CLINICAL_CASES.flatMap(({ patient }) => patient.conditions.map(({ pathology }) => pathology));
    expect(pathologies).toEqual(expect.arrayContaining(['Celiaquía', 'Diabetes', 'Hipertensión']));
    expect(conditionsOf('C4')).toEqual([expect.objectContaining({ type: 'allergy' })]);
    expect(conditionsOf('C5')).toEqual([expect.objectContaining({ type: 'intolerance' })]);
    expect(conditionsOf('C6')).toEqual([]);
    expect(conditionsOf('C7')).toEqual([expect.objectContaining({ type: 'rejection', foodGroup: 'Legumbres' })]);
  });

  it('incluye un caso con el objetivo "Bajar de peso", sin condiciones, para medir las pautas OBE (T57)', () => {
    const c8 = CLINICAL_CASES.find(({ code }) => code === 'C8');
    expect(c8.patient.data.goal).toBe('Bajar de peso');
    expect(c8.patient.data.goalCategory).toBe('lose_weight');
    const others = CLINICAL_CASES.filter(({ code }) => code !== 'C8').map(({ patient }) => patient.data.goalCategory);
    expect(new Set(others)).toEqual(new Set(['other']));
    expect(c8.patient.conditions).toEqual([]);
  });

  it('tiene la ficha completa, con el contexto que viaja a la IA', () => {
    for (const { code, patient } of CLINICAL_CASES) {
      expect(patient.data.registrationComplete, code).toBe(true);
      expect(typeof patient.data.cooks, code).toBe('boolean');
      expect(patient.data.occupation, code).toBeTruthy();
      expect(patient.data.mealSchedule, code).toBeTruthy();
    }
  });

  it('tiene el equipamiento y los minutos por día estructurados, coherentes con el texto de la ficha (T62)', () => {
    for (const { code, patient } of CLINICAL_CASES) {
      const { homeEquipment, hasOven, hasStovetop, hasMicrowave, cookingMinutesPerDay } = patient.data;
      expect(hasOven, code).toBe(/horno/i.test(homeEquipment));
      expect(hasStovetop, code).toBe(/anafe/i.test(homeEquipment));
      expect(hasMicrowave, code).toBe(/microondas/i.test(homeEquipment));
      if (patient.data.cooks) expect(cookingMinutesPerDay, code).toBeGreaterThan(0);
      else expect(cookingMinutesPerDay, code).toBeUndefined();
    }
    const c1 = CLINICAL_CASES.find(({ code }) => code === 'C1').patient.data;
    expect(c1).toMatchObject({ hasOven: false, cookingMinutesPerDay: 20 });
  });
});
