# Changelog — nutria-backend

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y [Semantic Versioning](https://semver.org/lang/es/).

## Unreleased

### Added

- `POST /patients` y `PUT /patients/:id`, protegidos por `requireAuth`. Schema Zod compartido entre alta y edición (`src/schemas/patient.schema.js`): solo `firstName`/`lastName` obligatorios, resto admite guardado parcial (vacíos normalizados a `null`), y exige los cuatro datos del adulto responsable (`guardianName`, `guardianRelationship`, `guardianContact`, `attendsAccompanied`) cuando `birthDate` indica un paciente menor de 18 (`src/utils/age.js`, comparación en UTC). `nutritionistId` sale siempre de `req.nutricionistaId`, nunca del body (schema `.strict()`, lo rechaza si viene). Al editar, `dataCompletedAt` se setea solo en la transición de ficha incompleta a completa; se conserva en cualquier otra transición.
- Formato de error extendido: `{ error, fields? }`. `fields` es opcional y solo aparece en errores de validación (400), mapeando nombre de campo a su mensaje — permite al frontend mostrar el error junto al input que falló.
- `src/serializers/patient.serializer.js`: aplica a las cuatro rutas de pacientes. Omite `nutritionistId` de la respuesta (es siempre el del propio nutricionista autenticado), castea `referenceWeight` a `number` (Prisma lo devuelve como string por ser `Decimal`) y agrega `age` calculada a partir de `birthDate` (`null` si no hay fecha cargada).
- `GET /patients` ahora ordena por `updatedAt desc`.
- Endpoint de salud (`/health`) con su controlador y servicio.
- Prisma como ORM: `prisma/schema.prisma`, migraciones y `scripts/seed.js` para datos de prueba (nutricionista + pacientes ficticios).
- `POST /auth/login`: valida credenciales contra el hash bcrypt del nutricionista y devuelve un JWT. Validación del body con Zod (`src/schemas/auth.schema.js`); credenciales inválidas (email inexistente o contraseña incorrecta) devuelven siempre el mismo `401` genérico, sin revelar cuál de las dos falló (comparación contra un hash dummy incluso cuando el email no existe, para no filtrar por timing).
- Middleware `requireAuth`: exige `Authorization: Bearer <token>` en las rutas protegidas e inyecta `req.nutricionistaId` a partir del token verificado (nunca de un id recibido del cliente).
- `GET /patients` y `GET /patients/:id`, protegidos por `requireAuth`, con capa de servicio propia (`src/services/patient.service.js`): filtran siempre por el nutricionista autenticado; un paciente de otro nutricionista (o un id con formato inválido) responde `404`, indistinguible de "no existe".
- CORS (`cors`) habilitado para que el frontend (`local.nutria.com` en Docker, `localhost:5173` en dev sin Docker) pueda llamar a la API desde otro origen; orígenes configurables por `CORS_ORIGIN`.
- Suite de tests con Vitest (`src/services/*.test.js`, `src/schemas/*.test.js`, `src/serializers/*.test.js`, `src/utils/*.test.js`, `src/middlewares/auth.test.js`): login con credenciales válidas/inválidas sin fuga de cuál falló, aislamiento por nutricionista en alta/edición/lectura de pacientes (un id real de otro nutricionista nunca aplica el cambio ni devuelve datos), validación del responsable para menores, transición de `dataCompletedAt`, y el middleware de auth (sin token, token inválido/expirado, inyección correcta de `nutricionistaId`). Repositorios fake en memoria, no tocan Postgres. `npm run test:coverage` genera reporte de cobertura.

### Changed

- Se actualizan las credenciales de prueba sembradas por `scripts/seed.js` (ver el script para los valores vigentes).
- `docker-compose.yml` y variables de entorno actualizadas para levantar Postgres (`pgvector/pgvector:pg16`) junto al resto del stack.
- `postgres` con healthcheck (`pg_isready`); `backend` espera a que esté `service_healthy` antes de arrancar, en vez de solo a que el contenedor exista.
- El `CMD` del contenedor del backend corre `prisma migrate deploy` antes de levantar el server: el stack queda con las migraciones al día al hacer `up`, sin un paso manual aparte.

### Fixed

- El `Dockerfile` no copiaba `prisma/` a la imagen: `prisma generate` no tenía el schema contra el que generar, así que el cliente de Prisma nunca se generaba dentro del contenedor.

## Tags

Sin versiones publicadas todavía. Cuando cierre la iteración actual, sus cambios pasarán de "Unreleased" a una entrada `## [0.1] - AAAA-MM-DD` (siguiendo versionado semántico) en esta sección.
