#!/usr/bin/env bash
# Baja el último backup, lo descifra y lo restaura en una base NUEVA. Lo usa scripts/restore-backup.sh.
# No toca la base de origen ni ninguna otra: borra y vuelve a crear solo RESTORE_DB.
#
# Variables:
#   BACKUP_ENV            staging | production (carpeta del bucket de donde se baja)
#   AGE_IDENTITY_FILE     archivo con la clave PRIVADA de age (montado en el contenedor, solo lectura)
#   RESTORE_ADMIN_URL     conexión al PostgreSQL de destino (base «postgres»)
#   RESTORE_DB            nombre de la base a crear; debe empezar con «miturno_restore»
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#   BACKUP_TARGET         opcional, solo pruebas: carpeta local en lugar de R2
#   BACKUP_FILE           opcional: nombre exacto del backup; vacío = el más reciente
set -Eeuo pipefail
trap 'echo "restore: FALLÓ en la línea $LINENO" >&2' ERR

exigir() { for nombre in "$@"; do [ -n "${!nombre:-}" ] || { echo "restore: falta la variable $nombre" >&2; exit 2; }; done; }
exigir BACKUP_ENV AGE_IDENTITY_FILE RESTORE_ADMIN_URL RESTORE_DB

case "$RESTORE_DB" in
  miturno_restore*) ;;
  *) echo "restore: RESTORE_DB debe empezar con miturno_restore (protege las demás bases)" >&2; exit 2 ;;
esac
[[ "$RESTORE_DB" =~ ^[a-z0-9_]+$ ]] || { echo "restore: RESTORE_DB solo admite minúsculas, números y guion bajo" >&2; exit 2; }
[ -r "$AGE_IDENTITY_FILE" ] || { echo "restore: no se puede leer la clave privada en $AGE_IDENTITY_FILE" >&2; exit 2; }

if [ -n "${BACKUP_TARGET:-}" ]; then
  origen="$BACKUP_TARGET"
else
  exigir R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_REGION=auto \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  origen="r2:${R2_BUCKET}"
fi

trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
# rclone se configura solo con variables; un archivo vacío evita su aviso de «configuración no encontrada».
: > "$trabajo/rclone.conf"; export RCLONE_CONFIG="$trabajo/rclone.conf"

# Los nombres empiezan con la fecha ISO: el último en orden alfabético es el más reciente.
nombre="${BACKUP_FILE:-$(rclone lsf --files-only --include '*.dump.age' "$origen/$BACKUP_ENV/" | sort | tail -n 1)}"
[ -n "$nombre" ] || { echo "restore: no hay backups en $BACKUP_ENV/" >&2; exit 3; }
echo "restore: backup elegido: $BACKUP_ENV/$nombre"

rclone copyto "$origen/$BACKUP_ENV/$nombre" "$trabajo/backup.age"

admin="${RESTORE_ADMIN_URL/+psycopg/}"
destino="${admin%/*}/$RESTORE_DB"
psql "$admin" --quiet -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $RESTORE_DB" -c "CREATE DATABASE $RESTORE_DB"

echo "restore: descifrando y restaurando en la base $RESTORE_DB"
# Se descifra al vuelo: el backup sin cifrar no se escribe en disco.
age --decrypt --identity "$AGE_IDENTITY_FILE" "$trabajo/backup.age" \
  | pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname="$destino"

echo "restore: versión de migraciones en el backup: $(psql "$destino" -At -c 'SELECT version_num FROM alembic_version')"
echo "restore: filas por tabla"
for tabla in users patient_profiles doctor_profiles appointments medical_records medical_record_entries audit_logs notifications; do
  printf '  %-24s %s\n' "$tabla" "$(psql "$destino" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM $tabla")"
done
echo "restore: OK ($BACKUP_ENV/$nombre → $RESTORE_DB)"
