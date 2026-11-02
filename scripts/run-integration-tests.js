const { spawnSync } = require('node:child_process');
const { dirname, resolve } = require('node:path');
const { integrationDatabaseUrl } = require('./integration-database');

const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: integrationDatabaseUrl() };

function run(modulePath, args) {
  const result = spawnSync(process.execPath, [require.resolve(modulePath), ...args], { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// Prisma crea nutria_test si no existe. La validación anterior se ejecuta antes
// de cualquier comando destructivo; no se carga el seed como fixture.
run('prisma/build/index.js', ['migrate', 'reset', '--force', '--skip-seed', '--skip-generate']);
const vitestPackage = require.resolve('vitest/package.json');
const vitestCli = resolve(dirname(vitestPackage), require(vitestPackage).bin.vitest);
run(vitestCli, ['run', '--config', 'vitest.integration.config.js', ...process.argv.slice(2)]);
