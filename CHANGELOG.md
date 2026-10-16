# Changelog — nutria-backend

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y [Semantic Versioning](https://semver.org/lang/es/).

## Unreleased

### Added

- Modelo de datos del Incremento 2 (T14), en la migración `20261014203321_agrega_datos_clinicos_consultas_y_catalogos`. `schema.prisma` pasa a ser el modelo lógico vigente de los Incrementos 1 y 2. Lo que se agrega:
  - **Paciente**, con todas las columnas nuevas opcionales (RNF-03, RNF-09): antecedentes y medicación (RF-04); tratamiento externo (RF-05); hábitos en cinco campos (actividad física, tabaco, alcohol, horarios de comida y de sueño, RF-06); contexto de cocina, con `cooks` agregado al Anexo A (RF-08); comidas y equipamiento fuera del hogar (RF-09); ocupación y contexto laboral (RF-10); patrones de ingesta (RF-14).
  - **Pacientes y consultas**: `pathology`, `patient_condition`, `consultation`, `measurement` (antropometría y laboratorio en una sola tabla, con `detail` para precisar el tipo) y `prescribed_habit` (consulta que lo establece y consulta que lo evalúa).
  - **Catálogos**: `food_group` (jerárquico), `food`, `food_category`, `recipe` (con `nutritionist_id`, RNF-05), `recipe_ingredient`, `recipe_meal_type` y `clinical_recommendation`. Alimentos, grupos, patologías y recomendaciones son comunes a todos los nutricionistas. `recipe.plan_origen_id` llega en el Incremento 3.
  - Valores de enum en inglés (`pathology`, `follow_up`, `skinfold`, `afternoon_snack`, etc.).
  - Restricciones `CHECK` en el SQL de la migración: alimento y grupo excluyentes en una condición; `pathology_id` si y solo si el tipo es `pathology`; las condiciones que no son patología referencian un alimento o un grupo; `detail` obligatorio para `skinfold`, `circumference` y `other`; `value > 0`; un hábito no se evalúa en la misma consulta que lo pauta; un grupo no es su propio padre; `time_minutes > 0`.
  - Correspondencia completa con el Anexo A y el porqué de cada ajuste: `docs/decisiones/ajustes-al-modelo-del-anexo-a-incremento-2.md` y `docs/decisiones/catalogos-comunes-entre-nutricionistas.md` en el repo raíz.
- `src/schemas/patientCondition.schema.js` y `src/schemas/measurement.schema.js`, con sus tests: validan en la aplicación las mismas reglas que los `CHECK`, para que los endpoints de esos módulos respondan `400` con el campo puntual. Todavía no están montados en ninguna ruta.
- Seed (`scripts/seed.js` + `scripts/seed-data/catalogs.js`), solo con datos ficticios: 15 grupos de alimentos en dos niveles, 31 alimentos con sus categorías y las patologías de los casos de prueba (celiaquía, diabetes, hipertensión), cargados con `upsert` por nombre. Los pacientes existentes ahora tienen condiciones, consultas con mediciones y laboratorio, hábitos pautados y evaluados, y mediciones cargadas fuera de una consulta. Cada nutricionista tiene una receta propia. No se cargan recomendaciones clínicas, porque serían contenido clínico real.

- Catálogos (T15; RF-04 patologías, RF-24, RF-25). Todas las rutas piden token.
  - **Grupos y patologías:** `GET /food-groups`, `GET /food-groups/:id`, `GET /pathologies` y `GET /pathologies/:id`. Son comunes a todos los nutricionistas y de solo lectura.
  - **Alimentos:** `GET /foods`, `GET /foods/:id` y `POST /foods`.
    - El nutricionista ve los alimentos comunes y los suyos privados. Los privados de otro nunca aparecen, y pedir uno por id da `404`, igual que uno inexistente.
    - `POST /foods` crea siempre un alimento privado, con el dueño tomado del token. Un `nutritionistId` en el body da `400`.
    - Una o más categorías nutricionales, sin repetir. Un array vacío, un valor desconocido o un repetido dan `400` en `details.fields.categories`. Un grupo inexistente da `400` en `foodGroupId`.
    - **Nombre:** no puede repetir uno común ni uno propio, sin distinguir mayúsculas ("leche" choca con "Leche"). Responde `409 CONFLICT` con el campo en `details.fields.name`.
      - Dos nutricionistas sí pueden tener cada uno su privado con el mismo nombre.
      - Los espacios de más se normalizan antes de guardar.
      - No ignora acentos: "Cafe" y "Café" son nombres distintos.
    - `GET /foods` acepta `search` (parte del nombre) y `groupId`, que incluye los subgrupos. Solo devuelve los vigentes.
  - **Nadie edita ni da de baja desde la cuenta de un nutricionista:**
    - No hay `PUT` ni `DELETE`, ni alta de grupos o patologías.
    - Esas operaciones, y la baja lógica (`active = false`), son del rol administrador, que se implementa en una tarea aparte. Hasta entonces, el catálogo común se corrige por seed o por migración.
    - La base tampoco deja borrar un alimento en uso: las FK de condiciones e ingredientes son `RESTRICT`.
  - **Jerarquía sin ciclos:** `src/utils/foodGroupTree.js` (`wouldCreateCycle`, `descendantIds`) deja lista la regla para el alta y la edición de grupos del administrador. Hoy la usa el filtro por grupo.
  - El repositorio de alimentos corta cualquier consulta o alta sin nutricionista, como `patient.repository`. Con el filtro vacío, Prisma devolvería los privados de todos.
  - Documentados en Swagger, bajo el tag "Catálogos".
- Migración `20261015180000_agrega_alimentos_privados_y_nombres_sin_mayusculas`:
  - Agrega `food.nutritionist_id` (FK a `nutritionist`, nullable): `NULL` es común y con valor es privado de ese nutricionista.
  - El único de `food.name` pasa a ser `(nutritionist_id, name)`. El servicio chequea el cruce con los comunes, porque Postgres trata los `NULL` como distintos.
  - `name` pasa a `citext` en `food`, `food_group` y `pathology`. La extensión se crea a mano al principio del `migration.sql`, y Prisma no la detecta como drift.
  - **Si el backend está levantado mientras se aplica esta migración o se corre `npm run db:reset`, hay que reiniciarlo** (`docker restart nutria-backend-1`). Prisma cachea los tipos de la base y, hasta reiniciar, responde `500` ("cache lookup failed for type…"). `npm run up` no tiene el problema, porque migra antes de arrancar.
- Seed:
  - Los alimentos comunes se cargan buscando por nombre entre los comunes, porque ya no hay un único por nombre solo.
  - Se agrega un alimento privado de ejemplo ("Kéfir") para `nutricionista@nutria.com`, para verificar a mano que el otro nutricionista no lo ve.
- Tests de T15:
  - Categorías válidas.
  - Jerarquía sin ciclos.
  - Nombre duplicado → `CONFLICT`, también entre un privado y un común.
  - Aislamiento de los alimentos privados en servicio, repositorio y rutas.
  - Que el servicio no exponga edición ni borrado.
  - De punta a punta:
    - `401` sin token en las 7 rutas.
    - El nutricionista del token llega hasta el servicio.
    - `404` en las rutas de edición y borrado, que no existen.
- Pendientes:
  - Para el Incremento 3, la composición esperada por tipo de comida (RF-26) se recortó de T15. La consume el motor de reglas, y desayuno y merienda dependen de la entrevista de validación.
  - El ítem del plan del Incremento 3 tiene que guardar una copia del alimento (nombre y categorías) además de su id, para que una corrección posterior del catálogo no altere un plan ya emitido.

### Changed

- `GET /patients` y `GET /patients/:id` devuelven también las columnas nuevas del paciente (T14), en `null` cuando no hay dato, porque el serializer expone el registro completo. `POST` y `PUT` todavía no las aceptan (schema `.strict()`): se suman con la tarea del módulo de ficha clínica. El schema `Patient` del spec OpenAPI las documenta; `PatientInput` no cambia.
- `optionalField` y el parseo de fechas `AAAA-MM-DD` (`pastOrTodayDate`) pasan de `patient.schema.js` a `common.schema.js`, para reutilizarlos. Los mensajes de `birthDate` no cambian.

### Fixed

- Antes, cualquier cambio en `prisma/` (el schema, una migración nueva o un `migration.sql` editado) hacía que la imagen del backend reinstalara todas las dependencias, y cada `test:backend`, `db:*` o `up` tardaba unos 5 minutos. Pasaba porque el `Dockerfile` copiaba `prisma/` antes del `npm install`. Ahora instala primero y genera el cliente después, en un `RUN npx prisma generate` propio. Así, un cambio de schema solo repite ese paso (segundos), y `npm install` corre únicamente cuando cambian `package.json` o `package-lock.json`, como ya decía el README de la raíz.

## [0.0.1] - 2026-09-30

Incremento 1: tareas T1 a T8 y las de soporte (ver `docs/cierre-incremento-1.md` en el repo raíz).

### Added

- `GET /health/ia` (T7), público: prueba de comunicación backend → servicio de IA. El backend pide el `/health` de `nutria-ia` por la red interna y devuelve `{ status, service, ia: { status, service, latencyMs }, timestamp }`. Si el servicio de IA está caído, no responde dentro de `IA_TIMEOUT_MS` (variable nueva, 3000 ms por defecto) o responde con error, el backend contesta `503` con `code: IA_UNAVAILABLE` y el motivo en `details.reason` (`timeout`, `unreachable`, `bad_status`, `bad_body`), sin colgar la request ni caerse. Toda llamada del backend a la IA pasa por `src/clients/ia.client.js`, que es donde se va a adjuntar el identity token en el Incremento 3.
- Middleware `validate` (`src/middlewares/validate.js`, T7): cada endpoint declara en la ruta los schemas Zod de `params`, `query` y `body`, y el controlador lee los datos ya parseados de `req.validated`. Las rutas sin parámetros de query rechazan uno desconocido con `400`. En `/patients/:id` un id que no es UUID sigue respondiendo `404`, igual que un paciente inexistente o de otro nutricionista.
- `process.on('unhandledRejection')` en `src/server.js`: una promesa rechazada fuera de una request se loguea en vez de terminar el proceso.
- Tests de T7: `errorHandler` (formato, 500 sin stack ni mensaje interno, JSON inválido, errores de Prisma, `headersSent`), `validate`, cliente de IA (timeout, caído, status y cuerpo inválidos), `health.service`, y `src/app.test.js`, que levanta la app real en un puerto efímero sin base y verifica de punta a punta que cada fallo (ruta inexistente, JSON inválido, validación, sin token, id inválido, IA caída) responde con el formato uniforme y sin stack.
- Documentación interactiva de la API con Swagger, en `http://swagger.local.nutria.com` (host nuevo, hay que agregarlo al archivo `hosts`; también accesible como `/docs` de `api.local.nutria.com`). Una sola UI con un selector que ofrece **dos definiciones**: la de este backend y la de `nutria-ia`. Los specs no se fusionan — cada servicio sigue siendo dueño del suyo y no hay nada que sincronizar a mano — y ambos siguen teniendo su documentación propia. El spec del backend lo genera `swagger-jsdoc` a partir de los bloques `@openapi` de `src/routes/*.routes.js`, con los componentes reutilizables (schemas `Patient`, `PatientInput`, `LoginRequest`/`LoginResponse`, `Health`, `IaHealth`, `Error`; respuestas de 400/401/404/500/503; esquema `bearerAuth`) en `src/docs/components.js`, y se sirve crudo en `/docs.json`. Cubre los siete endpoints implementados: `GET /health`, `GET /health/ia`, `POST /auth/login`, y los cuatro de `/patients`. Quedan documentadas las asimetrías reales del contrato en vez de una versión idealizada: `birthDate` entra como `AAAA-MM-DD` y sale como fecha-hora ISO, `age` es calculada y no una columna, y un id que no es UUID da `404` y no `400`.
- `GET /docs/ia.json` y reenvío en `/docs/ia/*`: todo lo que la documentación necesita del servicio de IA pasa por el backend. El spec se pide por la red interna de Docker (`IA_SERVICE_URL`) y se devuelve con un campo `servers` relativo apuntando al reenvío — FastAPI no declara `servers`, y sin eso el "Try it out" de IA le pegaría al `/health` del backend devolviendo `200` con los datos equivocados. Las llamadas que dispara la UI se reenvían con su status y su cuerpo intactos, para que un `422` de validación de FastAPI llegue con su forma original en vez de traducido al formato de error del backend. Con el servicio caído se responde `502` explícito (timeout de 3 s para el spec, 30 s para las llamadas) y la definición del backend se sigue viendo. Existe solo en desarrollo, porque todo el router de documentación se monta únicamente cuando `NODE_ENV` no es `production`.
- Los `servers` del spec del backend arrancan con una URL relativa (`/`). Junto con el reenvío de IA, eso hace que **todo lo que dispara la documentación salga contra el mismo origen que la sirve**, así que no hizo falta sumar el dominio de la documentación a ningún `CORS_ORIGIN` ni agregarle CORS a `nutria-ia`: ese servicio no lo llama ningún navegador y no tiene por qué saber que esta documentación existe. Las URLs absolutas quedan como opciones adicionales del selector, para quien lea el spec fuera de la UI.
- `POST /patients` y `PUT /patients/:id`, protegidos por `requireAuth`. Schema Zod compartido entre alta y edición (`src/schemas/patient.schema.js`): solo `firstName`/`lastName` obligatorios, resto admite guardado parcial (vacíos normalizados a `null`), y exige los cuatro datos del adulto responsable (`guardianName`, `guardianRelationship`, `guardianContact`, `attendsAccompanied`) cuando `birthDate` indica un paciente menor de 18 (`src/utils/age.js`, comparación en UTC). `nutritionistId` sale siempre de `req.nutricionistaId`, nunca del body (schema `.strict()`, lo rechaza si viene). Al editar, `dataCompletedAt` se setea solo en la transición de ficha incompleta a completa; se conserva en cualquier otra transición.
- `src/serializers/patient.serializer.js`: aplica a las cuatro rutas de pacientes. Omite `nutritionistId` de la respuesta (es siempre el del propio nutricionista autenticado), castea `referenceWeight` a `number` (Prisma lo devuelve como string por ser `Decimal`) y agrega `age` calculada a partir de `birthDate` (`null` si no hay fecha cargada).
- `GET /patients` ahora ordena por `updatedAt desc`.
- Endpoint de salud (`/health`) con su controlador y servicio.
- Prisma como ORM: `prisma/schema.prisma`, migraciones y `scripts/seed.js` para datos de prueba (nutricionista + pacientes ficticios).
- `POST /auth/login`: valida credenciales contra el hash bcrypt del nutricionista y devuelve un JWT. Validación del body con Zod (`src/schemas/auth.schema.js`); credenciales inválidas (email inexistente o contraseña incorrecta) devuelven siempre el mismo `401` genérico, sin revelar cuál de las dos falló (comparación contra un hash dummy incluso cuando el email no existe, para no filtrar por timing).
- Middleware `requireAuth`: exige `Authorization: Bearer <token>` en las rutas protegidas e inyecta `req.nutricionistaId` a partir del token verificado (nunca de un id recibido del cliente).
- `GET /patients` y `GET /patients/:id`, protegidos por `requireAuth`, con capa de servicio propia (`src/services/patient.service.js`): filtran siempre por el nutricionista autenticado; un paciente de otro nutricionista (o un id con formato inválido) responde `404`, indistinguible de "no existe".
- CORS (`cors`) habilitado para que el frontend (`local.nutria.com` en Docker, `localhost:5173` en dev sin Docker) pueda llamar a la API desde otro origen; orígenes configurables por `CORS_ORIGIN`.
- Tests del spec (`src/docs/openapi.test.js`, `src/routes/docs.routes.test.js`): las fallas de `swagger-jsdoc` son silenciosas (un bloque YAML mal indentado borra la operación del spec sin error, un `$ref` con typo rompe la UI recién al abrirla), así que se verifica que estén exactamente las siete operaciones esperadas, que las cuatro de `/patients` exijan token y documenten el `401`, que el alta figure como `201`, y que ningún `$ref` quede colgado. También que la documentación no se monte con `NODE_ENV=production` (ni sus rutas ni el reenvío), que el spec de IA se pida por la red interna y se le pise el `servers` con el relativo, y que el reenvío conserve ruta, body y status de error del servicio de IA y devuelva `502` si no responde.
- Suite de tests con Vitest (`src/services/*.test.js`, `src/schemas/*.test.js`, `src/serializers/*.test.js`, `src/utils/*.test.js`, `src/middlewares/auth.test.js`): login con credenciales válidas/inválidas sin fuga de cuál falló, aislamiento por nutricionista en alta/edición/lectura de pacientes (un id real de otro nutricionista nunca aplica el cambio ni devuelve datos), validación del responsable para menores, transición de `dataCompletedAt`, y el middleware de auth (sin token, token inválido/expirado, inyección correcta de `nutricionistaId`). Repositorios fake en memoria, no tocan Postgres. `npm run test:coverage` genera reporte de cobertura.

### Changed

- **Cambio de contrato (T7):** el formato de error pasa de `{ error, fields? }` a `{ error: { code, message, details? } }` en toda la API, incluidos el `404` de ruta inexistente (que antes era `{ error, path }`) y el `400` de login (que antes no traía detalle por campo). `code` es estable (`VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `IA_UNAVAILABLE`, etc.) y el mapa campo → mensaje de los errores de validación pasa a `details.fields`. Ver `docs/decisiones/formato-de-error-uniforme.md` en el repo raíz.
- `errorHandler` centralizado: un error no reconocido responde `500` con el mensaje fijo "Error interno del servidor" (el detalle y el stack solo van al log), un body que no es JSON responde `400 INVALID_JSON` en vez de filtrar el mensaje del parser, una violación de unicidad de Prisma (`P2002`) responde `409`, un registro inexistente (`P2025`) `404`, y la base caída `503`.
- Mensajes de error en castellano: `Not found` → `Paciente no encontrado` / `Ruta no encontrada`.
- `AppError` recibe `{ code, details }` como tercer argumento (antes, `fields`); el código por defecto sale del status.
- Spec OpenAPI actualizado: schema `Error` con la forma nueva, respuestas `InternalError` e `IaUnavailable`, schema `IaHealth`, y el `400` de login referenciando `ValidationError`. Se elimina `NotFoundError`.
- Se actualizan las credenciales de prueba sembradas por `scripts/seed.js` (ver el script para los valores vigentes).
- `requireAuth` rechaza con `401` un token bien firmado que no trae `sub`: antes dejaba `req.nutricionistaId` vacío.
- `patient.repository` corta con un error (`500`) cualquier consulta que llegue sin `nutritionistId`. Prisma ignora los filtros `undefined`, así que un error de cableado (una ruta sin `requireAuth`) habría devuelto o editado pacientes de cualquier nutricionista.
- Tests de seguridad agregados: las cuatro rutas de pacientes responden `401` sin token y no llegan al servicio; cada ruta pasa al servicio el nutricionista del token; un `nutritionistId` en el body se rechaza en alta y edición; la respuesta no expone `nutritionistId`; un token firmado con otro secreto o sin `sub` se rechaza; el repositorio no consulta a Prisma con `nutritionistId` vacío. Verificado que sacar `requireAuth` de una ruta hace fallar la suite.
- `scripts/seed.js` crea dos nutricionistas, cada uno con pacientes propios (el segundo con dos pacientes nuevos), para verificar a mano el aislamiento entre nutricionistas. Cada ejecución reemplaza los pacientes de ambos.
- `docker-compose.yml` y variables de entorno actualizadas para levantar Postgres (`pgvector/pgvector:pg16`) junto al resto del stack.
- `postgres` con healthcheck (`pg_isready`); `backend` espera a que esté `service_healthy` antes de arrancar, en vez de solo a que el contenedor exista.
- El `CMD` del contenedor del backend corre `prisma migrate deploy` antes de levantar el server: el stack queda con las migraciones al día al hacer `up`, sin un paso manual aparte.

### Fixed

- El `Dockerfile` no copiaba `prisma/` a la imagen: `prisma generate` no tenía el schema contra el que generar, así que el cliente de Prisma nunca se generaba dentro del contenedor.
- `birthDate` aceptaba fechas inexistentes (`2023-02-30` se guardaba como `2023-03-02`, por el desborde de días de `Date`) y fechas futuras (que daban edad negativa y podían disparar la exigencia de datos del adulto responsable). Ambos casos ahora responden `400` en `details.fields.birthDate`.

## Versiones

Cada incremento cerrado es una versión. Al cerrar el incremento en curso, el contenido de "Unreleased" pasa a una entrada `## [X.Y.Z] - AAAA-MM-DD` nueva, arriba de la anterior, y "Unreleased" queda vacío para lo que siga. Las versiones siguen el versionado semántico.
