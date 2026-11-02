// Esta base está reservada para pruebas: nunca resetear la que usa la app.
function integrationDatabaseUrl(env = process.env) {
  const source = env.TEST_DATABASE_URL || env.DATABASE_URL;
  if (!source) throw new Error('La integración necesita DATABASE_URL o TEST_DATABASE_URL');

  let url;
  try {
    url = new URL(source);
  } catch {
    // No incluir la URL en el error: puede contener credenciales.
    throw new Error('La URL de integración no es válida');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('La integración requiere PostgreSQL');
  }
  if (!env.TEST_DATABASE_URL) url.pathname = '/nutria_test';
  if (url.pathname !== '/nutria_test' || url.searchParams.getAll('schema').some((schema) => schema !== 'public')) {
    throw new Error('La integración solo puede resetear nutria_test con schema public');
  }
  return url.toString();
}

module.exports = { integrationDatabaseUrl };
