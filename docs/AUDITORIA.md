# Auditoría del proyecto — 17 de septiembre de 2026

Base: commit `0fd3a85` y árbol de trabajo local. El cambio previo en `package-lock.json` pertenece al estado recibido. No se modificó código de producto ni se actualizaron los checks del roadmap.

## Dictamen y método

El proyecto tiene una estructura de monolito modular real, modelos y servicios con lógica sustancial, y una interfaz navegable con datos demo. **No constituye todavía un núcleo funcional integrado verificable para uso real.** Hay contratos frontend/API incompatibles, riesgos de autorización e integridad y funciones marcadas como terminadas que son parciales. Ninguna fase completa puede darse por aceptada con la evidencia actual.

Se revisaron `docs/ROADMAP.md`, README, schema Prisma, todos los módulos backend, cliente HTTP, hooks, autenticación, rutas de interfaz, configuración e infraestructura versionada. El documento `arquitectura-stack-turnos-medicos.md` mencionado en README no se encontró en el proyecto ni en la búsqueda por nombre dentro de su directorio padre. La evaluación arquitectónica usa las decisiones escritas en README, roadmap y comentarios del código; no presupone contenido del documento ausente.

Estados usados: **implementación presente** = lógica conectada identificable, sin certificar
ejecución integral; **parcial** = faltan pasos o garantías; **roto** = contradicción concreta entre componentes o comportamiento reproducido; **demo** = simulación; **ausente** = no se encontró implementación en el repositorio. La ausencia de configuración local no demuestra ausencia de una infraestructura externa.

Prioridades: **P0** autorización/integridad crítica antes de exponer datos reales; **P1** bloquea un flujo principal o su confiabilidad; **P2** deuda de mantenimiento u operación. Los escenarios inferidos por lectura se distinguen de las comprobaciones ejecutadas.

## 1. Roadmap → código

Una fila por cada ítem de las cinco fases. Las rutas son relativas a la raíz; todos los endpoints indicados tienen prefijo `/api`.

| Feature prevista / check actual | Evidencia de implementación | Estado auditado y brecha |
| --- | --- | --- |
| F1 Modelo completo `[x]` | `apps/api/prisma/schema.prisma`: usuarios, perfiles, agenda, turnos, pagos, historia, adjuntos, calendario, notificaciones y auditoría | **Parcial**. Schema genera cliente, pero no hay migraciones versionadas; faltan garantías de solapamiento e inmutabilidad en DB, relación de `appointmentId` clínico y modelo de ubicaciones de la UI. |
| F1 Auth con roles y refresh rotativo `[x]` | `modules/auth`: DTOs, estrategia JWT, servicio, register/login/refresh; `RefreshToken` | **Parcial / integración rota**. Contrato de login y registro incompatible con web; estado de usuario ignorado; rotación no atómica. A01–A03, D01. |
| F1 Agenda y disponibilidad `[x]` | `DoctorsService.setSchedule`, PUT `/doctors/:id/schedule`, `AvailabilityService`, `DoctorSchedule`, `ScheduleOverride` | **Parcial**. No aplica EXTRA ni vigencias, depende del huso del servidor, acepta duraciones inválidas y no respeta rango completo. No hay administración de overrides. A04–A05. |
| F1 Reserva anti doble-booking `[x]` | POST `/appointments`, `AppointmentsService.book`, transacción serializable y unique | **Parcial con defectos de integridad**. Unique protege igual inicio, no todo solapamiento; disponibilidad fuera de tx; cancelados bloquean nuevas reservas. A04. |
| F1 Web registro/login/búsqueda/slot `[ ]` | `app/registro`, `login`, `medicos`, `medicos/[id]`; `lib/auth.tsx`, `queries.ts` | **UI presente, flujo real roto**. No corresponde llamarlo mero esqueleto, pero tampoco terminarlo. A01–A02 y matriz de contratos. |
| F1 Calendario paciente/médico `[ ]` | `app/panel/page.tsx` tiene calendario mensual; `app/mis-turnos` lista próximas/pasadas | **Parcial**. Hay calendario médico y lista del paciente; ambos hooks omiten fechas requeridas por API. |
| F1 Unit Availability + e2e reserva `[ ]` | Script `test: jest` en API | **Ausente**. Sin suite ni configuración/dependencias de Jest; comando falla. Las sondas de esta auditoría no sustituyen esa suite. |
| F2 PaymentProvider + MP `[x]` | Interface, token de DI, binding del módulo, SDK Checkout Pro, `Payment`, servicio | **Implementación sustancial, parcial**. El módulo no está vacío. Reembolso usa ID de preferencia como ID de pago; checkout web no consume respuesta real. A06, A02. |
| F2 Webhook idempotente y expiración `[x]` | POST `/payments/webhooks/mercadopago`, `handleWebhook`, `expireUnpaidHolds` | **Parcial**. Deduplicación solo secuencial para APPROVED; carreras, confirmación tardía, pago sin EXPIRED y slot no reutilizable. A04, A07. |
| F2 Firma webhook `[ ]` | TODO en `mercadopago.provider.ts:49`; `.env.example` | **Ausente**. Headers ignorados. Consulta al proveedor existe, pero no equivale a verificar firma. |
| F2 Resend/Twilio `[ ]` | Queue/worker y funciones `sendEmail`/`sendSms` | **Stub**. Solo logs, aun así estado SENT. A09. |
| F2 Templates `[ ]` | Nombres como `appointment_confirmed`, `new_appointment`, `reminder_24h` | **Ausente**. No hay renderizadores/templates; cancelación no encola aviso. |
| F3 Entradas inmutables/enmiendas/auditoría `[x]` | `MedicalRecordsService`, GET `/medical-records/:patientId`, POST `/medical-records/entries`, modelos asociados | **Parcial**. API append-only presente, auditoría no atómica, referencias no verificadas, inmutabilidad no forzada en DB. A10–A11. |
| F3 Adjuntos R2 `[ ]` | Modelo `Attachment` y variables R2 | **Solo modelo/configuración**. Sin firma de URLs, autorización de subida/descarga, servicio storage ni vinculación operativa. |
| F3 Web historia médico/paciente `[ ]` | `app/panel/pacientes/[id]`: lectura, alta y enmiendas | **Parcial**. Vista médica presente; sin vista propia del paciente. La lectura puede responder 404 antes de la primera evolución (la historia se crea de forma diferida); ese caso requiere tratamiento explícito en la UI. |
| F3 Export PDF `[ ]` | Sin ruta, servicio ni UI encontrada | **Ausente**. |
| F4 OAuth Google y push/delete `[x]` | `CalendarController`, `CalendarSyncService`, `CryptoService`, `CalendarAccount/Event` | **Parcial**. Cifrado presente; state sin vincular a sesión, botón web incompatible, inserciones no idempotentes. A08, A12. |
| F4 Feed ICS `[x]` | GET `/calendar/feed/:token.ics`, `IcsService`, token aleatorio al registrar médico | **Implementación backend presente, integración parcial**. URL web ficticia; no endpoint de rotación pese a documentación. No se validó suscripción en cliente externo. |
| F4 Sync en cola con reintentos `[ ]` | Llamadas inline con captura/log de errores | **Ausente**. Queue existente es de notificaciones, no de calendario. |
| F4 ICS por turno para paciente `[ ]` | Solo feed de médico | **Ausente**. |
| F5 Sentry/logs estructurados `[ ]` | Logger Nest puntual y console en seed | **Ausente** como integración de observabilidad prevista. |
| F5 Rate limiting `[ ]` | Sin módulo/guard throttler | **Ausente**. |
| F5 Backups y restore `[ ]` | Volúmenes de Docker Compose | **Sin evidencia versionada**. Volumen persistente no es backup; no scripts ni ensayo de restore. |
| F5 Términos/consentimiento `[ ]` | Sin flujo o registro de consentimiento encontrado | **Ausente en código**. No se realizó evaluación jurídica ni certificación de cumplimiento. |
| F5 Admin/verificación de matrícula `[ ]` | Rol ADMIN y estados de usuario en schema | **Solo modelo**. Sin panel ni proceso de activación. Médicos nuevos quedan pendientes y excluidos de búsqueda. |

### Alcance adicional y documentación desactualizada

- Ubicaciones: `app/panel/ubicaciones`, `DoctorLocation` en tipos web y datos demo. No existe entidad Location, servicio ni endpoints backend. El roadmap dice explícitamente que no hay multi-consultorio: la UI avanzó fuera de ese alcance sin registrar el cambio.
- Foto: la UI genera una representación para guardar y llama PUT `/doctors/me/photo`; esa ruta no existe. `photoUrl` sí está en Prisma y en la lista permitida de settings, pero no constituye un upload implementado.
- Teléfono: `User.phone` existe, el formulario lo exige para pacientes, pero DTO/registro no lo reciben y `patientsOfDoctor` no lo selecciona.
- Especialidades: seed y relación Prisma presentes; falta endpoint de catálogo y flujo de asignación al médico. No basta con tener la tabla para que búsqueda por especialidad sea utilizable con altas reales.
- OAuth de login figura como deuda aceptada y sigue ausente; es distinto de OAuth de calendario.
- `COMPLETED`, `NO_SHOW`, `PaymentStatus.EXPIRED` existen en enums; no se encontraron operaciones de negocio que produzcan esos estados. Los estados declarados no implican funcionalidad terminada.

## 2. Arquitectura → código

| Decisión | Verificación | Resultado |
| --- | --- | --- |
| Monolito modular | `app.module.ts` compone nueve módulos de dominio con controllers/providers; Prisma global | **Respetada estructuralmente**. Users accede a Prisma desde controller, razonable para lectura simple, pero sin capa propia de servicio. |
| Boundaries explícitos | Appointments importa módulos y consume servicios exportados | **Parcial**. `payments.controller.ts:22–23` importa dinámicamente Appointments y usa `ModuleRef.get(... strict:false)`; es dependencia inversa oculta, no desacoplamiento real. |
| Propiedad de datos por dominio | Prisma global se usa desde todos los dominios | **Débil**. Payments modifica Appointment; Notifications expira turnos directamente. No hay una transición central que aplique consistentemente pago, cancelación y calendario. |
| PaymentProvider intercambiable | Interface + Symbol DI + implementación MP | **Respetada en buena parte**. `providerRef` representa tres identidades distintas (preferencia, pago interno y supuesto pago externo). Controller/ruta webhook sigue específico de MP; agregar otro proveedor requiere más que cambiar el binding. |
| Disponibilidad calculada al vuelo | Recorre agenda, overrides y turnos; no materializa slots | **Respetada**, con errores de cálculo e integridad A04–A05. |
| Anti doble-booking transaccional | Transacción serializable contiene solo INSERT | **Garantía incompleta**. No hay lectura de solapamientos dentro de tx ni constraint de exclusión por intervalo. |
| Historia append-only | Sin endpoints update/delete ni llamadas equivalentes para entradas | **Respetada por API actual**, no impuesta por DB; falta garantizar referencias y auditoría atómica. Ausencia de updatedAt no impide UPDATE. |
| AuditLog en todo acceso clínico | GET exitoso y POST escriben logs con usuario/IP/entidad | **Parcial**. Escritura fuera de tx y sin registro de accesos rechazados o 404. Un fallo del log impide devolver lectura, pero la escritura ya puede estar persistida. |
| Tokens OAuth cifrados | AES-256-GCM, IV aleatorio y tag; ambos tokens cifrados | **Implementado**. Sin validación temprana de secretos; el ejemplo tiene clave nula conocida. No se certificó gestión de claves de despliegue. |
| Notificaciones vía cola | BullMQ registra queue, worker, attempts/backoff | **Implementado estructuralmente**. Envío simulado, falta atomicidad DB→queue y deduplicación durable. |
| Fallos externos no bloquean reserva | `onConfirmed` usa Promise.allSettled | **Parcial**. Espera asentamiento de promesas, descarta rechazos y carece de outbox/reintento para enqueue fallido. Checkout y refund sí propagan fallos después de persistir estado. |
| Integraciones calendar confiables | Push/delete inline, errores logueados | **Deuda reconocida**. Sin cola, reconciliación o idempotencia externa; no hay sincronización entrante pese al comentario «bidireccional saliente». |

## 3. Código → completitud y hallazgos

### A01 — P1: autenticación web incompatible con API

`apps/web/lib/auth.tsx:82–89` espera `res.user.roles`; `apps/api/src/modules/auth/auth.service.ts:98` devuelve únicamente accessToken y refreshToken. Con credenciales correctas, la UI falla al leer `user` y muestra error. El registro envía `phone` desde `app/registro/page.tsx:44`; `RegisterDto` no declara ese campo y el ValidationPipe global lo rechaza para ambos roles. El rechazo del DTO se reprodujo con el pipe real.

**Aceptación:** prueba HTTP + UI de alta/login de ambos roles, contrato común de respuesta y prueba de rechazo de campos realmente desconocidos.

### A02 — P1: rutas y payloads impiden completar los flujos reales

| Consumidor web | API existente / defecto |
| --- | --- |
| GET `/specialties` (`queries.ts:28`) | No existe controller/ruta de catálogo. |
| GET `/doctors/:id` (`queries.ts:65`) | Solo existe GET colección; detalle no implementado. |
| GET `/appointments/me` (`queries.ts:94,105`) | Controller crea fechas desde `from/to` ausentes; llega Invalid Date al servicio. |
| POST `/appointments` (`queries.ts:117`) | Web espera Appointment plano; API devuelve `{ appointment, payment? }`. Pantalla accede `booked.startAt/status/checkoutUrl`; falla formato/checkout. |
| GET `/doctors/me/schedule` (`queries.ts:192`) | No hay GET de agenda recurrente. |
| PUT `/doctors/me/schedule` con `{blocks}` (`queries.ts:203`) | API espera ID real y `{schedules}`. `me` se toma como ID literal y ownership rechaza. |
| GET `/doctors/me/settings` (`queries.ts:274`) | No hay GET de settings. |
| PATCH `/doctors/me/settings` (`queries.ts:285`) | API requiere ID real; `me` no se resuelve. |
| GET/PUT `/doctors/me/locations` (`queries.ts:215,226`) | Ninguna ruta ni modelo persistente. |
| GET/PUT `/doctors/me/photo` (`queries.ts:244,255`) | Ninguna ruta de foto; field existe por otra vía. |
| GET `/patients/of-my-practice` | Devuelve `appointments`, pero UI espera además phone, lastVisit, visitCount y otros datos no seleccionados. |
| Enlace Google (`panel/configuracion/page.tsx:278`) | Navegación normal no envía Bearer guardado en localStorage; API devuelve JSON `{url}`, no redirección. |
| URL ICS (`panel/configuracion/page.tsx:9`) | Literal `tu-token-privado`, sin obtener token real. |
| Retorno MP (`mercadopago.provider.ts:32–33`) | `/turnos/pago/exito` y `/turnos/pago/error` no son páginas existentes. |

Los genéricos TypeScript de `api<T>` no validan JSON. Por eso ambos proyectos pueden pasar tipos y mantener estos defectos. **Aceptación:** contratos compartidos o validados y pruebas de cada operación real sin fallback.

### A03 — P0: actualización de paciente permite propagar escrituras privilegiadas

`patients.controller.ts:19` recibe `any`; `patients.service.ts:19–23` hace spread del cuerpo a Prisma. La anotación TypeScript del servicio no filtra en runtime. Un campo relacional `user: { update: { roles: ['ADMIN'] } }` llega intacto a `patientProfile.update`, cuyo modelo tiene la relación User. También puede intentarse modificar estado u otras relaciones.

Se reprodujo el paso del payload hasta Prisma con persistencia simulada; **no se ejecutó una escalada sobre PostgreSQL**. Dado el update anidado admitido por el modelo, el camino a modificar privilegios debe cerrarse antes de exponer la API. Obtener tokens nuevos haría especialmente relevante esa escritura de roles.

**Aceptación:** DTO concreto, asignación explícita de campos escalares y test HTTP/DB que demuestre que roles, status, userId y nested writes se rechazan y no cambian persistencia.

### A04 — P1: reserva no garantiza exclusividad de intervalos ni reutilización

`appointments.service.ts:47–71` consulta disponibilidad antes de la transacción; dentro solo inserta. `availability.service.ts:31` consulta turnos cuyo inicio está dentro del rango, omitiendo uno anterior que todavía se solapa. Ejemplo: turno 09:00–10:00 y nueva solicitud 09:30; si la agenda ofrece ese inicio, la consulta estrecha puede no ver la ocupación. La unique de `schema.prisma:217` solo bloquea inicio idéntico.

La misma unique incluye cancelados: cancelar o expirar 09:00 hace que disponibilidad vuelva a ofrecerlo, pero nuevo INSERT a 09:00 falla. `book` además calcula fin usando duración por defecto aunque el slot de la franja tenga otra duración.

**Aceptación:** prueba DB de solapamientos con distinto inicio, reservas simultáneas, duraciones por franja, cancelación→nueva reserva y expiración→nueva reserva. Definir garantía DB para intervalos activos y manejo de conflictos/reintentos serializables.

### A05 — P1: agenda admite estados inválidos y calcula disponibilidad incorrecta

`availability.service.ts:22–80`: no aplica EXTRA, `validFrom/validTo`, ni limita slots al rango solicitado; usa hora local del proceso, sin timezone de consultorio. Filtrar overrides DATE por el instante de reserva puede omitir el bloqueo del mismo día. La condición del while permite un slot que excede el fin de franja en ciertos límites.

`DoctorsService` filtra nombres de settings pero no valida valores ni objetos de operación Prisma; agenda acepta arrays `any`. Duración cero/negativa puede impedir avance del cursor y bloquear el proceso en el endpoint público de disponibilidad. Tampoco se validan límites de rango, formato horario, días válidos, superposición de franjas, seña positiva o coherencia requiresDeposit/amount.

Se reprodujeron slots fuera de rango y antes de validFrom. **Aceptación:** DTOs y límites de negocio; tests de huso, límites, overrides, rangos inválidos y duraciones, sin ejecutar bucles infinitos como prueba en el servidor compartido.

### A06 — P1: reembolso usa identificador incorrecto y no hay recuperación

`mercadopago.provider.ts:41` entrega `pref.id`; `payments.service.ts:38` lo guarda en providerRef; luego `provider.ts:45` lo envía como `payment_id` al refund. El webhook consulta el pago externo, pero no conserva su ID. La cancelación persiste antes del refund (`appointments.service.ts:125–136`); si falla, queda cancelada sin reembolso y un reintento de cancelación se rechaza por estado.

Checkout también crea turno y Payment antes de llamar MP, sin compensación ni endpoint de reintento. **Aceptación:** IDs separados, reembolso reintentable/idempotente y prueba con proveedor simulado más sandbox externo. No se hicieron llamadas de cobro/reembolso.

### A07 — P1: webhook/expiración no forman una máquina de estados segura

`payments.service.ts:52–68` lee estado antes de actualizar; dos eventos simultáneos pueden disparar confirmación dos veces. APPROVED se escribe sin condición sobre turno vigente: un evento tardío puede reconfirmar cancelados o expirados. No verifica importe/moneda contra Payment. El cron solo cancela Appointment, sin cambiar Payment a EXPIRED ni registrar cancelledAt. Firma no implementada.

Se reprodujo que un pago EXPIRED acepta APPROVED y solicita confirmar su turno sin comprobar estado. **Aceptación:** transiciones condicionales atómicas, deduplicación persistente, reconciliación de pagos tardíos, validación del proveedor y pruebas de carrera webhook/cancelación/cron.

### A08 — P0: callback OAuth confía en identidad elegida por quien llama

`calendar-sync.service.ts:35` usa doctorId como state; `calendar.controller.ts:29–31` lo acepta públicamente. No hay nonce aleatorio, caducidad, firma ni enlace a la sesión iniciadora. Un código OAuth válido con state de otro médico puede intentar vincular la cuenta de quien llama a ese médico; si se completa, futuros eventos incluyen nombres y motivos de pacientes.

Es un hallazgo estático de autorización; no se intentó vinculación externa. Además, se pide solo calendar.events pero se consulta userinfo/email: compatibilidad de scopes requiere revisión y prueba real. **Aceptación:** state de un solo uso ligado a usuario/sesión y prueba negativa de intercambio de doctorId; flujo externo consentido con scopes requeridos.

### A09 — P1: notificaciones declaran entrega sin envío

`notifications.processor.ts:25–55` solo loguea email/SMS y escribe SENT. SMS sin teléfono retorna sin enviar; WHATSAPP no tiene case y también termina SENT. No existe aviso de cancelación en `AppointmentsService.cancel`.

La creación de Notification y enqueue no son atómicos; si falla Redis queda QUEUED sin job y el cron puede considerarla ya enviada por existencia. Recordatorios se deduplican con lectura previa, sin constraint ni jobId estable; múltiples instancias pueden duplicarlos. La ventana es 24–25 horas, no exactamente 24.

**Aceptación:** adaptadores reales o estado explícito de simulación; outbox/reconciliación, deduplicación y pruebas de fallo de proveedor/Redis y ausencia de destinatario.

### A10 — P1: historia clínica puede persistirse sin AuditLog

`medical-records.service.ts:45–64` confirma entrada antes de llamar audit. Si audit falla, hay entrada persistida y respuesta de error; reintentar puede duplicar evolución. Se reprodujo el orden con fallo de audit simulado. Los accesos denegados/404 no generan registro.

**Aceptación:** entrada y log en la misma transacción, política explícita para intentos rechazados, prueba de rollback del conjunto e idempotencia de escritura.

### A11 — P1: enmiendas y relación clínica requieren garantías adicionales

`medical-records.service.ts:54–60` acepta amendsEntryId sin comprobar que sea de la misma historia y appointmentId sin comprobar paciente/médico. Este último es String sin FK en schema. No hay UPDATE/DELETE de entradas en la API, pero tampoco restricciones DB que impongan inmutabilidad.

La relación asistencial se define como cualquier turno, incluso pendiente/cancelado. Esto coincide con el criterio mínimo escrito, pero no asegura atención efectiva: es una decisión pendiente de política, no una infracción inventada del requisito. ADMIN tiene lectura general explícita.

**Aceptación:** referencias del mismo paciente y episodio, reglas de enmienda e inmutabilidad documentadas/aplicadas y prueba negativa de cruce entre historias.

### A12 — P1: sincronización de calendario puede duplicar/perder efectos

`calendar-sync.service.ts:86–99` hace insert externo antes del upsert local; repetir confirmación crea otro evento y reemplaza el único ID guardado. El anterior queda sin referencia para borrarlo. Errores de push/delete se loguean sin reintentos. No existe rotación del token ICS, pese a comentarios que la prometen.

**Aceptación:** job durable por transición, clave/idempotencia por turno/cuenta, reconciliación y rotación ICS que invalide token anterior. Validar privacidad de los datos incluidos en eventos/feed como decisión de producto.

### A13 — P1: fallback mezcla sesión real, errores y mutaciones demo

`apps/web/lib/api.ts:60–68` convierte errores de red, 5xx y 401 en fallback, incluso al reservar o escribir historia. Un usuario real con token vencido puede ver éxito de una mutación que solo altera memoria demo. 404/403 se propagan: una API encendida pero incompleta puede hacer que la UI funcione peor que sin API. Las sondas reprodujeron 401→demo y 404→error.

El login demo tampoco aísla solicitudes: sigue intentando API con demo-token. `auth.tsx` no consume refreshToken, no limpia QueryClient al cerrar/cambiar sesión y las query keys privadas no incluyen usuario; puede mostrarse caché del usuario anterior durante staleTime o antes del refetch. El flag demo no se restablece al login/logout.

**Aceptación:** modo demo explícito y aislado, mutaciones reales que fallen claramente, refresh de sesión y pruebas de cambio de usuario que demuestren aislamiento de caché privada.

## 4. Registro de deuda técnica

| ID / prioridad | Deuda explícita o inferida | Evidencia / criterio de cierre |
| --- | --- | --- |
| D01 / P1 | Estado ACTIVE/SUSPENDED no comprobado en login, refresh ni estrategia JWT; refresh con lectura/revocación separadas | `auth.service.ts:49–68`, `jwt.strategy.ts:16`. Dos refresh concurrentes pueden emitir sesiones nuevas; requiere consumo atómico, revocación y tests de suspensión. |
| D02 / P1 | Alta de médicos sin activación ni especialidad operativa | User default PENDING_VERIFICATION; búsqueda filtra ACTIVE; seed solo especialidades. Añadir flujo aprobado de activación/asignación y prueba de alta→búsqueda. |
| D03 / P1 | TODO firma MP | `mercadopago.provider.ts:49`; cerrar con validación y casos negativos/replay. |
| D04 / P1 | TODO Resend/Twilio y templates | `notifications.processor.ts:49,55`; no considerar logs una entrega. |
| D05 / P1 | Tests no instalados ni escritos | `apps/api/package.json` tiene Jest como script pero sin dependencia; no hay specs/tests de producto. Incorporar unit, integración DB y contratos/e2e antes de marcar núcleo completo. |
| D06 / P1 | Sin migraciones versionadas | Solo schema/seed en Prisma. Crear migración revisable y validar instalación vacía y upgrade; no usar db push como evidencia de migraciones. |
| D07 / P1 | Validación incompleta de inputs | DTOs ausentes para settings, agenda, paciente, refresh, fechas y callback. Campos string sin límites; errores Prisma sin traducción consistente. Cerrar por A03/A05 y casos negativos. |
| D08 / P1 | Simulaciones presentadas como contratos reales | `lib/demo-data.ts` muta memoria, checkoutUrl `#`; `types.ts` dice «tipos espejo» sin serlo. Separar fixtures y API real; probar persistencia tras recarga. |
| D09 / P1 | Adjuntos, PDF, paciente HC, ICS paciente y admin ausentes | Matriz de roadmap. Son desarrollo pendiente, no implementación validada por tener modelos. |
| D10 / P1 | Secretos/config sin validación temprana | Lecturas directas process.env, non-null assertions; .env.example con JWT de ejemplo y clave de cifrado cero. Validar presencia/formato y separar configuración local/producción, sin afirmar secretos reales expuestos. |
| D11 / P2 | Operación sin evidencia de CI, health/readiness, despliegue automatizado, observabilidad o restore | Inventario versionado; Docker Compose solo DB/Redis. Incorporar checks automáticos, readiness y pruebas de recuperación. Servicios externos existentes no fueron inspeccionados. |
| D12 / P2 | Paginación/retención sin diseño | Búsqueda, agenda, pacientes, historia y feed sin paginación; refresh/notifications/audit crecen sin política visible. Definir límites y retención según dominio. |
| D13 / P2 | Documentación diverge del producto | README dice frontend esqueleto; roadmap no refleja UI de ubicaciones/foto; archivo arquitectónico ausente; garantías de «imposible»/rotación ICS excesivas. Actualizar con estados auditados y criterios de aceptación. |
| D14 / P2 | Modelo de base clínica sin edición de datos estructurados | allergies/chronicConditions/currentMedication existen, pero no hay flujo de actualización auditada. Definir alcance y semántica antes de agregar edición. |

La coincidencia `TODO acceso` en el comentario de MedicalRecordsService significa «todo acceso», no un TODO pendiente de programación. No se contabilizó como marcador de deuda.

## Verificación ejecutada y límites

| Verificación | Resultado |
| --- | --- |
| Inventario y lectura de fuentes | Completados; sin suite de tests, CI ni migraciones encontradas en archivos del proyecto. |
| `tsc --noEmit --incremental false -p apps/web/tsconfig.json` | **Pasa**. No valida contratos HTTP ni comportamiento en navegador. |
| Mismo chequeo para `apps/api/tsconfig.json`, inicialmente | Falla por cliente Prisma local sin generar, no se atribuye a defectos de negocio. |
| `npm run prisma:generate --workspace apps/api` | Primer intento bloqueado por sandbox sobre caché de Prisma; repetido con permiso, **pasa** (Prisma 5.22.0). |
| Typecheck API después de generar cliente | **Pasa**. No se afirma que arranque con DB/Redis/credenciales reales. |
| `npm run test --workspace apps/api -- --runInBand` | **Falla**: `jest: command not found` (127); no hay suite ejecutable declarada completa. |
| `node docs/audit-probes.cjs` | **Pasa sus seis grupos de comprobaciones**, que confirman comportamientos defectuosos descritos. Ejecuta servicios/pipe/fallback reales con persistencia simulada. |

Las sondas están en [audit-probes.cjs](audit-probes.cjs), son reproducibles y se espera que dejen de confirmar estos defectos al corregirlos. No constituyen tests de aceptación del producto. No se hicieron migraciones, cambios de datos reales, arranque de infraestructura, pruebas de concurrencia PostgreSQL, build de producción, navegación e2e ni llamadas a Google/MP/Resend/Twilio. Las garantías que requieren esos entornos quedan explícitamente **sin verificar**; no se presentan como flujos aprobados.

## Orden de remediación propuesto

1. Cerrar autorización: A03 (mass assignment), A08 (state OAuth), estado de usuario y referencias clínicas. Validar con casos negativos sobre DB de test.
2. Restablecer contratos web/API y aislar demo: A01, A02, A13. Lograr registro→login→búsqueda→reserva→agenda real sin simulaciones.
3. Corregir integridad de turnos/pagos: A04–A07, reembolsos y expiración con pruebas concurrentes y de recuperación.
4. Hacer confiables auditoría, notificaciones y calendario: A09–A12; outbox/colas, idempotencia y pruebas de fallo.
5. Completar features ausentes y operación; actualizar roadmap solo contra criterios de aceptación y pruebas reproducibles.

No se asigna un porcentaje de completitud: contar archivos, modelos o checks produciría una precisión engañosa mientras existen bloqueos transversales.

## Seguimiento — 18 de septiembre de 2026: corrección A03

Se corrigió la actualización del paciente con `UpdatePatientDto` en el controller y una asignación explícita de seis campos en el servicio: firstName, lastName, documentId, birthDate, healthInsurance e insuranceNumber. Los campos desconocidos, incluidos roles, status, IDs y relaciones, reciben HTTP 400 antes de invocar persistencia. El servicio tampoco propaga esos campos si lo invoca directamente otro componente.

Los campos omitidos se conservan. Se rechaza null y se valida que los campos de texto sean strings; nombre y apellido no admiten cadena vacía. birthDate acepta una fecha calendario válida en formato YYYY-MM-DD. El perfil a actualizar se toma exclusivamente de la identidad autenticada.

Se agregaron 51 tests en `apps/api/test/patients-update.test.cjs`, ejecutables desde la raíz con `npm run test --workspace apps/api`. Usan el runner nativo de Node y ts-node ya instalado, reemplazando el script Jest que no tenía dependencia ni suite. Cubren HTTP con controller/guard JWT/ValidationPipe/servicio reales y persistencia simulada: actualización completa/parcial, campos prohibidos, operaciones anidadas, tipos y fechas inválidas, autenticación y defensa del servicio. Resultado: **51/51 pasan**, y typecheck del backend pasa. El sandbox requirió permiso para el puerto HTTP temporal local.

La sonda de A03 ahora verifica que no se propague la relación user. No se ejecutó una prueba PostgreSQL: la comprobación de HTTP verifica que los payloads rechazados nunca llaman a Prisma. El resto del informe conserva el diagnóstico original; esta corrección no implica resolver los otros hallazgos ni completar la infraestructura integral de tests de D05.
