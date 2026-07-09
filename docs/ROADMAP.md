# Roadmap de implementación

## Fase 1 — Núcleo funcional (semanas 1-3)
- [x] Modelo de datos completo (Prisma)
- [x] Auth con roles (JWT + refresh rotativo)
- [x] Agenda del médico + cálculo de disponibilidad
- [x] Reserva de turno anti doble-booking
- [ ] Frontend: registro/login, búsqueda de médicos, selección de slot
- [ ] Frontend: vista calendario del paciente y del médico (sugerido: FullCalendar o react-big-calendar)
- [ ] Tests: AvailabilityService (unit) + flujo de reserva (e2e con DB de test)

## Fase 2 — Pagos y notificaciones (semanas 3-5)
- [x] Interfaz PaymentProvider + Mercado Pago (Checkout Pro)
- [x] Webhook idempotente + expiración de señas impagas (cron)
- [ ] Validar firma x-signature del webhook (MP_WEBHOOK_SECRET)
- [ ] Integrar Resend (email) y Twilio (SMS) en NotificationsProcessor
- [ ] Templates de email (confirmación, recordatorio 24h, cancelación)

## Fase 3 — Historia clínica completa (semanas 5-7)
- [x] Entradas inmutables + enmiendas + auditoría
- [ ] Upload de adjuntos a Cloudflare R2 (presigned URLs, nunca pasar el archivo por la API)
- [ ] Frontend: vista de historia clínica para médico y paciente
- [ ] Export PDF de historia clínica (requisito frecuente)

## Fase 4 — Calendarios (semanas 7-8)
- [x] OAuth Google Calendar (tokens cifrados) + push/delete de eventos
- [x] Feed .ics para Apple Calendar / Outlook
- [ ] Mover sync de calendario a cola BullMQ con reintentos (hoy es best-effort inline)
- [ ] Botón "Agregar a mi calendario" para el PACIENTE (archivo .ics por turno, sin OAuth)

## Fase 5 — Producción
- [ ] Sentry + logs estructurados (Axiom/Better Stack)
- [ ] Rate limiting (@nestjs/throttler) en auth y endpoints públicos
- [ ] Backups automáticos de DB + prueba de restore
- [ ] Términos, consentimiento de datos de salud (Ley 25.326 AR + habilitación de historia clínica digital Ley 26.529/27.706)
- [ ] Panel admin (verificación de matrículas de médicos antes de activar perfiles)

## Deuda técnica aceptada (a propósito)
- El frontend es un esqueleto: la prioridad fue que el dominio de backend quede bien diseñado primero.
- Google OAuth para *login* de usuarios (además de calendario) queda para cuando haya tracción.
- No hay multi-consultorio/clínicas (un médico = una agenda). El modelo lo soporta agregando una entidad `Location` si hace falta.
