# Suspensión y revocación de sesiones

La suspensión administrativa incrementa `User.sessionVersion`, revoca todos los refresh tokens del usuario y registra el cambio en auditoría dentro de una misma transacción. Reactivar permite un nuevo login, pero no restaura las credenciales anteriores.

Cada petición autenticada consulta el estado y la versión actuales del usuario. Un access token sin `sv` o con una versión anterior se rechaza. Los tickets de sesión y solicitudes de vinculación Google también guardan la versión del usuario: no sobreviven a una suspensión seguida de reactivación.

Login por contraseña, refresh y finalización de Google coordinan la emisión con la suspensión mediante el lock de la fila del usuario en PostgreSQL. Refresh adquiere primero ese lock y después consume su token. Si una emisión termina antes que la suspensión, sus credenciales quedan revocadas; si la suspensión gana, no se emiten credenciales utilizables. Las peticiones que ya habían sido autorizadas antes de confirmar la suspensión pueden terminar: no se cancelan transacciones en curso.

La API identifica el rechazo de una sesión con `X-Session-Invalid: 1`, expuesto por CORS. La web retira credenciales y caché de consultas al recibirlo y muestra un aviso. Un 403 por permisos sobre un recurso no cierra la sesión. La retirada visual ocurre en la siguiente petición; no hay notificación push a pestañas inactivas.

## Aplicación

Ejecutar `npm run db:migrate` y reiniciar los procesos con `npm run dev`. La migración `0003` conserva usuarios, perfiles, turnos e historias, pero invalida las sesiones y solicitudes OAuth temporales anteriores. Los usuarios deberán volver a ingresar. No revoca las conexiones existentes con Google Calendar.

## Validación

- `tests/test_suspension.py`: sesiones abiertas de médico/paciente, operaciones clínicas y turnos, login, refresh, reactivación y permisos administrativos.
- `tests/test_google_auth.py`: rechazo de cuentas no activas y tickets/vinculaciones previos a suspensión.
- `tests/test_postgres.py`: competencia de suspensión con login, refresh y canje Google en bases temporales PostgreSQL.
- `web/test/api.test.cjs`: retiro de credenciales, respuestas demoradas, renovación y conservación de sesiones ante denegaciones comunes.
- `web/e2e/real-app.spec.ts`: suspensión con navegador abierto, retiro de sesión y nuevo login después de reactivar.

La suspensión limita la identidad que opera. No elimina la historia del paciente ni impide que otro profesional autorizado acceda a ella. Tampoco cancela automáticamente turnos, pagos o tareas de Calendar. Las referencias entre historias clínicas se revisaron por separado: ver [integridad clínica](integridad-historias-clinicas.md) y [cierre conjunto D01/A11](CIERRE_SEGURIDAD_SESIONES_HISTORIAS.md).
