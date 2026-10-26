#!/usr/bin/env bash
# Despliegue de staging en la VM de OCI. Lo ejecuta cd-staging.yml de cada repo
# por SSH, como forced command de la clave de despliegue (README, sección
# "Staging"): esa clave no puede correr otra cosa que este script.
#
#   bash deploy-staging.sh <backend|frontend|ia>
#
# Por SSH el servicio llega en SSH_ORIGINAL_COMMAND; a mano, como argumento.
set -euo pipefail

ROOT="${NUTRIA_ROOT:-$HOME/nutria}"
COMPOSE=(docker compose
  -f "$ROOT/nutria-backend/docker-compose.yml"
  -f "$ROOT/nutria-backend/docker-compose.staging.yml")

main() {
  local service="${SSH_ORIGINAL_COMMAND:-${1:-}}"
  local repo
  case "$service" in
    backend) repo=nutria-backend ;;
    frontend) repo=nutria-frontend ;;
    ia) repo=nutria-ia ;;
    *)
      echo "Servicio no válido: '$service' (backend, frontend o ia)" >&2
      exit 2
      ;;
  esac

  # Un despliegue a la vez entre los tres repos: comparten el mismo compose.
  exec 9>"$ROOT/.deploy.lock"
  echo "== Esperando el lock de despliegue"
  flock 9

  # La VM no tiene cambios propios: siempre queda igual a origin/staging. Los
  # .env no están versionados, así que el reset no los toca.
  echo "== Actualizando $repo"
  git -C "$ROOT/$repo" fetch --quiet origin staging
  git -C "$ROOT/$repo" reset --hard --quiet origin/staging
  git -C "$ROOT/$repo" log -1 --format='%h %s'

  # El backend trae el compose y la config de Traefik: levanta todo el stack
  # (lo que no cambió sale de la cache). Frontend e IA, solo su servicio.
  echo "== Levantando $service"
  if [ "$service" = backend ]; then
    "${COMPOSE[@]}" up -d --build --remove-orphans
  else
    "${COMPOSE[@]}" up -d --build --no-deps "$service"
  fi

  docker image prune -f > /dev/null
  echo "== Listo"
}

# En la misma línea que la llamada: un despliegue del backend reescribe este
# archivo con el git reset, y bash lee los scripts a medida que los ejecuta.
main "$@"; exit
