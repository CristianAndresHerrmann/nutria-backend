const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/.git/**', '**/*.int.test.js'],
    env: {
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '1h',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // test:backend:coverage monta este directorio con el compose normal.
      // El comando limpia el reporte desde el host antes de montarlo: Vitest
      // no debe borrar el punto de montaje, porque daría EBUSY.
      clean: false,
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        // Bootstrap y singletons: no tienen lógica propia que probar de forma
        // unitaria (requerirían una base/servidor real para decir algo útil).
        'src/server.js',
        'src/lib/**',
        'src/test/**',
      ],
    },
  },
});
