# Imagen del backup y de la restauración de MiTurno. Guía: docs/DEPLOY.md
#
#   Backup (cron de Railway):  comando por defecto
#   Restauración (local):      scripts/restore-backup.sh la usa con /usr/local/bin/restore.sh
#
# La versión de esta imagen base tiene que ser IGUAL O MAYOR que la del PostgreSQL de Railway:
# pg_dump se niega a copiar un servidor más nuevo que él. Si Railway usa PostgreSQL 17, cambiar a postgres:17-alpine.
FROM postgres:16-alpine
RUN apk add --no-cache age rclone bash ca-certificates
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
# Usuario sin privilegios que ya trae la imagen (uid 70).
USER postgres
WORKDIR /tmp
ENTRYPOINT []
CMD ["/usr/local/bin/backup.sh"]
