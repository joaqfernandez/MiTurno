# Migración del backend a Python

El backend activo es FastAPI + SQLAlchemy + Alembic; el frontend sigue siendo TypeScript/Next.js. Se retiró NestJS/Prisma del workspace. La base PostgreSQL de desarrollo es nueva, aislada y contiene únicamente datos ficticios. No se migraron datos del esquema anterior por decisión del usuario.

## Roadmap → código

| Dominio anterior | Implementación Python | Evidencia |
| --- | --- | --- |
| Auth, users | auth.py, dependencies.py, patients.py | registro, activación, login, refresh concurrente, logout |
| Patients | patients.py | allowlist, identidad, persistencia, rollback y rechazos de relaciones/roles |
| Doctors | doctors.py, schemas.py | catálogo, ajustes, horarios, sedes, excepciones |
| Appointments | appointments.py, availability.py | disponibilidad, reserva, cancelación, expiración, competencia PostgreSQL |
| Medical records | medical_records.py | relación asistencial, lectura, escritura y auditoría atómica, enmiendas |
| Payments | payments.py | adaptador HTTP, firma webhook, importes, idempotencia y reembolsos |
| Calendar | calendar.py | OAuth, state de un uso, tokens cifrados, ICS y eventos idempotentes |
| Notifications | notifications.py, outbox.py, worker.py | Resend/Twilio, estados reales, trabajos persistentes, reintentos |
| Administración | admin.py y web/app/admin | activar/suspender profesionales, observar y reintentar trabajos |

## Arquitectura → código

Se mantiene un monolito modular con entidades compartidas. Los módulos no son servicios desplegados por separado ni tienen repositorios de datos aislados; esa separación adicional no se afirma como terminada.

La cola BullMQ/Redis se reemplazó por una tabla Job y un worker Python. Reserva y trabajo se guardan en la misma transacción (outbox), evitando perder el envío entre commit y encolado. PostgreSQL usa SKIP LOCKED, leases recuperables y reintentos con espera creciente. El despliegue debe ejecutar API y worker.

`PaymentProvider` conserva la separación del proveedor. Preferencia de checkout y pago externo tienen IDs diferentes. El webhook verifica firma y consulta el pago al proveedor, además de contrastar moneda e importe. Un pago aprobado tardíamente sobre una reserva cancelada no revive el turno: genera reembolso.

Los turnos activos no pueden solaparse por una constraint de intervalo PostgreSQL, además del bloqueo por médico. Una cancelación libera el horario. Las evoluciones y AuditLog tienen triggers de inmutabilidad, y la escritura clínica falla si no se puede auditar.

La identidad y los roles se resuelven desde la base, no desde campos enviados por el cliente. Actualizar pacientes aplica DTO estricto y allowlist. La web refresca tokens y separa cachés entre sesiones; un error de la API no se convierte en un éxito simulado.

## Completitud y pruebas

Verificación final local: **93 tests Python**, **4 tests PostgreSQL**, **10 tests del cliente web** y **3 recorridos Playwright** aprobados; build de producción Next.js aprobado. Los cuatro tests PostgreSQL se omiten en la suite habitual y se ejecutaron por separado con su variable de conexión.

Las suites usan peticiones HTTP a FastAPI, bases temporales y aserciones de persistencia. PostgreSQL tiene pruebas separadas de concurrencia y triggers. Playwright ejercita el frontend con API y base temporal reales. Los proveedores externos usan doubles o `httpx.MockTransport`, limitados a la frontera HTTP; falta probarlos con credenciales sandbox reales.

La migración inicial Alembic contiene el esquema congelado. El seed es transaccional, repetible y está prohibido en producción. No contiene información clínica real y no ejecuta pagos ni envíos.

## Deuda explícita y siguiente trabajo

- **Dependencias web:** `npm audit` detectó 5 paquetes vulnerables (1 crítico, 3 altos, 1 moderado): Next, PostCSS, nanoid, browserslist y baseline-browser-mapping. Actualizar Next con su propia verificación de compatibilidad antes de desplegar. No se aplicó un cambio mayor automático mediante `audit --force`.
- **Proveedores:** verificar Mercado Pago, Google, Resend y Twilio con credenciales de pruebas, URLs públicas y casos de error reales. WhatsApp no está implementado. Los trabajos fallidos no se presentan como enviados.
- **Pagos:** definir conciliación operativa para dos cobros externos diferentes de una misma reserva y revisión manual de conflictos; no asumir garantía de envío exactamente una vez ante fallos de red del proveedor.
- **Adjuntos/PDF:** existe modelo Attachment, pero faltan upload/descarga autorizada en R2 y exportación PDF. No están completos por existir el modelo.
- **Auditoría:** se auditan lecturas permitidas y escrituras clínicas; falta política de registro de accesos denegados, retención y acceso administrativo mínimo.
- **Boundaries:** la modularidad es por dominio dentro del monolito; no hay chequeos automáticos de dependencias/imports entre módulos.
- **Pruebas:** falta E2E con proveedores reales, carga sostenida, recuperación ante caída de worker y restauración de backups. Hay dos avisos de deprecación Starlette/AnyIO en tests.
- **Operación:** rate limiting en memoria por proceso; para varias réplicas hace falta límite compartido/proxy. Pendientes monitoreo, backups con restore probado, gestión de secretos y despliegue.
- **Producto:** terminar UI de excepciones de agenda, mejorar soporte visual de zonas horarias y preparar consentimiento/documentación de datos de salud con revisión profesional.

La auditoría anterior (`AUDITORIA.md`) y el documento original de arquitectura describen NestJS y se conservan como antecedentes; este documento registra las decisiones que los sustituyen.
