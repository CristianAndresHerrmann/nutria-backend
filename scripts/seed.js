const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { FOOD_GROUPS, FOODS, PATHOLOGIES, RECOMMENDATIONS, RECOMMENDATION_TEXT } = require('./seed-data/catalogs');

const prisma = new PrismaClient();

// En local vale la contraseña de desarrollo. Con NODE_ENV=production (staging) es
// obligatorio pasarla en SEED_PASSWORD: este archivo está en un repo público y el
// backend desplegado es accesible desde internet.
const DEV_SEED_PASSWORD = '123456aA!';
const SEED_PASSWORD =
  process.env.SEED_PASSWORD || (process.env.NODE_ENV === 'production' ? null : DEV_SEED_PASSWORD);

// Todo es ficticio (RNF-08). Dos nutricionistas con pacientes propios: permite
// verificar a mano que cada uno ve y edita solo los suyos (aislamiento por
// nutricionista, RNF-05).
//
// Por paciente:
// - `conditions` referencian catálogos por nombre (pathology, food o foodGroup).
// - Cada consulta trae sus mediciones (con la fecha de la consulta) y los hábitos
//   que se pautan al cerrarla. Un hábito con `evaluation` se evalúa en la consulta
//   siguiente; sin `evaluation` queda pending.
// - `looseMeasurements` son mediciones cargadas fuera de una consulta.
//
// Por nutricionista, `privateFoods` son alimentos privados (T15): solo los ve ese
// nutricionista. Sirven para verificar a mano que el otro no los ve. Lo mismo
// `privateRecommendations` (T22), con una dada de baja para probar el filtro.
const SEED_DATA = [
  {
    nutritionist: { name: 'Camila Ríos', email: 'nutricionista@nutria.com' },
    privateFoods: [{ name: 'Kéfir', group: 'Leches y yogures', categories: ['protein'] }],
    privateRecommendations: [
      { pathology: 'Celiaquía', title: 'Ejemplo ficticio: recomendación propia de Camila', text: RECOMMENDATION_TEXT },
      {
        pathology: 'Diabetes',
        title: 'Ejemplo ficticio: recomendación propia dada de baja',
        text: RECOMMENDATION_TEXT,
        active: false,
      },
    ],
    recipes: [
      {
        name: 'Ensalada de arroz y atún',
        preparation: '1. Hervir el arroz y dejarlo enfriar.\n2. Cortar el tomate y la lechuga.\n3. Mezclar todo con el atún y condimentar con aceite.',
        finalNote: 'Se conserva en heladera hasta el día siguiente.',
        cookingMethod: 'stovetop',
        timeMinutes: 25,
        purchasePlace: 'Supermercado',
        ingredients: [
          { food: 'Arroz blanco', quantityDescription: '1 taza cocida' },
          { food: 'Atún al natural', quantityDescription: '1 lata' },
          { food: 'Tomate', quantityDescription: '1 unidad' },
          { food: 'Lechuga', quantityDescription: 'A gusto' },
          { food: 'Aceite de oliva', quantityDescription: '1 cucharada' },
        ],
        mealTypes: ['lunch', 'dinner'],
      },
    ],
    patients: [
      {
        // Ficha completa: todos los campos del paciente cargados y una condición
        // de cada tipo.
        data: {
          firstName: 'Lucía',
          lastName: 'Fernández',
          birthDate: new Date('1992-03-14'),
          phone: '+54 342 555-0101',
          email: 'lucia.fernandez@example.com',
          livesWith: 'Pareja',
          goal: 'Bajar de peso',
          referenceWeight: 68.5,
          medicalHistory: 'Celiaquía diagnosticada en 2019.\nMadre con hipotiroidismo; padre con hipertensión.',
          medication: 'Suplemento de hierro, un comprimido diario',
          externalTreatment: 'Terapia psicológica quincenal',
          physicalActivity: 'Camina 30 minutos, dos veces por semana',
          smoking: 'No fuma',
          alcohol: 'Ocasional, fines de semana',
          mealSchedule: 'Desayuno 7 h, almuerzo 13 h, cena 21 h',
          sleepSchedule: 'De 23 h a 6:30 h',
          cooks: true,
          likesCooking: true,
          cookingTime: '30 minutos por día',
          homeEquipment: 'Horno, anafe y microondas',
          usualShoppingPlace: 'Supermercado y verdulería del barrio',
          mealsOutsideHome: 'Almuerzo de lunes a viernes',
          outsideEquipment: 'Heladera y microondas en la oficina',
          occupation: 'Administrativa',
          workContext: 'Oficina, de 8 a 16 h, horario regular',
          intakePatterns: 'Picoteo por la tarde',
          attendsAccompanied: false,
          registrationComplete: true,
          dataCompletedAt: new Date(),
        },
        conditions: [
          { type: 'pathology', pathology: 'Celiaquía' },
          { type: 'intolerance', food: 'Leche' },
          { type: 'allergy', food: 'Nueces' },
          { type: 'rejection', food: 'Zapallo' },
          { type: 'preference', foodGroup: 'Frutas', observations: 'Prefiere fruta en el desayuno' },
        ],
        consultations: [
          {
            date: '2026-08-04',
            type: 'first',
            motivation: 'Sentirse con más energía',
            decisionOrigin: 'Propia',
            perceivedObstacle: 'Falta de tiempo para cocinar en la semana',
            mainHabit: 'Picoteo por la tarde',
            measurements: [
              { type: 'weight', value: 70.2, unit: 'kg' },
              { type: 'height', value: 165, unit: 'cm' },
              { type: 'circumference', detail: 'Cintura', value: 84, unit: 'cm' },
            ],
            habits: [
              { description: 'Caminar 30 minutos tres veces por semana', evaluation: { compliance: 'met' } },
              {
                description: 'Incorporar una fruta en la merienda',
                evaluation: { compliance: 'partial', observations: 'Lo cumple solo los fines de semana' },
              },
            ],
          },
          {
            date: '2026-09-01',
            type: 'follow_up',
            observations: 'Buena adherencia a la caminata.',
            measurements: [{ type: 'weight', value: 69.1, unit: 'kg' }],
            habits: [{ description: 'Llevar vianda preparada en casa', evaluation: { compliance: 'not_met' } }],
          },
          {
            date: '2026-10-06',
            type: 'follow_up',
            measurements: [{ type: 'weight', value: 68.3, unit: 'kg' }],
            habits: [{ description: 'Tomar agua durante la jornada laboral' }],
          },
        ],
      },
      {
        data: {
          firstName: 'Tomás',
          lastName: 'Gómez',
          birthDate: new Date('2012-05-10'), // menor de edad
          livesWith: 'Padres',
          goal: 'Mejorar hábitos alimentarios',
          referenceWeight: 45.0,
          physicalActivity: 'Fútbol dos veces por semana',
          cooks: false,
          likesCooking: false,
          mealsOutsideHome: 'Merienda en la escuela',
          occupation: 'Estudiante',
          guardianName: 'María Gómez',
          guardianRelationship: 'Madre',
          guardianContact: '+54 342 555-0202',
          attendsAccompanied: true,
          registrationComplete: true,
          dataCompletedAt: new Date(),
        },
        conditions: [
          { type: 'rejection', foodGroup: 'Pescados' },
          { type: 'preference', food: 'Banana', observations: 'La elige para la merienda' },
        ],
        consultations: [
          {
            date: '2026-09-10',
            type: 'first',
            motivation: 'Lo trae la familia',
            decisionOrigin: 'Familiar',
            measurements: [
              { type: 'weight', value: 45.0, unit: 'kg' },
              { type: 'height', value: 152, unit: 'cm' },
            ],
            habits: [{ description: 'Desayunar antes de ir a la escuela', evaluation: { compliance: 'met' } }],
          },
          {
            date: '2026-10-08',
            type: 'follow_up',
            measurements: [{ type: 'weight', value: 45.4, unit: 'kg' }],
            habits: [],
          },
        ],
      },
      {
        // Ficha incompleta y sin consultas.
        data: {
          firstName: 'Jorge',
          lastName: 'Ibarra',
          phone: '+54 342 555-0303',
          registrationComplete: false,
          dataCompletedAt: null,
        },
      },
    ],
  },
  {
    nutritionist: { name: 'Martín Sosa', email: 'nutricionista2@nutria.com' },
    recipes: [
      {
        name: 'Avena con yogur y manzana',
        preparation: '1. Mezclar la avena con el yogur.\n2. Agregar la manzana en cubos y las semillas.',
        cookingMethod: 'no_cooking',
        timeMinutes: 5,
        ingredients: [
          { food: 'Avena arrollada', quantityDescription: '3 cucharadas' },
          { food: 'Yogur natural', quantityDescription: '1 pote' },
          { food: 'Manzana', quantityDescription: '1 unidad' },
          { food: 'Semillas de chía', quantityDescription: '1 cucharadita' },
        ],
        mealTypes: ['breakfast', 'afternoon_snack'],
      },
    ],
    patients: [
      {
        data: {
          firstName: 'Valeria',
          lastName: 'Acosta',
          birthDate: new Date('1985-11-02'),
          phone: '+54 342 555-0404',
          email: 'valeria.acosta@example.com',
          livesWith: 'Sola',
          goal: 'Aumentar masa muscular',
          referenceWeight: 61.0,
          physicalActivity: 'Gimnasio tres veces por semana',
          smoking: 'No fuma',
          cooks: true,
          likesCooking: false,
          cookingTime: 'Poco tiempo en la semana, más los domingos',
          occupation: 'Docente',
          workContext: 'Turno mañana y tarde en dos escuelas, horarios irregulares',
          mealsOutsideHome: 'Almuerzo entre turnos',
          outsideEquipment: 'Sin heladera; lleva conservadora',
          attendsAccompanied: false,
          registrationComplete: true,
          dataCompletedAt: new Date(),
        },
        conditions: [{ type: 'pathology', pathology: 'Hipertensión' }],
        consultations: [
          {
            date: '2026-08-20',
            type: 'first',
            motivation: 'Mejorar el rendimiento en el gimnasio',
            decisionOrigin: 'Propia',
            perceivedObstacle: 'Horarios cortados entre escuelas',
            mainHabit: 'Saltear el almuerzo',
            measurements: [
              { type: 'weight', value: 61.0, unit: 'kg' },
              { type: 'height', value: 168, unit: 'cm' },
              { type: 'skinfold', detail: 'Tricipital', value: 18, unit: 'mm' },
              { type: 'cholesterol', value: 190, unit: 'mg/dL' },
              { type: 'triglycerides', value: 120, unit: 'mg/dL' },
            ],
            habits: [{ description: 'Llevar el almuerzo los días de doble turno', evaluation: { compliance: 'partial' } }],
          },
          {
            date: '2026-09-24',
            type: 'follow_up',
            measurements: [{ type: 'weight', value: 61.8, unit: 'kg' }],
            habits: [],
          },
        ],
      },
      {
        // Ficha incompleta, con una consulta y un análisis traído después.
        data: {
          firstName: 'Diego',
          lastName: 'Paredes',
          goal: 'Controlar glucemia',
          registrationComplete: false,
          dataCompletedAt: null,
        },
        conditions: [{ type: 'pathology', pathology: 'Diabetes' }],
        consultations: [
          {
            date: '2026-09-15',
            type: 'first',
            measurements: [
              { type: 'weight', value: 82.5, unit: 'kg' },
              { type: 'glucose', value: 112, unit: 'mg/dL' },
            ],
            habits: [{ description: 'Registrar lo que come durante una semana' }],
          },
        ],
        looseMeasurements: [
          { type: 'glucose', value: 105, unit: 'mg/dL', date: '2026-10-01' },
          { type: 'other', detail: 'Hemoglobina glicosilada', value: 6.1, unit: '%', date: '2026-10-01' },
        ],
      },
    ],
  },
];

async function setCategories(foodId, categories) {
  await prisma.foodCategory.deleteMany({ where: { foodId } });
  await prisma.foodCategory.createMany({ data: categories.map((category) => ({ foodId, category })) });
}

async function seedPrivateFoods(nutritionistId, foods, catalog) {
  for (const { name, group, categories } of foods) {
    const foodGroupId = requireId(catalog.groupIds, group, 'grupo');
    const food = await prisma.food.upsert({
      where: { nutritionistId_name: { nutritionistId, name } },
      update: { foodGroupId, active: true },
      create: { name, foodGroupId, nutritionistId },
    });
    await setCategories(food.id, categories);
  }
}

// Se reemplazan todas las del nutricionista, como las recetas: no las referencia
// nada todavía.
async function seedPrivateRecommendations(nutritionistId, recommendations, catalog) {
  await prisma.clinicalRecommendation.deleteMany({ where: { nutritionistId } });
  await prisma.clinicalRecommendation.createMany({
    data: recommendations.map(({ pathology, ...data }) => ({
      ...data,
      pathologyId: requireId(catalog.pathologyIds, pathology, 'patología'),
      nutritionistId,
    })),
  });
}

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

// Catálogos: upsert por nombre, así el seed se puede correr sobre una base con
// datos sin duplicarlos. Devuelve los ids por nombre para resolver referencias.
async function seedCatalogs() {
  const groupIds = {};
  for (const { name, parent } of FOOD_GROUPS) {
    const parentId = parent ? requireId(groupIds, parent, 'grupo padre') : null;
    const group = await prisma.foodGroup.upsert({
      where: { name },
      update: { parentId },
      create: { name, parentId },
    });
    groupIds[name] = group.id;
  }

  // Los alimentos del seed son comunes (nutritionistId null). No hay upsert por
  // nombre: el único es (nutritionistId, name) y Prisma no acepta null en esa clave.
  const foodIds = {};
  for (const { name, group, categories } of FOODS) {
    const existing = await prisma.food.findFirst({ where: { name, nutritionistId: null } });
    const data = { foodGroupId: requireId(groupIds, group, 'grupo'), active: true };
    const food = existing
      ? await prisma.food.update({ where: { id: existing.id }, data })
      : await prisma.food.create({ data: { ...data, name } });
    await setCategories(food.id, categories);
    foodIds[name] = food.id;
  }

  const pathologyIds = {};
  for (const { name, description } of PATHOLOGIES) {
    const pathology = await prisma.pathology.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
    pathologyIds[name] = pathology.id;
  }

  // Las recomendaciones del seed son comunes (nutritionistId null). Sin único
  // en la base: se busca por título, como los alimentos comunes por nombre.
  for (const { pathology, title, text } of RECOMMENDATIONS) {
    const existing = await prisma.clinicalRecommendation.findFirst({ where: { title, nutritionistId: null } });
    const data = { pathologyId: requireId(pathologyIds, pathology, 'patología'), text, active: true };
    if (existing) await prisma.clinicalRecommendation.update({ where: { id: existing.id }, data });
    else await prisma.clinicalRecommendation.create({ data: { ...data, title } });
  }

  console.log(
    `Seed: catálogo con ${FOOD_GROUPS.length} grupos, ${FOODS.length} alimentos, ${PATHOLOGIES.length} patologías ` +
      `y ${RECOMMENDATIONS.length} recomendaciones comunes.`,
  );
  return { groupIds, foodIds, pathologyIds };
}

function requireId(ids, name, kind) {
  if (!ids[name]) throw new Error(`Seed: ${kind} "${name}" no está en el catálogo`);
  return ids[name];
}

async function seedPatient(nutritionistId, patient, catalog) {
  const { data, conditions = [], consultations = [], looseMeasurements = [] } = patient;

  const { id: patientId } = await prisma.patient.create({ data: { ...data, nutritionistId } });

  await prisma.patientCondition.createMany({
    data: conditions.map(({ type, pathology, food, foodGroup, observations }) => ({
      patientId,
      type,
      pathologyId: pathology ? requireId(catalog.pathologyIds, pathology, 'patología') : null,
      foodId: food ? requireId(catalog.foodIds, food, 'alimento') : null,
      foodGroupId: foodGroup ? requireId(catalog.groupIds, foodGroup, 'grupo') : null,
      observations: observations ?? null,
    })),
  });

  // Hábitos pautados en la consulta anterior que se evalúan en la actual.
  let habitsToEvaluate = [];
  for (const { date, measurements, habits, ...consultationData } of consultations) {
    const consultation = await prisma.consultation.create({
      data: { ...consultationData, date: toDate(date), patientId },
    });

    for (const { habitId, evaluation } of habitsToEvaluate) {
      await prisma.prescribedHabit.update({
        where: { id: habitId },
        data: {
          evaluationConsultationId: consultation.id,
          compliance: evaluation.compliance,
          evaluationObservations: evaluation.observations ?? null,
        },
      });
    }

    await prisma.measurement.createMany({
      data: measurements.map((measurement) => ({
        ...measurement,
        date: consultation.date,
        patientId,
        consultationId: consultation.id,
      })),
    });

    habitsToEvaluate = [];
    for (const { description, evaluation } of habits) {
      const habit = await prisma.prescribedHabit.create({
        data: { description, consultationId: consultation.id },
      });
      if (evaluation) habitsToEvaluate.push({ habitId: habit.id, evaluation });
    }
  }

  await prisma.measurement.createMany({
    data: looseMeasurements.map(({ date, ...measurement }) => ({ ...measurement, date: toDate(date), patientId })),
  });
}

async function seedRecipes(nutritionistId, recipes, catalog) {
  await prisma.recipe.deleteMany({ where: { nutritionistId } });

  for (const { ingredients, mealTypes, ...recipeData } of recipes) {
    await prisma.recipe.create({
      data: {
        ...recipeData,
        nutritionistId,
        ingredients: {
          create: ingredients.map(({ food, quantityDescription }, index) => ({
            foodId: requireId(catalog.foodIds, food, 'alimento'),
            quantityDescription,
            order: index + 1,
          })),
        },
        mealTypes: { create: mealTypes.map((mealType) => ({ mealType })) },
      },
    });
  }
}

async function main() {
  if (!SEED_PASSWORD) {
    throw new Error('Con NODE_ENV=production el seed necesita SEED_PASSWORD (la contraseña de los nutricionistas).');
  }
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const catalog = await seedCatalogs();

  for (const { nutritionist: data, patients, recipes, privateFoods = [], privateRecommendations = [] } of SEED_DATA) {
    const nutritionist = await prisma.nutritionist.upsert({
      where: { email: data.email },
      update: { passwordHash },
      create: { ...data, passwordHash },
    });

    // Borrar los pacientes arrastra en cascada sus condiciones, consultas,
    // mediciones y hábitos pautados.
    await prisma.patient.deleteMany({ where: { nutritionistId: nutritionist.id } });
    for (const patient of patients) {
      await seedPatient(nutritionist.id, patient, catalog);
    }
    await seedRecipes(nutritionist.id, recipes, catalog);
    await seedPrivateFoods(nutritionist.id, privateFoods, catalog);
    await seedPrivateRecommendations(nutritionist.id, privateRecommendations, catalog);

    console.log(
      `Seed: ${nutritionist.email} con ${patients.length} pacientes, ${recipes.length} receta(s), ` +
        `${privateFoods.length} alimento(s) privado(s) y ${privateRecommendations.length} recomendación(es) privada(s).`,
    );
  }

  if (SEED_PASSWORD === DEV_SEED_PASSWORD) {
    console.log(`Contraseña de prueba de ambos nutricionistas: ${SEED_PASSWORD}`);
  } else {
    console.log('Contraseña de ambos nutricionistas: la de SEED_PASSWORD.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
