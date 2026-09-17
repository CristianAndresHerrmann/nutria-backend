# nutria-backend

Backend principal de **NutrIA**. Implementado en Node.js + Express, expone la API REST del sistema y concentra la autenticación, la gestión de pacientes y consultas, el motor determinístico de validación de reglas clínicas, la generación de documentos PDF y la coordinación con el servicio de inteligencia artificial (`nutria-ia`).

## Estructura de carpetas raíz del proyecto

Este repositorio es uno de los tres repos que componen NutrIA (`nutria-frontend`, `nutria-backend`, `nutria-ia`). Para que el `docker-compose.yml` de este repositorio pueda levantar el stack completo, los tres repositorios deben clonarse como carpetas **hermanas**, dentro de una misma carpeta raíz local:

```
NutrIA/
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
- `src/repositories/` — acceso a datos (placeholder hasta integrar la base de datos).
- `src/middlewares/` — manejo de errores, 404, y middlewares transversales.
- `src/config/` — configuración y variables de entorno.
- `src/app.js` — configuración de la app de Express (middlewares y rutas).
- `src/server.js` — punto de entrada, levanta el servidor HTTP.
- `prisma/schema.prisma` — modelo de datos (Prisma) y `prisma/migrations/` — historial de migraciones generado por el CLI.
- `scripts/seed.js` — carga de datos ficticios ejecutada por `prisma db seed`.
- `Dockerfile` — imagen del backend.
- `docker-compose.yml` — orquesta el stack (proxy, frontend, backend, ia, postgres). El proyecto se nombra explícitamente `nutria` (campo `name:`) para que las imágenes y contenedores se llamen `nutria-frontend`, `nutria-backend`, `nutria-ia`, etc., en lugar de heredar el nombre de esta carpeta.

## Variables de entorno

Cada repositorio tiene su propio `.env.example`, sin valores reales. Antes de ejecutar, copiar a `.env`:

```bash
cp .env.example .env
cp ../nutria-frontend/.env.example ../nutria-frontend/.env
cp ../nutria-ia/.env.example ../nutria-ia/.env
```

Completar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `JWT_SECRET` con valores propios del entorno local. `CORS_ORIGIN` trae un valor por defecto (dominio de Docker Compose + puerto de Vite en local) que alcanza para desarrollo; solo hace falta tocarlo si el frontend corre en otro origen. Ninguno de los `.env` se versiona (están excluidos en el `.gitignore` de cada repo); solo se versiona el `.env.example` correspondiente.

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

Esto levanta cinco servicios: `proxy` (Traefik), `frontend`, `backend`, `ia` y `postgres`. El proxy resuelve peticiones por nombre de dominio en lugar de exponer un puerto distinto por servicio.

| Servicio   | Acceso                  | Descripción |
|------------|-------------------------|-------------|
| `frontend` | http://local.nutria.com     | React + Vite |
| `backend`  | http://api.local.nutria.com | API principal (este repo) |
| `ia`       | http://ia.local.nutria.com  | Servicio de IA (`/docs` para Swagger) |
| `postgres` | localhost:5433 → 5432 en el contenedor | Imagen `pgvector/pgvector:pg16` (Postgres estándar; la extensión pgvector queda disponible pero no se activa en este incremento). No pasa por el proxy porque no es HTTP. |

> El puerto host de `postgres` se publica en **5433** (no 5432) para no chocar con una instalación local de Postgres que ya pudiera estar corriendo en la máquina. La comunicación entre contenedores (`backend` → `postgres`) sigue usando el puerto interno 5432 y no se ve afectada.

### Configurar los virtual hosts

Los dominios `local.nutria.com`, `api.local.nutria.com` e `ia.local.nutria.com` no existen en DNS público: hay que resolverlos a `127.0.0.1` a mano, una sola vez por máquina de desarrollo.

**Windows** — editar `C:\Windows\System32\drivers\etc\hosts` con un editor abierto como administrador y agregar:

```
127.0.0.1 local.nutria.com
127.0.0.1 api.local.nutria.com
127.0.0.1 ia.local.nutria.com
```

**Linux/macOS** — agregar las mismas líneas a `/etc/hosts` (`sudo nano /etc/hosts`).

Con eso, y el stack levantado, `http://local.nutria.com` sirve el frontend, que a su vez llama a `http://api.local.nutria.com` (configurado en `VITE_API_URL`).

Para bajar el stack: `npm run docker:down` (equivalente a `docker compose down`).

## Scripts disponibles

> La forma oficial de correr tests, migraciones y seed es desde la raíz `nutria/`
> con los comandos de su `README.md` (`npm run test:backend`, `npm run db:migrate`,
> `npm run db:seed`, ...), que ejecutan estos mismos scripts dentro del contenedor.
> Los de abajo quedan documentados para iterar en local.

| Script | Comando | Descripción |
|--------|---------|-------------|
| `npm run dev` | `node --watch src/server.js` | Levanta el backend localmente, sin Docker. |
| `npm run docker:up` | `docker compose up --build` | Levanta los cuatro servicios del stack. |
| `npm run docker:down` | `docker compose down` | Detiene y elimina los contenedores del stack. |
| `npm run migrate` | `prisma migrate dev` | Aplica el esquema de `prisma/schema.prisma` a la base de datos, creando una migración si hay cambios pendientes. Requiere Postgres corriendo (`docker compose up -d postgres`) y `DATABASE_URL` apuntando a `localhost:5433`. |
| `npm run migrate:deploy` | `prisma migrate deploy` | Aplica migraciones ya generadas, sin crear nuevas (uso en CI/producción). |
| `npm run seed` | `prisma db seed` | Ejecuta `scripts/seed.js`: crea un nutricionista y pacientes ficticios (uno menor de edad, uno con registro incompleto). |
| `npm run studio` | `prisma studio` | Abre Prisma Studio para inspeccionar los datos. |
| `npm run test` | `vitest run` | Corre la suite de tests una vez. **No correrlo directo en el host:** la forma oficial es `npm run test:backend` desde la raíz `nutria/`, que lo ejecuta dentro del contenedor. |
| `npm run test:watch` | `vitest` | Modo watch, para iterar mientras se escribe un test. |
| `npm run test:coverage` | `vitest run --coverage` | Tests + reporte de cobertura (terminal, `coverage/index.html` y `coverage/lcov.info`). Forma oficial: `npm run test:backend:coverage` desde la raíz. |

## Autenticación

- `POST /auth/login` — recibe `{ email, password }`, devuelve `{ token, nutritionist }`. Credenciales inválidas devuelven siempre `401` con el mismo mensaje genérico, sin revelar si el email existe.
- El resto de los endpoints requieren `Authorization: Bearer <token>`. El middleware `requireAuth` inyecta `req.nutricionistaId` a partir del token; toda consulta a pacientes filtra por ese id. Sin token: `401`. Paciente de otro nutricionista: `404`.
- Alta de nutricionistas: solo por seed (`npm run seed`, ver tabla de scripts) — no hay panel de administración todavía.

## Tecnologías previstas

- Node.js + Express
- PostgreSQL
- Docker / Docker Compose

## Repositorios relacionados

- `nutria-frontend` — interfaz web (React + Vite).
- `nutria-ia` — servicio de generación asistida (Python + FastAPI).
