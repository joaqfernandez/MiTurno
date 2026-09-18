# Plataforma de Turnos Médicos

Sistema de reserva de turnos médicos con historia clínica, roles paciente/médico, calendario sincronizable (Google Calendar + feed `.ics` para iPhone/Outlook) y cobro de seña opcional vía Mercado Pago.

Stack: **NestJS + Prisma + PostgreSQL** (backend) · **Next.js + Tailwind** (frontend) · **Redis + BullMQ** (colas). Las decisiones y sus alternativas están documentadas en `arquitectura-stack-turnos-medicos.md` del proyecto.

---

## Estructura del monorepo

```
turnos-medicos/
├── apps/
│   ├── api/                      # Backend NestJS (monolito modular)
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # ★ Modelo de datos completo — leer primero
│   │   │   └── seed.ts           # Especialidades iniciales
│   │   └── src/
│   │       ├── common/           # Guards, decorators, CryptoService (AES-256-GCM)
│   │       ├── prisma/           # PrismaService global
│   │       └── modules/          # Un módulo = un dominio de negocio
│   │           ├── auth/             # Registro/login/refresh (JWT + rotación)
│   │           ├── users/            # /users/me
│   │           ├── doctors/          # Búsqueda pública, config de agenda y seña
│   │           ├── patients/         # Perfil paciente + "mis pacientes" (médico)
│   │           ├── appointments/     # ★ Disponibilidad + reserva anti doble-booking
│   │           ├── medical-records/  # ★ Historia clínica inmutable + auditoría
│   │           ├── payments/         # ★ Interfaz PaymentProvider → Mercado Pago
│   │           ├── calendar/         # Google Calendar OAuth + feed .ics
│   │           └── notifications/    # Colas BullMQ + crons (recordatorios, expiración de señas)
│   └── web/                      # Frontend Next.js (esqueleto)
├── docs/ROADMAP.md               # Fases de implementación
├── docker-compose.yml            # Postgres + Redis locales
└── .env.example                  # Todas las variables necesarias
```

## Puesta en marcha

Requisitos: Node 20+, Docker.

```bash
# 1. Infraestructura local
docker compose up -d

# 2. Variables de entorno
cp .env.example apps/api/.env

# 3. Dependencias
npm install

# 4. Base de datos
cd apps/api
npx prisma migrate dev --name init
npx prisma generate
npm run seed

# 5. Levantar todo (desde la raíz)
npm run dev:api    # http://localhost:3000/api
npm run dev:web    # http://localhost:3001
```

## Flujos principales

### Reserva de turno (con o sin seña)

```
Paciente elige slot → POST /appointments
  ├─ médico SIN seña → estado CONFIRMED → notificaciones + sync calendario
  └─ médico CON seña → estado PENDING_PAYMENT → checkoutUrl de Mercado Pago
        └─ webhook MP aprobado → CONFIRMED → notificaciones + sync
        └─ 30 min sin pagar → cron libera el slot automáticamente
```

La doble reserva es **imposible por diseño**: transacción `SERIALIZABLE` + constraint único `(doctorId, startAt)` en base de datos. Si dos pacientes confirman a la vez, uno recibe `409 Conflict`.

### Disponibilidad

Los slots **no se materializan en DB**: se calculan en runtime desde la agenda recurrente (`DoctorSchedule`), las excepciones (`ScheduleOverride`: vacaciones, feriados, días extra) y los turnos ya tomados. Un cambio de agenda del médico impacta al instante.

### Historia clínica

- Entradas **inmutables** (append-only): nunca se editan ni borran; una corrección es una *enmienda* que referencia a la original. Requisito médico-legal.
- Acceso: el paciente lee lo suyo; el médico lee/escribe **solo si tiene relación asistencial** (al menos un turno con ese paciente).
- **Todo acceso queda auditado** en `AuditLog` (quién, qué, cuándo, desde qué IP).
- Adjuntos (estudios, imágenes) van a storage S3-compatible por URL firmada; en DB solo se guarda la key.

### Calendario en el celular

- **Google Calendar**: el médico conecta su cuenta por OAuth (`GET /calendar/google/connect`). Los tokens se guardan **cifrados** (AES-256-GCM). Cada turno confirmado se crea/borra en su Google Calendar.
- **iPhone / Apple Calendar / Outlook**: suscripción estándar `.ics` — `webcal://tu-api/api/calendar/feed/{token}.ics`. Sin OAuth, se actualiza sola, y el token es rotable si se filtra.

### Seña configurable por médico

Cada médico decide en su perfil: `requiresDeposit`, `depositAmount`, `cancellationWindowHours`. Si el paciente cancela dentro de la ventana permitida (o cancela el médico), la seña se **reembolsa automáticamente**. El proveedor de pagos está detrás de la interfaz `PaymentProvider`: agregar Stripe mañana no toca ni una línea fuera del módulo `payments`.

## API — endpoints principales

Para configurar el ingreso con Google y la conexión segura de Calendar, ver
[Google OAuth](docs/google-oauth.md).

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | — | Registro (rol PATIENT o DOCTOR) |
| POST | `/api/auth/login` | — | Login → access + refresh token |
| GET | `/api/doctors?specialty=&q=` | — | Búsqueda pública de médicos |
| GET | `/api/appointments/availability/:doctorId?from=&to=` | — | Slots disponibles |
| POST | `/api/appointments` | Paciente | Reservar turno |
| GET | `/api/appointments/me?from=&to=` | Ambos | Mi agenda (paciente o médico) |
| DELETE | `/api/appointments/:id` | Ambos | Cancelar (con política de reembolso) |
| GET | `/api/patients/of-my-practice` | Médico | Historial de mis pacientes |
| GET | `/api/medical-records/:patientId` | Según regla | Leer historia clínica (auditado) |
| POST | `/api/medical-records/entries` | Médico | Nueva evolución / enmienda |
| PATCH | `/api/doctors/:id/settings` | Médico | Config de seña, duración de turno, etc. |
| PUT | `/api/doctors/:id/schedule` | Médico | Definir agenda semanal |
| GET | `/api/calendar/google/connect` | Médico | Iniciar OAuth con Google |
| GET | `/api/calendar/feed/:token.ics` | Token | Feed para Apple/Outlook |
| POST | `/api/payments/webhooks/mercadopago` | Firma | Webhook de Mercado Pago |

## Deploy sugerido (etapa inicial)

- **API**: Railway o Render (con el Redis administrado del mismo proveedor).
- **DB**: Neon o Supabase (Postgres administrado, con branching para testing).
- **Web**: Vercel.
- **Storage**: Cloudflare R2.
- Configurar `MP_ACCESS_TOKEN` de producción y el `notification_url` público del webhook.

## Pendientes conscientes (ver docs/ROADMAP.md)

- Validación de firma `x-signature` del webhook de MP (marcado con TODO).
- Integración real de Resend/Twilio en `NotificationsProcessor` (hoy loguea).
- Upload de adjuntos a R2 con URLs firmadas (modelo `Attachment` ya listo).
- Frontend: pantallas de búsqueda, reserva, panel médico y paciente.
- Tests: unit de `AvailabilityService` y e2e del flujo de reserva son los primeros a escribir.
