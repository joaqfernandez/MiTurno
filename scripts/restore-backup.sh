#!/usr/bin/env bash
# Simulacro de restauración: baja el último backup de R2, lo descifra y lo restaura en una base nueva
# («miturno_restore») del PostgreSQL local de docker-compose. No toca la base demo ni la base de Railway.
# Paso a paso en docs/DEPLOY.md, «Restaurar un backup».
#
# Uso:
#   scripts/restore-backup.sh staging
#   scripts/restore-backup.sh production 2026-11-13T03-00Z.dump.age     (un backup puntual)
#
# Necesita:
#   - Docker Desktop abierto y la base local: docker compose -p miturno-python up -d --wait
#   - infra/backup/restore.env (no está en Git) con R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET
#   - la clave privada de age en ~/.config/miturno/backup-age-key-<entorno>.txt (o su ruta en AGE_IDENTITY_FILE)
set -Eeuo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
entorno="${1:-}"
case "$entorno" in
  staging|production) ;;
  *) echo "Uso: scripts/restore-backup.sh staging|production [archivo]" >&2; exit 2 ;;
esac

clave="${AGE_IDENTITY_FILE:-$HOME/.config/miturno/backup-age-key-$entorno.txt}"
[ -r "$clave" ] || { echo "No se encontró la clave privada de age en $clave" >&2; exit 2; }
base="${RESTORE_DB:-miturno_restore}"
# Servidor local de docker-compose.yml (credenciales de desarrollo, solo accesible desde esta máquina).
local_host="${RESTORE_PG:-turnos:turnos_dev@127.0.0.1:55432}"
local_docker="${local_host/127.0.0.1/host.docker.internal}"

origen=()
if [ -n "${BACKUP_TARGET_DIR:-}" ]; then
  # Solo pruebas: backups en una carpeta local en lugar de R2.
  origen=(-v "$BACKUP_TARGET_DIR:/backups:ro" -e BACKUP_TARGET=/backups)
else
  [ -r "$raiz/infra/backup/restore.env" ] || { echo "Falta infra/backup/restore.env (ver docs/DEPLOY.md)" >&2; exit 2; }
  origen=(--env-file "$raiz/infra/backup/restore.env")
fi

echo "==> Construyendo la imagen de backup"
docker build --quiet -t miturno-backup "$raiz/infra/backup" >/dev/null

echo "==> Restaurando el backup de $entorno en la base local «${base}»"
docker run --rm --add-host host.docker.internal:host-gateway \
  "${origen[@]}" \
  -v "$clave:/run/age-key.txt:ro" -e AGE_IDENTITY_FILE=/run/age-key.txt \
  -e BACKUP_ENV="$entorno" -e BACKUP_FILE="${2:-}" -e RESTORE_DB="$base" \
  -e RESTORE_ADMIN_URL="postgresql://$local_docker/postgres" \
  miturno-backup /usr/local/bin/restore.sh

echo "==> Verificando las migraciones con alembic"
python="$raiz/apps/api-python/.venv/bin/python"
[ -x "$python" ] || { echo "Falta el entorno de Python: npm run setup:api" >&2; exit 2; }
cd "$raiz/apps/api-python"
export DATABASE_URL="postgresql+psycopg://$local_host/$base"
# alembic carga la configuración de la app, que exige esta variable; no se usa para nada acá.
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-solo-para-que-alembic-cargue-la-configuracion}"
actual="$("$python" -m alembic current 2>/dev/null | awk '{print $1}' | tail -n 1)"
ultima="$("$python" -m alembic heads 2>/dev/null | awk '{print $1}' | tail -n 1)"
echo "alembic current: ${actual:-ninguna}    última migración del código: $ultima"
[ -n "$actual" ] || { echo "ERROR: la base restaurada no tiene versión de migraciones" >&2; exit 5; }
if [ "$actual" != "$ultima" ]; then
  # No es un error: el backup puede ser anterior a una migración nueva. Se resuelve con alembic upgrade head.
  echo "AVISO: el backup es de una versión anterior del esquema; antes de usarlo correr «alembic upgrade head»."
fi

echo "==> Restauración verificada. La base «${base}» queda en el PostgreSQL local para revisarla."
echo "    Para borrarla: docker compose -p miturno-python exec postgres dropdb -U turnos $base"
