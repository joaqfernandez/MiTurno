# Camino a la beta cerrada

Checklist para que un grupo pequeño de médicos use MiTurno con pacientes reales. Relevado el 2026-09-22 sobre el código y los documentos del repositorio. **Al completar un punto, marcarlo, agregar la evidencia (PR, commit o prueba) y registrarlo en [CAMBIOS.md](../CAMBIOS.md).**

## Decisiones tomadas y abiertas

- [x] **Primero staging, después producción.** Staging = la app en internet con datos ficticios; permite validar Google, email y despliegue sin riesgo legal.
- [ ] **¿La beta incluye historia clínica?** Recomendación: beta de 3–5 médicos solo con agenda y turnos; sumar historia clínica cuando la parte legal esté resuelta. Pendiente de decisión del fundador.
- [ ] **Proveedor de hosting.** Ver criterios más abajo.

## Fase 0 — Legal (en paralelo desde ya; depende de un abogado, no del código)

Los datos de salud son datos sensibles (Ley 25.326) y la historia clínica tiene reglas propias (Ley 26.529). Nada de esta sección debe resolverlo una IA por su cuenta.

- [ ] Consulta con abogado especializado en datos personales y salud.
- [ ] Términos y condiciones y política de privacidad (páginas en la web y aceptación al registrarse).
- [ ] Consentimiento del paciente para el tratamiento de datos de salud.
- [ ] Acuerdo con los médicos: quién es responsable de los datos y quién los trata.
- [ ] Inscripción de la base de datos ante la AAIP.
- [ ] Confirmar si los servidores pueden estar fuera de Argentina (transferencia internacional) antes de elegir región de hosting para producción.

## Fase 1 — Seguridad del código

- [x] **Actualizar Next.js.** `npm audit --omit=dev` (2026-09-22): 1 crítica (`next`), 2 altas (`postcss`, `nanoid`). Resuelto el 2026-09-25: Next 16.3.6 y React 19.3; `npm audit` sin vulnerabilidades. Rama `deps/actualiza-nextjs`.
- [x] **Recuperar contraseña** por email con token de un solo uso y expiración. Hecho el 2026-09-26, rama `feature/recuperar-contrasena-verificar-email`; defensas y tests en `apps/api-python/README.md`.
- [x] **Verificación de email** al registrarse. Mismo cambio: sin email confirmado no se puede ingresar. El envío real depende de «Email real con Resend» (Fase 2).
- [ ] Revisar que logs y errores no incluyan datos personales ni clínicos.

## Fase 2 — Infraestructura (staging primero)

Hoy no hay ningún archivo de despliegue en el repositorio. Hay que correr cuatro piezas: web Next.js, API FastAPI, worker Python (`npm run worker:api`) y PostgreSQL 16.

- [ ] Elegir proveedor y crear **staging** con dominio propio y HTTPS.
- [ ] Postgres gestionado con **backups automáticos** y restauración a un punto en el tiempo.
- [ ] **Probar una restauración** de backup y documentar el procedimiento.
- [ ] Migraciones automáticas en cada despliegue (`alembic upgrade head`) antes de levantar la API.
- [ ] Secretos solo en el proveedor: `APP_ENV=production`, `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` (la app no arranca si faltan o son inválidos, ver `test_config.py`). Staging también necesita Resend desde el primer día.
- [ ] Despliegue automático desde `main` cuando el CI está en verde.
- [ ] **Monitoreo de errores** (por ejemplo Sentry) y alerta de caída sobre `/api/health`.
- [ ] Email real con Resend y dominio verificado (SPF/DKIM).
- [ ] Una sola instancia de API en la beta: el rate limiting actual es en memoria por proceso.
- [ ] Configurar la API para leer la IP real detrás del proxy del hosting (uvicorn `--proxy-headers` y `--forwarded-allow-ips` con la IP del proxy). Sin esto todos los pedidos parecen venir de la misma IP y el límite por IP de `/api/auth` deja de servir.

### Criterios para elegir hosting

- Que corra un proceso worker permanente además de la API (descarta opciones solo serverless para el backend).
- Postgres gestionado con backups y restauración a un punto en el tiempo incluidos.
- Región: para staging cualquiera; para producción, según lo que diga el abogado (Fase 0).
- Costo bajo en staging; escalado simple después.
- Combinación habitual a evaluar: web en Vercel; API y worker en Railway, Render o Fly.io; Postgres gestionado del mismo proveedor o Neon/Supabase. Comparar precio y región al momento de decidir.

## Fase 3 — Producto mínimo para médicos

- [ ] Pantalla de **excepciones de agenda** (vacaciones, días libres). Roadmap: incompleta.
- [ ] Revisar zonas horarias en la UI.
- [ ] **Login con Google** validado con credenciales reales en staging.
- [ ] Canal de feedback visible para los médicos (formulario o contacto directo).
- [ ] Onboarding: el administrador aprueba a cada médico (ya existe en `/admin`).
- [ ] Seña con Mercado Pago **desactivada** en la beta (hoy los médicos pueden no exigir seña).

## Fase 4 — Lanzamiento de la beta

- [ ] Producción creada con lo aprendido en staging.
- [ ] Seed demo bloqueado en producción (ya garantizado por `test_seed.py` y `test_config.py`).
- [ ] 3–5 médicos invitados y aprobados manualmente.
- [ ] Revisión semanal de errores, feedback y backups.

## Puede esperar hasta después de la beta

Pagos con Mercado Pago, adjuntos y PDF, WhatsApp/SMS, rate limiting compartido entre réplicas, pruebas de carga, seed grande, registro de accesos denegados.

## Qué ya está listo

Flujos de registro, login, agenda, reserva, cancelación e historia clínica con pruebas automáticas; integridad en PostgreSQL (sin turnos solapados, historia inmutable); suspensión de usuarios; validación de configuración de producción; CI en cada PR. Detalle: [COBERTURA_HALLAZGOS.md](COBERTURA_HALLAZGOS.md) y [CI.md](CI.md).
