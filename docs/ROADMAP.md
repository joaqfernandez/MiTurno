# Roadmap después de la migración Python

Las marcas indican implementación local verificada; las integraciones externas necesitan además validación con sus proveedores. Ver [evidencias y deuda](MIGRACION_PYTHON.md).

## Núcleo
- [x] Backend FastAPI/SQLAlchemy, migración Alembic y PostgreSQL nuevo.
- [x] Registro/login, refresh rotativo, roles y activación administrativa.
- [x] Suspensión con revocación persistente de sesiones, tickets Google y pruebas de concurrencia. [Cierre D01](CIERRE_SEGURIDAD_SESIONES_HISTORIAS.md).
- [x] Perfil paciente con campos permitidos y protección contra cambios de roles/relaciones.
- [x] Agenda, disponibilidad, reserva, cancelación y exclusión de solapamientos.
- [x] Frontend TypeScript conectado a la API y caché aislada por sesión.
- [x] Seed pequeño y persistente: dos pacientes, dos médicos y un administrador.
- [x] Tests API, concurrencia PostgreSQL, cliente HTTP web y recorridos de navegador.

## Pagos, notificaciones y calendarios
- [x] PaymentProvider, adaptador Mercado Pago, firma webhook, importe e idempotencia.
- [x] Expiración de señas y trabajos de reembolso.
- [x] Adaptadores Resend/Twilio y plantillas simples de notificación.
- [x] Cola transaccional PostgreSQL/Python con reintentos; sustituye BullMQ.
- [x] OAuth Google con tokens cifrados, state de un uso y sync por cola.
- [x] Feed ICS rotable y descarga ICS por turno del paciente.
- [ ] Validación end-to-end con cuentas sandbox de cada proveedor.
- [ ] Conciliación manual de cobros duplicados/conflictivos.

## Historia clínica
- [x] Entradas inmutables, enmiendas y auditoría atómica respaldada por triggers.
- [x] Referencias de historia, autor y episodio protegidas por API y base; migración y pruebas negativas/concurrentes. [Cierre A11](CIERRE_SEGURIDAD_SESIONES_HISTORIAS.md).
- [x] Pantallas de lectura/escritura del médico y lectura del paciente.
- [ ] Adjuntos privados R2 con autorización de carga/descarga.
- [ ] Exportación PDF.
- [ ] Registro de accesos denegados y definición de permisos administrativos mínimos.

## Antes de producción

Checklist detallado y ordenado para la beta: [BETA.md](BETA.md).

- [x] Resolver avisos de seguridad de Next.js y dependencias web (Next 16 y React 19, 2026-09-25).
- [ ] Monitoreo y logs estructurados sin datos sensibles.
- [ ] Rate limiting compartido para varias réplicas.
- [ ] Backups automáticos y prueba de restauración.
- [ ] Pruebas de carga, recuperación del worker y proveedores reales.
- [ ] Consentimiento, términos y requisitos de tratamiento de datos de salud.
- [ ] Completar controles UI de excepciones de agenda y zonas horarias.

Login Google está implementado y requiere validación con credenciales reales. No está implementada la gestión integral de clínicas. Las sedes de atención sí tienen modelo/API, pero eso no equivale a administrar una clínica multiusuario.
