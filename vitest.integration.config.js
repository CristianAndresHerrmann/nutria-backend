const { defineConfig } = require('vitest/config');
const { integrationDatabaseUrl } = require('./scripts/integration-database');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.int.test.js', 'scripts/**/*.int.test.js'],
    fileParallelism: false,
    maxWorkers: 1,
    setupFiles: ['./src/test/integration.setup.js'],
    env: {
      DATABASE_URL: integrationDatabaseUrl(),
      NODE_ENV: 'test',
      JWT_SECRET: 'integration-test-secret',
      JWT_EXPIRES_IN: '1h',
    },
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
