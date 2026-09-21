# Integridad de referencias en historias clínicas

## Reglas de escritura

Una evolución pertenece a una historia y tiene como autor al médico autenticado. La API no acepta que el cliente elija `recordId` o `doctorId`.

- El médico necesita una relación asistencial: al menos un turno del paciente en estado `CONFIRMED`, `COMPLETED` o `NO_SHOW`. Se mantiene el criterio existente; `NO_SHOW` permite documentar una ausencia y no acredita que hubo atención efectiva.
- Una evolución nueva puede no indicar turno. Si indica `appointmentId`, ese turno debe existir, corresponder al mismo paciente y médico y estar confirmado, atendido o registrado como ausente. Un turno pendiente o cancelado no es válido aunque haya otra relación asistencial.
- Una enmienda debe referenciar una entrada existente de la misma historia y del mismo autor. Otro médico autorizado puede agregar su propia evolución, pero no corregir la firma del colega.
- Una enmienda conserva exactamente el `appointmentId` original. Si el cliente omite el campo, el servidor lo hereda. Si envía otro ID o `null` para quitarlo, se rechaza. Una entrada sin turno sigue sin turno al enmendarse.
- Se pueden enmendar enmiendas: cada enlace conserva historia, autor y episodio. La entrada anterior nunca se modifica ni se borra.
- Corregir una entrada cuyo turno se canceló después de firmarla no exige que ese turno vuelva a estar activo, pero sigue exigiendo la relación asistencial indicada arriba. Si no queda ningún turno habilitante, el médico no puede acceder ni escribir por esta vía.

Se conserva la lectura del paciente sobre su propia historia, la lectura del médico con relación asistencial y la lectura administrativa existente. El listado anidado de enmiendas se limita a la misma historia. `canAmend` permite que el formulario ofrezca solo entradas propias; la autorización siempre se vuelve a verificar en el backend.

## Persistencia y concurrencia

La API valida todas las referencias antes de crear una historia nueva. Entrada y auditoría se guardan en la misma transacción; un rechazo o fallo de auditoría revierte todo.

Los triggers de SQLite y PostgreSQL verifican el paciente y médico del turno, y la historia, autor y episodio de la enmienda. También impiden cambiar el paciente de una historia y el paciente o médico de un turno. Las claves foráneas y las restricciones append-only existentes siguen vigentes. En SQLite se bloquea además `INSERT OR REPLACE`, incluyendo colisiones por `rowid` con otra clave primaria, para que no eluda la inmutabilidad.

PostgreSQL usa bloqueos compartidos sobre el turno que acredita la relación y el turno referenciado, y serializa la creación de historias por paciente. Si una cancelación se confirma primero, se reevalúa el estado y se rechaza la escritura nueva. Si la escritura obtiene el bloqueo primero, termina y la cancelación puede continuar después; no borra la evolución firmada. SQLite serializa las escrituras mediante `BEGIN IMMEDIATE`.

La defensa SQL protege la estructura de las referencias; no sustituye la autenticación del profesional. Un administrador de base con facultad de desactivar constraints/triggers está fuera de este control.

## Migración 0004

La migración revisa las referencias históricas antes de instalar las nuevas reglas. Si encuentra cruces de historia, autor o episodio, falla indicando la cantidad, sin mostrar datos clínicos ni corregir, borrar o reasignar entradas automáticamente. En PostgreSQL bloquea escrituras sobre las tablas afectadas durante la revisión e instalación.

No rechaza un turno histórico por haberse cancelado después de firmar su evolución. Una instalación válida conserva usuarios, turnos, historias y auditorías. El DDL de `clinical_integrity_v1.py` es un contrato versionado de la migración: cambios futuros requieren otra revisión.

Aplicar con `npm run db:migrate` y reiniciar `npm run dev` si había procesos abiertos.

## Verificación

`tests/test_clinical_references.py` prueba dos médicos y dos pacientes, referencias inexistentes y cruzadas, herencia del turno, estados inválidos, SQL directo, inmutabilidad, rollback y migración con datos válidos e inconsistentes. `tests/test_postgres.py` verifica triggers y carreras de cancelación/escritura en ambos órdenes en bases PostgreSQL temporales.

Los recorridos de Playwright comprueban que una enmienda desde el formulario conserva su episodio, que el original sigue visible y que un colega solo puede seleccionar sus propias evoluciones para enmendarlas.
