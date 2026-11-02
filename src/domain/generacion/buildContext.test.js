const { buildGenerationContext, CONTEXT_TEXT_MAX_LENGTH } = require('./buildContext');

// Datos ficticios. Cada campo identificatorio tiene un valor único y fácil de
// buscar en el contexto serializado.
const PATIENT = {
  id: 'f0a1b2c3-0000-4000-8000-00000000paci',
  nutritionistId: 'f0a1b2c3-0000-4000-8000-00000000nutr',
  firstName: 'NombreFicticioZeta',
  lastName: 'ApellidoFicticioOmega',
  birthDate: new Date('1990-04-17T00:00:00.000Z'),
  phone: '+54 342 555-9876',
  email: 'paciente.ficticio@example.com',
  livesWith: 'ConviveConHermanaFicticia',
  goal: 'ObjetivoFicticioPersonal',
  referenceWeight: '71.35',
  medicalHistory: 'AntecedenteFicticioReservado',
  medication: 'MedicacionFicticiaReservada',
  externalTreatment: 'TratamientoFicticioReservado',
  intakePatterns: 'PatronIngestaFicticio',
  guardianName: 'ResponsableFicticioNombre',
  guardianRelationship: 'VinculoFicticio',
  guardianContact: 'contacto.responsable@example.com',
  attendsAccompanied: true,
  physicalActivity: 'Camina 30 minutos',
  smoking: 'No fuma',
  alcohol: '   ',
  mealSchedule: 'Desayuno 7, almuerzo 13',
  sleepSchedule: null,
  cooks: true,
  likesCooking: false,
  cookingTime: '30 minutos por día',
  homeEquipment: 'Horno y microondas',
  usualShoppingPlace: 'Supermercado del barrio',
  mealsOutsideHome: 'Almuerza en el trabajo',
  outsideEquipment: 'Heladera',
  occupation: 'Empleo administrativo; consultar a NombreFicticioZeta al +54 342 555-9876',
  workContext: 'x'.repeat(CONTEXT_TEXT_MAX_LENGTH + 50),
  registrationComplete: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const CONDITIONS = [
  {
    id: 'cond-uuid-1',
    patientId: PATIENT.id,
    type: 'pathology',
    pathologyId: 'pat-uuid-1',
    pathology: { id: 'pat-uuid-1', name: 'Celiaquía' },
    food: null,
    foodGroup: null,
    observations: 'ObservacionFicticiaReservada',
  },
  {
    id: 'cond-uuid-2',
    patientId: PATIENT.id,
    type: 'rejection',
    foodGroupId: 'grp-uuid-pescados',
    pathology: null,
    food: null,
    foodGroup: { id: 'grp-uuid-pescados', name: 'Pescados' },
    observations: null,
  },
];

const CATALOG = {
  groups: [
    { id: 'grp-uuid-verduras', name: 'Verduras', parentId: null },
    { id: 'grp-uuid-carnes', name: 'Carnes', parentId: null },
  ],
  foods: [
    { id: 'food-uuid-zanahoria', name: 'Zanahoria', foodGroupId: 'grp-uuid-verduras', categories: [{ category: 'vegetable' }, { category: 'fiber' }] },
    { id: 'food-uuid-pollo', name: 'Pollo', foodGroupId: 'grp-uuid-carnes', categories: [{ category: 'protein' }] },
  ],
  recipes: [
    { id: 'rec-uuid-tarta', name: 'Tarta de verduras', mealTypes: ['lunch', 'dinner'], cookingMethod: 'oven', timeMinutes: 40 },
    { id: 'rec-uuid-ensalada', name: 'Ensalada', mealTypes: ['lunch'], cookingMethod: null, timeMinutes: null },
  ],
};

const MEAL_TYPES = ['lunch', 'dinner'];

function build() {
  return buildGenerationContext({ patient: PATIENT, conditions: CONDITIONS, catalog: CATALOG, mealTypes: MEAL_TYPES });
}

describe('buildGenerationContext — contexto anonimizado (RNF-07)', () => {
  it('no contiene ningún dato identificatorio del paciente, observación ni id interno', () => {
    const serialized = JSON.stringify(build().context);

    const forbidden = [
      PATIENT.id,
      PATIENT.nutritionistId,
      PATIENT.firstName,
      PATIENT.lastName,
      '1990-04-17',
      PATIENT.phone,
      PATIENT.email,
      PATIENT.livesWith,
      PATIENT.goal,
      PATIENT.referenceWeight,
      PATIENT.medicalHistory,
      PATIENT.medication,
      PATIENT.externalTreatment,
      PATIENT.intakePatterns,
      PATIENT.guardianName,
      PATIENT.guardianRelationship,
      PATIENT.guardianContact,
      'ObservacionFicticiaReservada',
      ...CONDITIONS.map(({ id }) => id),
      'pat-uuid-1',
      ...CATALOG.groups.map(({ id }) => id),
      ...CATALOG.foods.map(({ id }) => id),
      ...CATALOG.recipes.map(({ id }) => id),
    ];
    for (const value of forbidden) {
      expect(serialized).not.toContain(value);
    }
  });

  it('solo tiene los campos que declara el contrato de nutria-ia', () => {
    const { context } = build();

    expect(Object.keys(context).sort()).toEqual(
      ['meal_types', 'conditions', 'cooking', 'outside_home', 'work', 'habits', 'catalog', 'candidate_recipes'].sort(),
    );
    expect(Object.keys(context.cooking).sort()).toEqual(
      ['cooks', 'likes_cooking', 'cooking_time', 'home_equipment', 'usual_shopping_place'].sort(),
    );
    expect(Object.keys(context.outside_home).sort()).toEqual(['meals_outside_home', 'outside_equipment']);
    expect(Object.keys(context.work).sort()).toEqual(['occupation', 'work_context']);
    expect(Object.keys(context.habits).sort()).toEqual(['meal_schedule', 'physical_activity', 'smoking']);
    expect(context.conditions.every((condition) => Object.keys(condition).sort().join() === 'name,type')).toBe(true);
    expect(Object.keys(context.catalog).sort()).toEqual(['food_groups', 'foods']);
  });

  it('reemplaza en los textos libres los datos identificatorios que escribió el profesional', () => {
    const patient = {
      ...PATIENT,
      firstName: 'Martín José',
      lastName: 'Núñez',
      guardianName: 'Inés Paredes',
      workContext: 'Trabaja con su hermana; si no viene, avisar a martin.nunez@example.com o al (0342) 155-123456',
      mealSchedule: 'Almuerza con su madre Ines Paredes, que le cocina',
      occupation: 'Empleado en la panadería de NUÑEZ',
    };

    const { context } = buildGenerationContext({ patient, conditions: [], catalog: CATALOG, mealTypes: MEAL_TYPES });

    expect(context.work.work_context).toBe('Trabaja con su hermana; si no viene, avisar a [dato omitido] o al [dato omitido]');
    expect(context.habits.meal_schedule).toBe('Almuerza con su madre [dato omitido] [dato omitido], que le cocina');
    expect(context.work.occupation).toBe('Empleado en la panadería de [dato omitido]');
    const serialized = JSON.stringify(context);
    for (const value of ['Martín', 'Martin', 'Núñez', 'NUÑEZ', 'Ines', 'Paredes', '155-123456', '@example.com']) {
      expect(serialized).not.toContain(value);
    }
  });

  it('no toca un texto sin datos identificatorios ni una palabra que solo contiene el nombre', () => {
    const patient = {
      ...PATIENT,
      firstName: 'Ana',
      lastName: 'Sol',
      workContext: 'Desayuna banana a las 7, almuerza 13 h; turno de 8 a 16',
      mealSchedule: 'Toma solcito por la mañana',
    };

    const { context } = buildGenerationContext({ patient, conditions: [], catalog: CATALOG, mealTypes: MEAL_TYPES });

    expect(context.work.work_context).toBe('Desayuna banana a las 7, almuerza 13 h; turno de 8 a 16');
    expect(context.habits.meal_schedule).toBe('Toma solcito por la mañana');
  });

  it('las condiciones viajan con tipo y nombre de lo que referencian, sin observaciones', () => {
    expect(build().context.conditions).toEqual([
      { type: 'pathology', name: 'Celiaquía' },
      { type: 'rejection', name: 'Pescados' },
    ]);
  });

  it('omite los textos vacíos o ausentes y trunca los que superan el tope del contrato', () => {
    const { context } = build();

    expect(context.habits).not.toHaveProperty('alcohol');
    expect(context.habits).not.toHaveProperty('sleep_schedule');
    expect(context.work.work_context).toHaveLength(CONTEXT_TEXT_MAX_LENGTH);
    expect(context.cooking).toEqual({
      cooks: true,
      likes_cooking: false,
      cooking_time: '30 minutos por día',
      home_equipment: 'Horno y microondas',
      usual_shopping_place: 'Supermercado del barrio',
    });
  });

  it('identifica el catálogo con códigos cortos por orden de nombre', () => {
    const { context } = build();

    expect(context.catalog.food_groups).toEqual([
      { code: 'G1', name: 'Carnes' },
      { code: 'G2', name: 'Verduras' },
    ]);
    expect(context.catalog.foods).toEqual([
      { code: 'A1', name: 'Pollo', group_code: 'G1', categories: ['protein'] },
      { code: 'A2', name: 'Zanahoria', group_code: 'G2', categories: ['vegetable', 'fiber'] },
    ]);
    expect(context.candidate_recipes).toEqual([
      { code: 'R1', name: 'Ensalada', meal_types: ['lunch'] },
      { code: 'R2', name: 'Tarta de verduras', meal_types: ['lunch', 'dinner'], cooking_method: 'oven', time_minutes: 40 },
    ]);
    expect(context.meal_types).toEqual(MEAL_TYPES);
  });

  it('devuelve la traducción de cada código a su entidad, que no viaja', () => {
    const { codes } = build();

    expect(codes.foods.get('A1').id).toBe('food-uuid-pollo');
    expect(codes.groups.get('G2').id).toBe('grp-uuid-verduras');
    expect(codes.recipes.get('R2').id).toBe('rec-uuid-tarta');
  });
});
