#!/usr/bin/env bash
# Backup diario de PostgreSQL a Cloudflare R2, cifrado. Guía: docs/DEPLOY.md
#
# Cualquier paso que falle termina el script con código distinto de cero: Railway marca la ejecución
# como fallida. Nunca imprime la URL de la base, las claves ni el contenido del backup.
#
# Variables (solo nombres; los valores van en el panel de Railway):
#   DATABASE_URL          base a copiar
#   BACKUP_ENV            staging | production  (carpeta dentro del bucket)
#   AGE_RECIPIENT         clave PÚBLICA de age (empieza con "age1"). La privada NO va en Railway.
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#   BACKUP_TARGET         opcional, solo pruebas: carpeta local en lugar de R2
set -Eeuo pipefail
trap 'echo "backup: FALLÓ en la línea $LINENO" >&2' ERR

exigir() { for nombre in "$@"; do [ -n "${!nombre:-}" ] || { echo "backup: falta la variable $nombre" >&2; exit 2; }; done; }
exigir DATABASE_URL BACKUP_ENV AGE_RECIPIENT

case "$BACKUP_ENV" in
  staging|production) ;;
  *) echo "backup: BACKUP_ENV debe ser staging o production" >&2; exit 2 ;;
esac
case "$AGE_RECIPIENT" in
  age1*) ;;
  *) echo "backup: AGE_RECIPIENT debe ser una clave pública de age (age1...)" >&2; exit 2 ;;
esac

if [ -n "${BACKUP_TARGET:-}" ]; then
  destino="$BACKUP_TARGET"
else
  exigir R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_REGION=auto \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  destino="r2:${R2_BUCKET}"
fi

# La app usa «postgresql+psycopg://»; pg_dump solo entiende «postgresql://».
url="${DATABASE_URL/+psycopg/}"
nombre="$(date -u +%Y-%m-%dT%H-%MZ).dump.age"
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
# rclone se configura solo con variables; un archivo vacío evita su aviso de «configuración no encontrada».
: > "$trabajo/rclone.conf"; export RCLONE_CONFIG="$trabajo/rclone.conf"
archivo="$trabajo/$nombre"

echo "backup: copiando la base ($BACKUP_ENV)"
# El backup se cifra al vuelo: nunca queda sin cifrar en disco. pipefail hace fallar todo si pg_dump falla.
pg_dump --format=custom --no-owner --no-acl --dbname="$url" | age --recipient "$AGE_RECIPIENT" --output "$archivo"

bytes="$(wc -c < "$archivo" | tr -d ' ')"
# Un archivo de age vacío por dentro pesa ~200 bytes; una base con el esquema de MiTurno pesa mucho más.
[ "$bytes" -gt 2000 ] || { echo "backup: el archivo pesa $bytes bytes; es demasiado chico para ser un backup válido" >&2; exit 3; }

echo "backup: subiendo $BACKUP_ENV/$nombre ($bytes bytes)"
rclone copyto "$archivo" "$destino/$BACKUP_ENV/$nombre" --retries 3 --low-level-retries 5

# Confirma que el archivo quedó en el destino con el mismo tamaño.
subido="$(rclone lsf --format s "$destino/$BACKUP_ENV/$nombre")"
[ "$subido" = "$bytes" ] || { echo "backup: el archivo subido pesa '$subido' bytes y se esperaban $bytes" >&2; exit 4; }

echo "backup: OK $BACKUP_ENV/$nombre"
