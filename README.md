# nutria-backend

Backend principal de **NutrIA**: API REST en Node.js + Express con Prisma sobre
PostgreSQL. Es el repo donde viven la lógica de negocio y el motor determinístico
de reglas clínicas, y además contiene el `docker-compose.yml` que levanta el stack
completo del proyecto.

El contrato de la API (endpoints, parámetros, formas de request y respuesta) se
consulta en la documentación interactiva: http://swagger.local.nutria.com con el
stack levantado. Qué cambió en cada iteración se registra en
[`CHANGELOG.md`](CHANGELOG.md). Ninguna de las dos cosas va en este README.

## Estructura de carpetas raíz del proyecto

Este repositorio es uno de los tres repos que componen NutrIA (`nutria-frontend`, `nutria-backend`, `nutria-ia`). Para que el `docker-compose.yml` de este repositorio pueda levantar el stack completo, los tres repositorios deben clonarse como carpetas **hermanas**, dentro de una misma carpeta raíz local:

```
nutria/
├── nutria-backend/   (este repositorio)
├── nutria-frontend/
└── nutria-ia/
```

El `docker-compose.yml` construye el frontend y el servicio de IA a partir de rutas relativas (`../nutria-frontend`, `../nutria-ia`), por lo que no funcionará si los repos se clonan en ubicaciones dispersas o con otros nombres de carpeta.

## Estructura interna del repositorio

Organizado por capas:

- `src/routes/` — definición de endpoints y su mapeo a controladores.
- `src/controllers/` — reciben la request y delegan en los servicios.
- `src/services/` — lógica de negocio.
- `src/repositories/` — acceso a datos vía Prisma.
- `src/schemas/` — schemas Zod de validación de entrada.
- `src/serializers/` — forma de las respuestas de la API.
- `src/middlewares/` — autenticación, manejo de errores, 404 y demás transversales.
- `src/docs/` — spec OpenAPI: se genera con `swagger-jsdoc` a partir de los bloques `@openapi` de `src/routes/`, más los componentes reutilizables (schemas, respuestas de error, esquema de seguridad).
- `src/lib/`, `src/utils/`, `src/config/` — cliente de Prisma, helpers y configuración/variables de entorno.
- `src/app.js` — configuración de la app de Express (middlewares y rutas).
- `src/server.js` — punto de entrada, levanta el servidor HTTP.
- `prisma/schema.prisma` — modelo de datos, y `prisma/migrations/` — historial de migraciones generado por el CLI.
- `scripts/seed.js` — carga de datos ficticios ejecutada por `prisma db seed`.
- `Dockerfile` — imagen del backend.
- `.github/workflows/ci.yml` — integración continua (ver "Integración continua").
- `docker-compose.yml` — orquesta el stack (proxy, frontend, backend, ia, postgres, pgadmin; más `psql` e `ia-test` bajo el perfil `tools`). El proyecto se nombra explícitamente `nutria` (campo `name:`) para que las imágenes y contenedores se llamen `nutria-frontend`, `nutria-backend`, `nutria-ia`, etc., en lugar de heredar el nombre de esta carpeta.

## Variables de entorno

Cada repositorio tiene su propio `.env.example`, sin valores reales. Antes de ejecutar, copiar a `.env`:

```bash
cp .env.example .env
cp ../nutria-frontend/.env.example ../nutria-frontend/.env
cp ../nutria-ia/.env.example ../nutria-ia/.env
```

Completar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `JWT_SECRET` con valores propios del entorno local. `CORS_ORIGIN` trae un valor por defecto (dominio de Docker Compose, puerto de Vite en local y dominio de la documentación interactiva) que alcanza para desarrollo; solo hace falta tocarlo si el frontend corre en otro origen. `IA_SERVICE_URL` es el hostname interno de Docker con el que el backend alcanza al servicio de IA; ningún navegador lo usa. `IA_TIMEOUT_MS` (opcional: si no se define vale 3000; el `.env.example` trae 5000) es cuánto espera el backend al servicio de IA antes de darlo por no disponible. Ninguno de los `.env` se versiona (están excluidos en el `.gitignore` de cada repo); solo se versiona el `.env.example` correspondiente.

No hay alta de usuarios por interfaz: los nutricionistas disponibles en local son
los dos que crea el seed, y sus credenciales viven en `scripts/seed.js` (no se
documentan acá ni en el changelog).

## Cómo ejecutar (sin Docker)

```bash
npm install
npm run dev
```

El servidor queda disponible en `http://localhost:3000`. Verificar que está corriendo con:

```bash
curl http://localhost:3000/health
```

## Cómo ejecutar todo el stack con Docker Compose

Con los tres repos clonados como hermanos y los `.env` completados:

```bash
npm run docker:up
# equivalente a: docker compose up --build
```

Esto levanta seis servicios: `proxy` (Traefik), `frontend`, `backend`, `ia`, `postgres` y `pgadmin`. El proxy resuelve peticiones por nombre de dominio en lugar de exponer un puerto distinto por servicio.

| Servicio   | Acceso                  | Descripción |
|------------|-------------------------|-------------|
| `frontend` | http://local.nutria.com     | React + Vite |
| `backend`  | http://api.local.nutria.com | API principal (este repo) |
| `ia`       | http://ia.local.nutria.com  | Servicio de IA (`/docs` para su Swagger propio, generado por FastAPI) |
| documentación | http://swagger.local.nutria.com | Swagger UI con los endpoints del `backend` y los del `ia` en un mismo lugar, con un selector arriba a la derecha para cambiar de servicio. La sirve el contenedor del `backend`, no es un servicio aparte, y no se monta cuando `NODE_ENV=production`. |
| `postgres` | localhost:5433 → 5432 en el contenedor | Imagen `pgvector/pgvector:pg16` (Postgres estándar; la extensión pgvector queda disponible pero no se activa en este incremento). No pasa por el proxy porque no es HTTP. |
| `pgadmin`  | http://db.local.nutria.com  | pgAdmin 4, sin login, con el servidor `NutrIA (local)` ya registrado a partir de las credenciales de `.env`. |

> El puerto host de `postgres` se publica en **5433** (no 5432) para no chocar con una instalación local de Postgres que ya pudiera estar corriendo en la máquina. La comunicación entre contenedores (`backend` → `postgres`) sigue usando el puerto interno 5432 y no se ve afectada.

### Configurar los virtual hosts

Los dominios `local.nutria.com`, `api.local.nutria.com`, `ia.local.nutria.com`, `swagger.local.nutria.com` y `db.local.nutria.com` no existen en DNS público: hay que resolverlos a `127.0.0.1` a mano, una sola vez por máquina de desarrollo.

**Windows** — editar `C:\Windows\System32\drivers\etc\hosts` con un editor abierto como administrador y agregar:

```
127.0.0.1 local.nutria.com
127.0.0.1 api.local.nutria.com
127.0.0.1 ia.local.nutria.com
127.0.0.1 swagger.local.nutria.com
127.0.0.1 db.local.nutria.com
```

**Linux/macOS** — agregar las mismas líneas a `/etc/hosts` (`sudo nano /etc/hosts`).

Con eso, y el stack levantado, `http://local.nutria.com` sirve el frontend, que a su vez llama a `http://api.local.nutria.com` (configurado en `VITE_API_URL`).

Para bajar el stack: `npm run docker:down` (equivalente a `docker compose down`).

## Scripts disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| `npm run dev` | `node --watch src/server.js` | Levanta el backend localmente, sin Docker. |
| `npm run start` | `node src/server.js` | Arranca el server sin watch (es lo que corre en el contenedor). |
| `npm run docker:up` | `docker compose up --build` | Levanta el stack completo. |
| `npm run docker:down` | `docker compose down` | Detiene y elimina los contenedores del stack. |
| `npm run migrate` | `prisma migrate dev` | Aplica `prisma/schema.prisma` a la base, creando una migración si hay cambios pendientes. Requiere Postgres corriendo (`docker compose up -d postgres`) y `DATABASE_URL` apuntando a `localhost:5433`. |
| `npm run migrate:deploy` | `prisma migrate deploy` | Aplica migraciones ya generadas, sin crear nuevas (uso en CI/producción). |
| `npm run seed` | `prisma db seed` | Ejecuta `scripts/seed.js` (datos ficticios). |
| `npm run studio` | `prisma studio` | Abre Prisma Studio para inspeccionar los datos. |
| `npm run test` | `vitest run` | Corre la suite de tests una vez. |
| `npm run test:watch` | `vitest` | Modo watch, para iterar mientras se escribe un test. |
| `npm run test:coverage` | `vitest run --coverage` | Tests + reporte de cobertura (terminal, `coverage/index.html` y `coverage/lcov.info`). |

### Correrlos dentro del contenedor

Invocados con el Node del host, los scripts de arriba sirven para iterar. La
ejecución que vale como verificación es la que corre dentro del contenedor, con
los mismos scripts lanzados por Compose. `--build` rebuildea con cache antes de
ejecutar, así que un test o un cambio de código nuevo se toma sin ningún paso
manual previo:

```bash
# Tests
docker compose run --build --rm --no-deps backend npm run test

# Tests + cobertura (el -v deja el reporte en ./coverage del host)
docker compose run --build --rm --no-deps -v ./coverage:/app/coverage backend npm run test:coverage

# Migraciones: aplicar las pendientes
docker compose up -d --wait postgres
docker compose run --build --rm --no-deps backend npx prisma migrate deploy

# Migraciones: generar una nueva (el -v deja el archivo generado en ./prisma del host)
docker compose run --build --rm --no-deps -v ./prisma:/app/prisma backend npx prisma migrate dev --name <verbo_entidad_cambio>

# Seed
docker compose run --build --rm --no-deps backend npm run seed
```

`docker compose up` deja además las migraciones al día por sí solo: el `CMD` de la
imagen del backend corre `prisma migrate deploy` antes de levantar el server, así
que un pull que trae una migración nueva no necesita ningún paso aparte.

## Integración continua

`.github/workflows/ci.yml` corre en cada PR hacia `development` o `master`, en cada
push a `development` y a mano desde la pestaña Actions (`workflow_dispatch`). El job
se llama `ci` y es el check obligatorio del ruleset de `development` y `master`: un
PR no se puede mergear con ese check en rojo.

No usa secrets ni variables de GitHub. Levanta un Postgres `pgvector/pgvector:pg16`
vacío como servicio, con credenciales efímeras escritas en el workflow, y
`JWT_SECRET` para los tests lo fija `vitest.config.js`.

Cada paso, y cómo reproducirlo en local (desde esta carpeta, con el stack de
Compose; o con el script equivalente desde la carpeta raíz `nutria/`):

| Paso de la CI | En local |
|---|---|
| `npm ci` | Lo hace el build de la imagen (`docker compose build backend`). |
| `npx prisma validate` | `docker compose run --build --rm --no-deps backend npx prisma validate` |
| `npx prisma migrate deploy` sobre base vacía | `npm run db:reset` desde `nutria/`. **Borra la base local**: aplica todas las migraciones desde cero y corre el seed. |
| `npm run seed` | Incluido en `db:reset`; sobre una base existente, `npm run db:seed` desde `nutria/`. |
| `npm test` | `npm run test:backend` desde `nutria/`. |
| `npm audit --audit-level=high` | `docker compose run --build --rm --no-deps backend npm audit --audit-level=high` |
| `docker build` (sin push) | `docker compose build backend` |

## Stack

- Node.js + Express
- Prisma
- PostgreSQL (`pgvector/pgvector:pg16`)
- Vitest
- Docker / Docker Compose

## Repositorios relacionados

- `nutria-frontend` — interfaz web (React + Vite).
- `nutria-ia` — servicio de generación asistida (Python + FastAPI).
