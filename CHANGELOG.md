# Changelog — nutria-backend

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y [Semantic Versioning](https://semver.org/lang/es/).

## Unreleased

### Added

- Endpoint de salud (`/health`) con su controlador y servicio.
- Prisma como ORM: `prisma/schema.prisma`, migraciones y `scripts/seed.js` para datos de prueba (nutricionista + pacientes ficticios).
- `POST /auth/login`: valida credenciales contra el hash bcrypt del nutricionista y devuelve un JWT.
- Middleware `requireAuth`: exige `Authorization: Bearer <token>` en las rutas protegidas e inyecta `req.nutricionistaId` a partir del token verificado.

### Changed

- `GET /patients` y `GET /patients/:id` ahora filtran siempre por el nutricionista autenticado (nunca por un id recibido del cliente); un paciente de otro nutricionista responde `404`.
- Se actualizan las credenciales de prueba sembradas por `scripts/seed.js` (ver el script para los valores vigentes).
- `docker-compose.yml` y variables de entorno actualizadas para levantar Postgres (`pgvector/pgvector:pg16`) junto al resto del stack.

### Fixed

## Tags

Sin versiones publicadas todavía. Cuando cierre la iteración actual, sus cambios pasarán de "Unreleased" a una entrada `## [0.1] - AAAA-MM-DD` (siguiendo versionado semántico) en esta sección.
