const { integrationDatabaseUrl } = require('./integration-database');

describe('destino de la integración', () => {
  it('deriva nutria_test conservando conexión y opciones', () => {
    expect(integrationDatabaseUrl({ DATABASE_URL: 'postgresql://user:pass@postgres:5432/nutria?schema=public' }))
      .toBe('postgresql://user:pass@postgres:5432/nutria_test?schema=public');
  });

  it('permite una conexión explícita únicamente a nutria_test', () => {
    const url = 'postgresql://user:pass@localhost:5432/nutria_test';
    expect(integrationDatabaseUrl({ TEST_DATABASE_URL: url, DATABASE_URL: 'invalid' })).toBe(url);
  });

  it.each([
    'postgresql://user:secret@postgres:5432/nutria',
    'postgresql://user:secret@postgres:5432/nutria_test?schema=development',
    'postgresql://user:secret@postgres:5432/nutria_test?schema=public&schema=development',
    'postgresql://user:secret@postgres:5432/nutria_test_other',
    'mysql://user:secret@postgres:5432/nutria_test',
    'invalid-secret',
  ])('rechaza destinos inseguros sin exponer credenciales (%s)', (url) => {
    expect(() => integrationDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow();
    try {
      integrationDatabaseUrl({ TEST_DATABASE_URL: url });
    } catch (error) {
      expect(error.message).not.toContain('secret');
    }
  });

  it('rechaza un schema de desarrollo también al derivar la URL', () => {
    expect(() => integrationDatabaseUrl({ DATABASE_URL: 'postgresql://postgres/nutria?schema=development' })).toThrow('schema public');
  });

  it('falla antes de abrir conexiones si falta configuración', () => {
    expect(() => integrationDatabaseUrl({})).toThrow('necesita DATABASE_URL');
  });
});
