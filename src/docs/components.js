// Piezas reutilizables del spec OpenAPI: se referencian desde los bloques
// @openapi de las rutas con $ref. Van como objeto JS y no como YAML suelto
// porque las comparten todas las rutas y así quedan requeribles y testeables.
//
// Los schemas se escriben a mano en vez de derivarlos de los schemas Zod:
// z.toJSONSchema no puede representar el superRefine de "menor de edad exige
// adulto responsable" ni el preprocess/transform de birthDate. Al agregar o
// cambiar un endpoint hay que actualizar esto junto con el schema Zod.

const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Token devuelto por `POST /auth/login`. Se manda como `Authorization: Bearer <token>` ' +
      'y expira a las 2 horas por defecto (`JWT_EXPIRES_IN`).',
  },
};

// Campos del paciente que comparten request y respuesta con el mismo tipo.
// birthDate queda afuera a propósito: entra como AAAA-MM-DD y sale como
// fecha-hora ISO, así que se declara distinto en cada schema.
const sharedPatientFields = {
  firstName: { type: 'string', minLength: 1, example: 'Lucía' },
  lastName: { type: 'string', minLength: 1, example: 'Fernández' },
  phone: { type: 'string', nullable: true, maxLength: 50, example: '+54 342 555-0101' },
  email: { type: 'string', format: 'email', nullable: true, example: 'lucia.fernandez@example.com' },
  livesWith: { type: 'string', nullable: true, maxLength: 255, example: 'Pareja' },
  goal: { type: 'string', nullable: true, maxLength: 255, example: 'Bajar de peso' },
  referenceWeight: {
    type: 'number',
    nullable: true,
    exclusiveMinimum: 0,
    description: 'Peso de referencia subjetivo en kilogramos. Decimal(5,2) en la base.',
    example: 68.5,
  },
  guardianName: { type: 'string', nullable: true, maxLength: 255, example: 'María Gómez' },
  guardianRelationship: { type: 'string', nullable: true, maxLength: 255, example: 'Madre' },
  guardianContact: { type: 'string', nullable: true, maxLength: 255, example: '+54 342 555-0202' },
  attendsAccompanied: { type: 'boolean', nullable: true, example: true },
};

// Datos clínicos y contextuales (RF-04 a RF-14). Columnas de T14; el alta y la
// edición los aceptan desde T16, todos opcionales.
const nullableText = (example) => ({ type: 'string', nullable: true, maxLength: 2000, example });

const clinicalPatientFields = {
  medicalHistory: nullableText('Sin antecedentes relevantes.'),
  medication: nullableText(null),
  externalTreatment: nullableText(null),
  physicalActivity: nullableText('Camina 30 minutos, dos veces por semana'),
  smoking: nullableText('No fuma'),
  alcohol: nullableText('Ocasional, fines de semana'),
  mealSchedule: nullableText('Desayuno 7 h, almuerzo 13 h, cena 21 h'),
  sleepSchedule: nullableText('De 23 h a 6:30 h'),
  cooks: { type: 'boolean', nullable: true, example: true },
  likesCooking: { type: 'boolean', nullable: true, example: true },
  cookingTime: nullableText('30 minutos por día'),
  homeEquipment: nullableText('Horno, anafe y microondas'),
  usualShoppingPlace: nullableText('Supermercado y verdulería del barrio'),
  mealsOutsideHome: nullableText('Almuerzo de lunes a viernes'),
  outsideEquipment: nullableText('Heladera y microondas en la oficina'),
  occupation: nullableText('Administrativa'),
  workContext: nullableText('Oficina, de 8 a 16 h, horario regular'),
  intakePatterns: nullableText('Picoteo por la tarde'),
};

// Categorías de un alimento, compartidas por el alta y la respuesta (T15).
const foodCategoriesField = {
  type: 'array',
  minItems: 1,
  uniqueItems: true,
  description: 'Categorías nutricionales (RF-25): una o más, sin repetir.',
  items: { type: 'string', enum: ['protein', 'carbohydrate', 'fiber', 'vegetable', 'healthy_fat', 'infusion'] },
  example: ['protein', 'healthy_fat'],
};

// Ítem del catálogo referenciado por una condición del paciente (T18).
function catalogRef(exampleName) {
  return {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: exampleName },
    },
  };
}

const schemas = {
  Health: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'ok' },
      service: { type: 'string', example: 'nutria-backend' },
      timestamp: { type: 'string', format: 'date-time', example: '2026-09-17T14:03:11.204Z' },
    },
  },

  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'nutricionista@nutria.com' },
      password: { type: 'string', format: 'password', example: '123456aA!' },
    },
  },

  LoginResponse: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'JWT firmado con HS256. El id del nutricionista viaja en el claim `sub`.',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
      nutritionist: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Camila Ríos' },
          email: { type: 'string', format: 'email', example: 'nutricionista@nutria.com' },
        },
      },
    },
  },

  PatientInput: {
    type: 'object',
    required: ['firstName', 'lastName'],
    // Refleja el z.strictObject del schema Zod: una clave desconocida da 400.
    additionalProperties: false,
    description:
      'Body de alta y de edición: comparten schema porque el formulario es el mismo y ambos ' +
      'mandan el objeto completo, no un diff de campos.\n\n' +
      '**Regla cruzada que no se puede expresar en JSON Schema:** si `birthDate` corresponde a ' +
      'un menor de 18 años, `guardianName`, `guardianRelationship`, `guardianContact` y ' +
      '`attendsAccompanied` pasan a ser obligatorios y su ausencia devuelve 400 con los cuatro ' +
      'campos en `details.fields`.\n\n' +
      'Los campos opcionales aceptan el valor, `""`, `null` o su ausencia; las tres últimas ' +
      'formas se guardan como `null`. Eso permite dar de alta un paciente con solo nombre y ' +
      'apellido y completar el resto después.\n\n' +
      'Los datos clínicos y contextuales (`medicalHistory` a `intakePatterns`) son todos ' +
      'opcionales. Como la edición reemplaza el objeto completo, un campo que no se manda en ' +
      'el `PUT` queda en `null`.',
    properties: {
      ...sharedPatientFields,
      ...clinicalPatientFields,
      birthDate: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        nullable: true,
        description:
          'Fecha de nacimiento en formato `AAAA-MM-DD`. Tiene que ser una fecha que exista ' +
          '(`2023-02-30` da 400) y no puede ser posterior a hoy (UTC).',
        example: '1992-03-14',
      },
      registrationComplete: {
        type: 'boolean',
        default: false,
        description:
          'Marca el registro como completo. La primera vez que pasa de `false` a `true` el ' +
          'servidor sella `dataCompletedAt`; ese sello no se borra si después se vuelve a ' +
          'marcar como incompleto.',
      },
    },
  },

  Patient: {
    type: 'object',
    description:
      'Paciente tal como lo devuelve la API. `nutritionistId` no viaja: es siempre el del ' +
      'nutricionista autenticado.',
    properties: {
      id: { type: 'string', format: 'uuid' },
      ...sharedPatientFields,
      ...clinicalPatientFields,
      birthDate: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description:
          'Columna `date` en la base, serializada a fecha-hora ISO en UTC. Ojo con la ' +
          'asimetría: entra como `AAAA-MM-DD` y sale con hora.',
        example: '1992-03-14T00:00:00.000Z',
      },
      age: {
        type: 'integer',
        nullable: true,
        description:
          'Edad calculada por el servidor a partir de `birthDate`. No es una columna: es ' +
          '`null` cuando no hay fecha de nacimiento cargada.',
        example: 34,
      },
      registrationComplete: { type: 'boolean', example: true },
      dataCompletedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Momento en que el registro se marcó completo por primera vez.',
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  PatientDetail: {
    description: 'Paciente con los datos que solo se calculan en el detalle (`GET /patients/{id}`).',
    allOf: [
      { $ref: '#/components/schemas/Patient' },
      {
        type: 'object',
        properties: {
          missingClinicalData: {
            type: 'boolean',
            description:
              'Aviso de RF-45: `true` cuando el paciente no tiene registrada ninguna patología, ' +
              'alergia, intolerancia ni medicación. Rechazos y preferencias no cuentan. No bloquea ' +
              'nada: la ficha lo muestra como advertencia.',
            example: false,
          },
        },
      },
    ],
  },

  // Catálogos (T15). Grupos y patologías son comunes y de solo lectura; un
  // alimento es común o privado del nutricionista que lo cargó.
  FoodGroup: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Aves' },
      description: { type: 'string', nullable: true, example: null },
      parentId: { type: 'string', format: 'uuid', nullable: true, description: '`null` en un grupo raíz.' },
    },
  },

  FoodInput: {
    type: 'object',
    required: ['name', 'foodGroupId', 'categories'],
    additionalProperties: false,
    description:
      'Alta de un alimento privado. El nombre se guarda sin espacios de más. El dueño no se manda: ' +
      'sale del token.',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100, example: 'Caballa' },
      foodGroupId: { type: 'string', format: 'uuid' },
      categories: foodCategoriesField,
    },
  },

  Food: {
    type: 'object',
    description:
      'Alimento común o privado del nutricionista autenticado. El dueño de un privado no viaja: ' +
      'el único privado que un nutricionista ve es suyo.',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Caballa' },
      active: { type: 'boolean', description: 'Vigente. El listado solo devuelve vigentes.', example: true },
      foodGroupId: { type: 'string', format: 'uuid' },
      foodGroup: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Pescados' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
        },
      },
      categories: foodCategoriesField,
    },
  },

  Pathology: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Celiaquía' },
      description: { type: 'string', nullable: true },
    },
  },

  // Condiciones del paciente (T18; RF-04 patologías, RF-07).
  PatientConditionInput: {
    type: 'object',
    required: ['type'],
    additionalProperties: false,
    description:
      'Una `pathology` exige `pathologyId` y no referencia alimentos. Los demás tipos exigen ' +
      'exactamente uno entre `foodId` y `foodGroupId`, y no llevan `pathologyId`. Cualquier otra ' +
      'combinación da 400 `VALIDATION_ERROR` con el campo en `details.fields`. Un string vacío ' +
      'cuenta como ausencia del dato. El paciente sale de la ruta y el nutricionista del token.',
    properties: {
      type: { type: 'string', enum: ['pathology', 'allergy', 'intolerance', 'rejection', 'preference'] },
      pathologyId: { type: 'string', format: 'uuid', nullable: true },
      foodId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Alimento común o privado propio, vigente. Uno inexistente o privado de otro da 400.',
      },
      foodGroupId: { type: 'string', format: 'uuid', nullable: true },
      registeredAt: {
        type: 'string',
        format: 'date',
        nullable: true,
        description: 'AAAA-MM-DD, no futura. Si no viene: en el alta, la fecha del día; en la edición, la que tenía.',
      },
      observations: { type: 'string', nullable: true, maxLength: 1000, example: 'Le cae mal en cantidad' },
    },
  },

  PatientCondition: {
    type: 'object',
    description: 'Condición registrada, con el nombre de lo que referencia. Solo uno de los tres destinos viene con valor.',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['pathology', 'allergy', 'intolerance', 'rejection', 'preference'] },
      pathologyId: { type: 'string', format: 'uuid', nullable: true },
      pathology: { ...catalogRef('Celiaquía'), nullable: true },
      foodId: { type: 'string', format: 'uuid', nullable: true },
      food: { ...catalogRef('Leche'), nullable: true },
      foodGroupId: { type: 'string', format: 'uuid', nullable: true },
      foodGroup: { ...catalogRef('Lácteos'), nullable: true },
      registeredAt: { type: 'string', format: 'date-time', example: '2026-10-19T00:00:00.000Z' },
      observations: { type: 'string', nullable: true, example: null },
    },
  },

  // Consultas y hábitos pautados (T19; RF-13, RF-18, RF-22 registro).
  ConsultationInput: {
    type: 'object',
    required: ['date', 'type'],
    additionalProperties: false,
    description:
      'Campos de la consulta. Fecha y tipo son obligatorios; el resto es opcional y un string vacío ' +
      'cuenta como ausencia del dato (RNF-09). En el `PUT` es un reemplazo completo: un campo ' +
      'omitido queda en `null`. El paciente sale de la ruta y el nutricionista del token.',
    properties: {
      date: { type: 'string', format: 'date', example: '2026-10-19', description: 'AAAA-MM-DD, no futura.' },
      type: { type: 'string', enum: ['first', 'follow_up'], description: '`first` = primera, `follow_up` = seguimiento.' },
      motivation: { ...nullableText('Sentirse con más energía'), description: 'Motivación (RF-13).' },
      decisionOrigin: { ...nullableText('Propia'), description: 'Origen de la decisión de cambio (RF-13).' },
      perceivedObstacle: { ...nullableText('Falta de tiempo para cocinar'), description: 'Obstáculo percibido (RF-13).' },
      mainHabit: { ...nullableText('Picoteo por la tarde'), description: 'Hábito principal a modificar (RF-13).' },
      observations: {
        type: 'string',
        nullable: true,
        maxLength: 5000,
        example: 'Buena adherencia a la caminata.',
        description: 'Observaciones libres (RF-18).',
      },
    },
  },

  ConsultationCreateInput: {
    description: 'Los campos de `ConsultationInput` más los hábitos pautados al cierre de la consulta.',
    allOf: [
      { $ref: '#/components/schemas/ConsultationInput' },
      {
        type: 'object',
        properties: {
          habits: {
            type: 'array',
            maxItems: 20,
            description:
              'Hábitos pautados (RF-22), redactados por el profesional, sin catálogo. Opcional: sin ' +
              'hábitos la consulta se guarda igual. Nacen con `compliance: pending`. No se editan con ' +
              'el `PUT`. Un error en cualquiera de ellos viene en `details.fields.habits`.',
            items: {
              type: 'object',
              required: ['description'],
              additionalProperties: false,
              properties: {
                description: { type: 'string', minLength: 1, maxLength: 500, example: 'Caminar 30 minutos tres veces por semana' },
              },
            },
          },
        },
      },
    ],
  },

  PrescribedHabit: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      description: { type: 'string', example: 'Caminar 30 minutos tres veces por semana' },
      compliance: {
        type: 'string',
        enum: ['pending', 'met', 'partial', 'not_met'],
        example: 'pending',
        description: 'Al registrarse es siempre `pending`. La evaluación llega en el Incremento 5.',
      },
    },
  },

  Consultation: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      patientId: { type: 'string', format: 'uuid' },
      date: { type: 'string', format: 'date-time', example: '2026-10-19T00:00:00.000Z' },
      type: { type: 'string', enum: ['first', 'follow_up'] },
      motivation: { type: 'string', nullable: true, example: 'Sentirse con más energía' },
      decisionOrigin: { type: 'string', nullable: true, example: 'Propia' },
      perceivedObstacle: { type: 'string', nullable: true, example: null },
      mainHabit: { type: 'string', nullable: true, example: 'Picoteo por la tarde' },
      observations: { type: 'string', nullable: true, example: null },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      habits: { type: 'array', items: { $ref: '#/components/schemas/PrescribedHabit' } },
    },
  },

  IaHealth: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'ok' },
      service: { type: 'string', example: 'nutria-backend' },
      ia: {
        type: 'object',
        description: 'Lo que respondió el `/health` del servicio de IA, más la latencia medida por el backend.',
        properties: {
          status: { type: 'string', example: 'ok' },
          service: { type: 'string', example: 'nutria-ia' },
          latencyMs: { type: 'integer', example: 12 },
        },
      },
      timestamp: { type: 'string', format: 'date-time', example: '2026-09-23T14:03:11.204Z' },
    },
  },

  Error: {
    type: 'object',
    required: ['error'],
    description:
      'Formato uniforme de toda respuesta de error de la API, incluida una ruta inexistente. ' +
      '`message` es un texto en castellano pensado para mostrarse al usuario; `code` es estable ' +
      'y es lo que conviene usar para decidir qué hacer. Una respuesta de error nunca incluye ' +
      'el stack ni el mensaje interno de un error inesperado.',
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            description:
              '`VALIDATION_ERROR`, `INVALID_JSON`, `BAD_REQUEST` (400); `UNAUTHORIZED` (401); ' +
              '`NOT_FOUND` (404); `CONFLICT` (409); `PAYLOAD_TOO_LARGE` (413); `INTERNAL_ERROR` ' +
              '(500); `BAD_GATEWAY` (502); `IA_UNAVAILABLE`, `SERVICE_UNAVAILABLE` (503).',
            example: 'UNAUTHORIZED',
          },
          message: { type: 'string', example: 'Credenciales inválidas' },
          details: {
            type: 'object',
            description:
              'Opcional. En errores de validación (y en un 409 por valor duplicado) trae `fields`; ' +
              'en `IA_UNAVAILABLE` trae `reason`.',
            properties: {
              fields: {
                type: 'object',
                additionalProperties: { type: 'string' },
                description: 'Mapa de nombre de campo a su mensaje de error, para mostrarlo junto al input.',
              },
              reason: {
                type: 'string',
                enum: ['timeout', 'unreachable', 'bad_status', 'bad_body'],
                description: 'Por qué no se pudo usar el servicio de IA.',
              },
            },
          },
        },
      },
    },
  },
};

function errorExample(code, message, details) {
  return { error: details ? { code, message, details } : { code, message } };
}

// 404 de un ítem de catálogo: inexistente, con un id que no es UUID o, en un
// alimento, privado de otro nutricionista.
function notFoundResponse(message) {
  return {
    description: `${message}: no existe un ítem visible con ese id, o el id no es un UUID.`,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: errorExample('NOT_FOUND', message),
      },
    },
  };
}

const responses = {
  UnauthorizedError: {
    description: 'Falta el token, está mal formado, es inválido o expiró.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        examples: {
          sinToken: {
            summary: 'Sin header Authorization o con un esquema distinto de Bearer',
            value: errorExample('UNAUTHORIZED', 'No autenticado'),
          },
          tokenInvalido: {
            summary: 'El token no verifica contra JWT_SECRET, o ya expiró',
            value: errorExample('UNAUTHORIZED', 'Token inválido o expirado'),
          },
        },
      },
    },
  },

  ValidationError: {
    description:
      'La request no cumple el schema (body, parámetros de ruta o de query), o el body no es JSON ' +
      'válido. Un parámetro de query desconocido también da 400.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        examples: {
          campos: {
            summary: 'Campos inválidos',
            value: errorExample('VALIDATION_ERROR', 'El nombre es obligatorio', {
              fields: {
                firstName: 'El nombre es obligatorio',
                guardianName: 'Dato del adulto responsable obligatorio: el paciente es menor de edad',
              },
            }),
          },
          jsonInvalido: {
            summary: 'El body no se puede parsear como JSON',
            value: errorExample('INVALID_JSON', 'El cuerpo de la solicitud no es JSON válido'),
          },
        },
      },
    },
  },

  PatientNotFound: {
    description:
      'No hay un paciente con ese id para el nutricionista autenticado. Es la misma respuesta ' +
      'para un id inexistente, un id de otro nutricionista y un id que no es un UUID: la API no ' +
      'permite distinguir los tres casos.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: errorExample('NOT_FOUND', 'Paciente no encontrado'),
      },
    },
  },

  ConflictError: {
    description:
      'Ya existe un alimento con ese nombre entre los comunes o los propios, sin distinguir ' +
      'mayúsculas.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: errorExample('CONFLICT', 'Ya existe un alimento con ese nombre', {
          fields: { name: 'Ya existe un alimento con ese nombre' },
        }),
      },
    },
  },

  FoodGroupNotFound: notFoundResponse('Grupo de alimentos no encontrado'),
  FoodNotFound: notFoundResponse('Alimento no encontrado'),
  PathologyNotFound: notFoundResponse('Patología no encontrada'),

  PatientConditionNotFound: {
    description:
      'El paciente o la condición no existen para el nutricionista autenticado: inexistentes, de ' +
      'otro nutricionista, una condición de otro paciente o un id que no es UUID. La API no ' +
      'distingue los casos.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        examples: {
          condicion: { summary: 'Condición', value: errorExample('NOT_FOUND', 'Condición no encontrada') },
          paciente: { summary: 'Paciente', value: errorExample('NOT_FOUND', 'Paciente no encontrado') },
        },
      },
    },
  },

  PatientConditionConflict: {
    description:
      'El paciente ya tiene una condición del mismo tipo con el mismo alimento, grupo o patología. ' +
      'El campo del destino viene en `details.fields`.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: errorExample('CONFLICT', 'El paciente ya tiene registrada esta condición', {
          fields: { foodId: 'El paciente ya tiene registrada esta condición' },
        }),
      },
    },
  },

  ConsultationNotFound: {
    description:
      'El paciente o la consulta no existen para el nutricionista autenticado: inexistentes, de ' +
      'otro nutricionista, una consulta de otro paciente o un id que no es UUID. La API no ' +
      'distingue los casos.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        examples: {
          consulta: { summary: 'Consulta', value: errorExample('NOT_FOUND', 'Consulta no encontrada') },
          paciente: { summary: 'Paciente', value: errorExample('NOT_FOUND', 'Paciente no encontrado') },
        },
      },
    },
  },

  InternalError: {
    description:
      'Error inesperado del servidor. El mensaje es siempre el mismo: el detalle queda en el log ' +
      'del backend y nunca viaja en la respuesta.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: errorExample('INTERNAL_ERROR', 'Error interno del servidor'),
      },
    },
  },

  IaUnavailable: {
    description: 'El servicio de IA está caído, no respondió a tiempo o respondió con error.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        example: errorExample('IA_UNAVAILABLE', 'El servicio de IA no está disponible', { reason: 'timeout' }),
      },
    },
  },
};

const parameters = {
  CatalogId: {
    name: 'id',
    in: 'path',
    required: true,
    description: 'Id del ítem del catálogo. Un valor que no sea un UUID devuelve 404, no 400.',
    schema: { type: 'string', format: 'uuid' },
  },
  PatientId: {
    name: 'id',
    in: 'path',
    required: true,
    description: 'Id del paciente. Un valor que no sea un UUID devuelve 404, no 400.',
    schema: { type: 'string', format: 'uuid' },
  },
  ConditionId: {
    name: 'conditionId',
    in: 'path',
    required: true,
    description: 'Id de la condición. Un valor que no sea un UUID devuelve 404, no 400.',
    schema: { type: 'string', format: 'uuid' },
  },
  ConsultationId: {
    name: 'consultationId',
    in: 'path',
    required: true,
    description: 'Id de la consulta. Un valor que no sea un UUID devuelve 404, no 400.',
    schema: { type: 'string', format: 'uuid' },
  },
};

module.exports = { securitySchemes, schemas, responses, parameters };
