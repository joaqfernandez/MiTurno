#!/usr/bin/env bash
# Prueba local del ciclo completo: backup → cifrado → restauración → verificación. No usa R2 ni claves reales.
#
# Crea una base de origen propia con migraciones y datos ficticios, la copia con infra/backup/backup.sh
# a una carpeta temporal, la restaura con scripts/restore-backup.sh y compara fila por fila los totales.
# También comprueba que el backup falle con una base inexistente y que no se pueda descifrar con otra clave.
# Nunca toca la base demo (miturno_python). Al terminar borra las bases y los archivos que creó.
#
# Uso: docker compose -p miturno-python up -d --wait && scripts/test-backup-restore.sh
set -Eeuo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
python="$raiz/apps/api-python/.venv/bin/python"
servidor="turnos:turnos_dev@127.0.0.1:55432"
servidor_docker="turnos:turnos_dev@host.docker.internal:55432"
origen="miturno_restore_prueba_origen"
destino="miturno_restore_prueba_destino"
trabajo="$(mktemp -d)"
mkdir -p "$trabajo/backups" "$trabajo/claves"
# El contenedor corre con otro usuario: necesita escribir los backups y leer las claves de prueba.
chmod 0777 "$trabajo/backups" "$trabajo/claves"

en_contenedor() { docker run --rm --add-host host.docker.internal:host-gateway "$@"; }
sql() { en_contenedor miturno-backup psql "postgresql://$servidor_docker/postgres" --quiet -v ON_ERROR_STOP=1 -c "$1"; }
limpiar() {
  sql "DROP DATABASE IF EXISTS $origen" || true
  sql "DROP DATABASE IF EXISTS $destino" || true
  rm -rf "$trabajo"
}
trap limpiar EXIT

echo "==> 1/6 Imagen de backup"
docker build --quiet -t miturno-backup "$raiz/infra/backup" >/dev/null

echo "==> 2/6 Base de origen con migraciones y datos ficticios"
sql "DROP DATABASE IF EXISTS $origen"; sql "CREATE DATABASE $origen"
( cd "$raiz/apps/api-python"
  export DATABASE_URL="postgresql+psycopg://$servidor/$origen" APP_ENV=development
  export JWT_ACCESS_SECRET="solo-para-la-prueba-de-backup-0123456789abcdef"
  "$python" -m alembic upgrade head >/dev/null 2>&1
  "$python" -m app.seed >/dev/null )

echo "==> 3/6 Claves de age descartables"
en_contenedor -v "$trabajo/claves:/claves" miturno-backup sh -c \
  'age-keygen -o /claves/buena.txt 2>/dev/null && age-keygen -o /claves/otra.txt 2>/dev/null && chmod 0644 /claves/*.txt'
publica="$(grep -o 'age1[a-z0-9]*' "$trabajo/claves/buena.txt" | head -n 1)"

echo "==> 4/6 Backup cifrado"
en_contenedor -v "$trabajo/backups:/backups" -e BACKUP_TARGET=/backups -e BACKUP_ENV=staging \
  -e AGE_RECIPIENT="$publica" -e DATABASE_URL="postgresql+psycopg://$servidor_docker/$origen" miturno-backup
archivo="$(ls "$trabajo/backups/staging/")"
[[ "$archivo" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}Z\.dump\.age$ ]] || { echo "FALLA: nombre inesperado: $archivo" >&2; exit 1; }
head -c 21 "$trabajo/backups/staging/$archivo" | grep -q '^age-encryption.org/v1' || { echo "FALLA: el archivo no está cifrado con age" >&2; exit 1; }
if grep -aq 'PGDMP' "$trabajo/backups/staging/$archivo"; then echo "FALLA: el backup contiene datos sin cifrar" >&2; exit 1; fi

echo "==> 5/6 Los errores terminan con código de error"
if en_contenedor -v "$trabajo/backups:/backups" -e BACKUP_TARGET=/backups -e BACKUP_ENV=staging -e AGE_RECIPIENT="$publica" \
     -e DATABASE_URL="postgresql://$servidor_docker/base_que_no_existe" miturno-backup >/dev/null 2>&1; then
  echo "FALLA: el backup de una base inexistente terminó sin error" >&2; exit 1
fi
[ "$(ls "$trabajo/backups/staging/" | wc -l | tr -d ' ')" = 1 ] || { echo "FALLA: un backup fallido dejó un archivo" >&2; exit 1; }
if salida="$(BACKUP_TARGET_DIR="$trabajo/backups" AGE_IDENTITY_FILE="$trabajo/claves/otra.txt" RESTORE_DB="$destino" \
     "$raiz/scripts/restore-backup.sh" staging 2>&1)"; then
  echo "FALLA: el backup se pudo restaurar con una clave que no corresponde" >&2; exit 1
fi
# Tiene que fallar por la clave, no por otro motivo.
echo "$salida" | grep -q "no identity matched" || { echo "FALLA: la restauración con otra clave falló por un motivo inesperado:" >&2; echo "$salida" >&2; exit 1; }

echo "==> 6/6 Restauración y comparación"
BACKUP_TARGET_DIR="$trabajo/backups" AGE_IDENTITY_FILE="$trabajo/claves/buena.txt" RESTORE_DB="$destino" \
  "$raiz/scripts/restore-backup.sh" staging
contar() {
  en_contenedor miturno-backup psql "postgresql://$servidor_docker/$1" -At -v ON_ERROR_STOP=1 -c \
    "SELECT string_agg(t || '=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || quote_ident(t), false, true, '')))[1]::text, ' ' ORDER BY t)
       || ' | triggers=' || (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)
       || ' | restricciones=' || (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace)
     FROM unnest(ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname = 'public')) AS t"
}
antes="$(contar "$origen")"; despues="$(contar "$destino")"
[ "$antes" = "$despues" ] || { echo "FALLA: la base restaurada no coincide con la original" >&2; echo "origen:  $antes" >&2; echo "destino: $despues" >&2; exit 1; }
echo "$despues" | grep -q 'users=[1-9]' || { echo "FALLA: la base restaurada no tiene usuarios" >&2; exit 1; }
echo "Coinciden: $despues"
echo "PRUEBA DE BACKUP Y RESTAURACIÓN: OK"
