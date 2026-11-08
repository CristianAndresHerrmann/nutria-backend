const { execFileSync } = require('node:child_process');
const { prisma } = require('../src/test/integration');
const { CLINICAL_CASES } = require('./seed-data/clinical-cases');
const { CLINICAL_RULES } = require('./seed-data/clinical-rules');
const { COMMON_RECIPES } = require('./seed-data/recipes');
const { PRIVATE_RECIPES, CONTROL_RECIPES } = require('./seed-data/private-recipes');
const recipes = require('../src/repositories/recipe.repository');

it('el seed corre sin JWT_SECRET, revoca las sesiones de sus cuentas al volver a ejecutarlo y conserva los casos clínicos y las reglas', async () => {
  expect(await prisma.nutritionist.count()).toBe(0);
  const seedEnv = { ...process.env, NODE_ENV: 'development', SEED_PASSWORD: 'Integration-ficticia-123!' };
  delete seedEnv.JWT_SECRET;
  execFileSync(process.execPath, ['scripts/seed.js'], {
    env: seedEnv,
    stdio: 'pipe',
    timeout: 15000,
  });
  expect(await prisma.nutritionist.count()).toBe(2);
  const owners = await prisma.nutritionist.findMany({ include: { patients: true } });
  expect(owners.every(({ patients }) => patients.length > 0)).toBe(true);
  expect(await prisma.food.count({ where: { nutritionistId: null } })).toBeGreaterThan(0);
  expect(await prisma.recipe.count({ where: { nutritionistId: null } })).toBeGreaterThan(0);
  expect(owners.every(({ tokenVersion }) => tokenVersion === 0)).toBe(true);
  expect(await prisma.clinicalRule.count({ where: { active: true } })).toBe(CLINICAL_RULES.length);

  // Una regla que no está en la matriz (T35): el seed la da de baja, no la borra.
  const diabetes = await prisma.pathology.findUniqueOrThrow({ where: { name: 'Diabetes' } });
  const chicken = await prisma.food.findFirstOrThrow({ where: { name: 'Pollo entero', nutritionistId: null } });
  const outside = await prisma.clinicalRule.create({
    data: { pathologyId: diabetes.id, foodId: chicken.id, severity: 'prohibited', source: 'Regla ficticia de la prueba, p. 1' },
  });

  execFileSync(process.execPath, ['scripts/seed.js'], { env: seedEnv, stdio: 'pipe', timeout: 15000 });

  const updated = await prisma.nutritionist.findMany({ orderBy: { id: 'asc' } });
  expect(updated.map(({ id }) => id)).toEqual(owners.map(({ id }) => id).sort());
  expect(updated.every(({ tokenVersion }) => tokenVersion === 1)).toBe(true);
  expect(await prisma.clinicalRule.count()).toBe(CLINICAL_RULES.length + 1);
  expect(await prisma.clinicalRule.count({ where: { active: true } })).toBe(CLINICAL_RULES.length);
  expect(await prisma.clinicalRule.findUnique({ where: { id: outside.id } })).toMatchObject({ active: false });

  // Criterio de cierre de T41: después de volver a correr el seed, cada caso
  // clínico está una sola vez en nutricionista@nutria.com, con sus condiciones.
  for (const { code, patient } of CLINICAL_CASES) {
    const { firstName, lastName } = patient.data;
    const found = await prisma.patient.findMany({
      where: { firstName, lastName, nutritionist: { email: 'nutricionista@nutria.com' } },
      include: { conditions: true },
    });
    expect(found, code).toHaveLength(1);
    expect(found[0].conditions.map(({ type }) => type).sort(), code).toEqual(
      patient.conditions.map(({ type }) => type).sort(),
    );
  }

  // Las comunes no se duplican al repetir el seed, y las propias de la primera
  // cuenta no llegan a la segunda (RNF-05).
  expect(await prisma.recipe.count({ where: { nutritionistId: null } })).toBe(COMMON_RECIPES.length);
  const first = await prisma.nutritionist.findUniqueOrThrow({ where: { email: 'nutricionista@nutria.com' } });
  const second = await prisma.nutritionist.findUniqueOrThrow({ where: { email: 'nutricionista2@nutria.com' } });
  const ownNames = [...PRIVATE_RECIPES, ...CONTROL_RECIPES].map(({ name }) => name);
  const visibleNames = async ({ id }) => (await recipes.findVisible(id, { includeUnavailable: true })).map(({ name }) => name);

  expect(await visibleNames(first)).toEqual(expect.arrayContaining(ownNames));
  expect((await visibleNames(second)).filter((name) => ownNames.includes(name))).toEqual([]);
});
