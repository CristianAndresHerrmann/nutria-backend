const { execFileSync } = require('node:child_process');
const { prisma } = require('../src/test/integration');

it('el seed corre sobre base vacía y carga catálogo y dos cuentas con pacientes ficticios', async () => {
  expect(await prisma.nutritionist.count()).toBe(0);
  execFileSync(process.execPath, ['scripts/seed.js'], {
    env: { ...process.env, NODE_ENV: 'test', SEED_PASSWORD: 'Integration-ficticia-123!' },
    stdio: 'pipe',
    timeout: 15000,
  });
  expect(await prisma.nutritionist.count()).toBe(2);
  const owners = await prisma.nutritionist.findMany({ include: { patients: true } });
  expect(owners.every(({ patients }) => patients.length > 0)).toBe(true);
  expect(await prisma.food.count({ where: { nutritionistId: null } })).toBeGreaterThan(0);
  expect(await prisma.recipe.count({ where: { nutritionistId: null } })).toBeGreaterThan(0);
});
