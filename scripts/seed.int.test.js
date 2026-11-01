const { execFileSync } = require('node:child_process');
const { prisma } = require('../src/test/integration');
const { CLINICAL_CASES } = require('./seed-data/clinical-cases');

it('el seed corre sin JWT_SECRET, revoca las sesiones de sus cuentas al volver a ejecutarlo y conserva los casos clínicos', async () => {
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

  execFileSync(process.execPath, ['scripts/seed.js'], { env: seedEnv, stdio: 'pipe', timeout: 15000 });

  const updated = await prisma.nutritionist.findMany({ orderBy: { id: 'asc' } });
  expect(updated.map(({ id }) => id)).toEqual(owners.map(({ id }) => id).sort());
  expect(updated.every(({ tokenVersion }) => tokenVersion === 1)).toBe(true);

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
});
