const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const components = require('./components');
const { version } = require('../../package.json');

// swagger-jsdoc resuelve `apis` con glob, que no acepta separadores de Windows:
// con un path que trae "\" no matchea ningún archivo y el spec sale sin un solo
// endpoint, sin error ni advertencia. Absoluto desde __dirname para no depender
// del directorio desde el que se haya arrancado el proceso.
const routesGlob = path.join(__dirname, '..', 'routes', '*.routes.js').replace(/\\/g, '/');

// OpenAPI 3.0 y no 3.1 a propósito: casi todo el modelo de paciente es nullable
// y `nullable: true` solo existe en 3.0.
const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'nutria-backend',
      version,
      description:
        'API REST de NutrIA: autenticación del nutricionista, gestión de sus pacientes y ' +
        'catálogos comunes de alimentos y patologías.\n\n' +
        'Todo acceso a datos de paciente se filtra por el nutricionista del token. El ' +
        '`nutritionistId` nunca se lee del cliente ni viaja en las respuestas.\n\n' +
        'Todo error usa el formato uniforme `{ error: { code, message, details? } }`: `code` es ' +
        'estable, `message` se puede mostrar al usuario y, en errores de validación, ' +
        '`details.fields` mapea cada campo inválido a su mensaje. Ninguna respuesta de error ' +
        'expone el stack ni el mensaje interno de un error inesperado.',
    },
    // El primero es relativo a propósito: hace que "Try it out" salga contra el
    // mismo origen que sirve esta página, así no cruza orígenes y no hace falta
    // sumar el dominio de la documentación al CORS. Funciona igual abriendo la UI
    // en swagger.local.nutria.com o en api.local.nutria.com, que son el mismo
    // contenedor. Los absolutos quedan como referencia para quien lea el spec
    // fuera de la UI.
    servers: [
      { url: '/', description: 'El mismo origen que sirve esta documentación' },
      { url: 'http://api.local.nutria.com', description: 'Stack local (Traefik)' },
      { url: 'http://localhost:3000', description: 'Backend sin proxy' },
    ],
    tags: [
      { name: 'Salud', description: 'Verificación de que el backend responde y de que alcanza al servicio de IA.' },
      { name: 'Autenticación', description: 'Login del nutricionista y emisión del JWT.' },
      { name: 'Pacientes', description: 'Alta, edición y consulta de los pacientes del nutricionista autenticado.' },
      {
        name: 'Catálogos',
        description:
          'Grupos de alimentos, alimentos y patologías: catálogos comunes a todos los nutricionistas. ' +
          'Todos leen el catálogo completo; cada ítem solo lo edita quien lo cargó, y los de la base ' +
          'inicial no se editan por la API.',
      },
    ],
    components,
  },
  apis: [routesGlob],
});

module.exports = openapiSpec;
