const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '1h',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // En Docker el directorio es un bind mount (docker-compose.test.yml):
      // borrarlo da EBUSY. Los reportes se sobrescriben igual.
      clean: false,
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        // Bootstrap y singletons: no tienen lógica propia que probar de forma
        // unitaria (requerirían una base/servidor real para decir algo útil).
        'src/server.js',
        'src/lib/**',
      ],
    },
  },
});
