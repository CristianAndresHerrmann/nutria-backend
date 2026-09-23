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
        'API REST de NutrIA: autenticación del nutricionista y gestión de sus pacientes.\n\n' +
        'Todo acceso a datos de paciente se filtra por el nutricionista del token. El ' +
        '`nutritionistId` nunca se lee del cliente ni viaja en las respuestas.\n\n' +
        'Los errores usan un formato uniforme `{ error, fields? }`, donde `fields` mapea cada ' +
        'campo inválido a su mensaje y solo aparece en errores de validación.',
    },
    servers: [
      { url: 'http://api.local.nutria.com', description: 'Stack local (Traefik)' },
      { url: 'http://localhost:3000', description: 'Backend sin proxy' },
    ],
    tags: [
      { name: 'Salud', description: 'Verificación de que el servicio responde.' },
      { name: 'Autenticación', description: 'Login del nutricionista y emisión del JWT.' },
      { name: 'Pacientes', description: 'Alta, edición y consulta de los pacientes del nutricionista autenticado.' },
    ],
    components,
  },
  apis: [routesGlob],
});

module.exports = openapiSpec;
