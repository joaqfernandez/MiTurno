# Camino a la beta cerrada

Checklist para que un grupo pequeño de médicos use MiTurno con pacientes reales. Relevado el 2026-09-22 sobre el código y los documentos del repositorio. **Al completar un punto, marcarlo, agregar la evidencia (PR, commit o prueba) y registrarlo en [CAMBIOS.md](../CAMBIOS.md).**

## Decisiones tomadas y abiertas

- [x] **Primero staging, después producción.** Staging = la app en internet con datos ficticios; permite validar Google, email y despliegue sin riesgo legal.
- [ ] **¿La beta incluye historia clínica?** Recomendación: beta de 3–5 médicos solo con agenda y turnos; sumar historia clínica cuando la parte legal esté resuelta. Pendiente de decisión del fundador.
- [x] **Proveedor de hosting: Railway, plan Hobby** (decisión del fundador, 2026-11-13). Web, API, worker, PostgreSQL y backup en Railway; backups en Cloudflare R2. Guía completa: [DEPLOY.md](DEPLOY.md). La región de producción sigue pendiente del abogado (Fase 0).

## Fase 0 — Legal (en paralelo desde ya; depende de un abogado, no del código)

Los datos de salud son datos sensibles (Ley 25.326) y la historia clínica tiene reglas propias (Ley 26.529). Nada de esta sección debe resolverlo una IA por su cuenta.

- [ ] Consulta con abogado especializado en datos personales y salud.
- [ ] Términos y condiciones y política de privacidad (páginas en la web y aceptación al registrarse). Hay borradores de los términos, la política de privacidad y el consentimiento en [docs/legal/](legal/README.md), sin revisión legal. La aceptación ya funciona (2026-11-10): casillas en el registro y pantalla obligatoria para cuentas sin aceptar, incluidas las de Google. Falta publicar los textos aprobados en `apps/web/app/legal/page.tsx` y cambiar `TERMS_VERSION` en `apps/api-python/app/legal.py` (hoy `borrador-1`), lo que vuelve a pedir la aceptación a todas las cuentas.
  - La política de privacidad debe mencionar que los registros técnicos (logs) guardan la IP y la ruta de cada pedido, para seguridad y límite de solicitudes, sin datos clínicos. Definir con el abogado cuánto tiempo se conservan.
- [ ] Consentimiento del paciente para el tratamiento de datos de salud.
- [ ] Acuerdo con los médicos: quién es responsable de los datos y quién los trata.
- [ ] Inscripción de la base de datos ante la AAIP.
- [ ] Confirmar si los servidores pueden estar fuera de Argentina (transferencia internacional) antes de elegir región de hosting para producción.

## Fase 1 — Seguridad del código

- [x] **Actualizar Next.js.** `npm audit --omit=dev` (2026-09-22): 1 crítica (`next`), 2 altas (`postcss`, `nanoid`). Resuelto el 2026-09-25: Next 16.3.6 y React 19.3; `npm audit` sin vulnerabilidades. Rama `deps/actualiza-nextjs`.
- [x] **Recuperar contraseña** por email con token de un solo uso y expiración. Hecho el 2026-09-26, rama `feature/recuperar-contrasena-verificar-email`; defensas y tests en `apps/api-python/README.md`.
- [x] **Verificación de email** al registrarse. Mismo cambio: sin email confirmado no se puede ingresar. El envío real depende de «Email real con Resend» (Fase 2).
- [x] **Dependencias sin vulnerabilidades conocidas** al 2026-11-10: Next 16.4.6 (10 avisos nuevos, 1 crítico), PyJWT, certifi y dnspython. `npm audit` y `pip-audit` en 0. Hay que repetirlo antes de cada despliegue hasta automatizarlo (ver pendientes en [CI.md](CI.md)).
- [x] **Cabeceras de seguridad en la web** (2026-11-10): política de contenido (CSP), HSTS, sin marcos de otros sitios; `e2e/security-headers.spec.ts`. La API no publica `/docs` ni `/openapi.json` en producción.
- [x] Revisar que logs y errores no incluyan datos personales ni clínicos. Hecho el 2026-09-27, rama `seguridad/logs-sin-datos-sensibles`: errores de la base sin valores, log de acceso sin query ni token del feed ICS y errores inesperados registrados sin su mensaje (`test_logs.py`). El log de acceso conserva la IP (necesaria para seguridad): mencionarlo en la política de privacidad.

## Fase 2 — Infraestructura (staging primero)

Hay que correr cuatro piezas: web Next.js, API FastAPI, worker Python (`npm run worker:api`) y PostgreSQL 16, más el backup diario. Los archivos de despliegue están en el repositorio desde el 2026-11-13 (rama `deploy/railway`) y el paso a paso en [DEPLOY.md](DEPLOY.md). **Todavía no hay nada desplegado**: los puntos sin marcar dependen de crear las cuentas, cargar los secretos y probar en staging.

> **Plan Hobby y backups.** El plan Hobby no incluye restauración a un punto en el tiempo (PITR). Se reemplaza por un **backup diario cifrado a Cloudflare R2**: en el peor caso se pierde hasta 1 día de datos. El PITR llega al pasar al plan Pro.

- [ ] Elegir proveedor y crear **staging** con dominio propio y HTTPS.
- [ ] Postgres gestionado con **backups automáticos** y restauración a un punto en el tiempo. Con el plan Hobby: backup diario cifrado a R2 en lugar de PITR (ver nota). El servicio de backup está escrito y probado en local (`infra/backup/`, `scripts/test-backup-restore.sh`: copia, cifra con age, restaura y compara filas, triggers y restricciones; 2026-11-13). Falta crearlo en Railway con el bucket de R2, la regla de borrado a 30 días y una alerta si falla.
- [ ] **Probar una restauración** de backup y documentar el procedimiento. Documentado en [DEPLOY.md](DEPLOY.md#restaurar-un-backup) y automatizado en `scripts/restore-backup.sh` (probado en local con un backup de prueba, 2026-11-13). Falta el simulacro con un backup real de staging.
- [ ] Migraciones automáticas en cada despliegue (`alembic upgrade head`) antes de levantar la API. Preparado: va como *Pre-deploy Command* del servicio `api` ([DEPLOY.md](DEPLOY.md), Paso 4); se probó que la imagen corre las migraciones (2026-11-13). Falta cargarlo en Railway y verlo funcionar.
- [ ] Secretos solo en el proveedor: `APP_ENV=production`, `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` (la app no arranca si faltan o son inválidos, ver `test_config.py`). Staging también necesita Resend desde el primer día.
- [ ] Despliegue automático desde `main` cuando el CI está en verde. Se resuelve con la opción *Wait for CI* de Railway ([DEPLOY.md](DEPLOY.md), Paso 7). Falta activarla y decidir si producción se despliega sola o a mano.
- [ ] **Monitoreo de errores** (por ejemplo Sentry) y alerta de caída sobre `/api/health`.
- [ ] Email real con Resend y dominio verificado (SPF/DKIM).
- [ ] Una sola instancia de API en la beta: el rate limiting actual es en memoria por proceso. La imagen corre un solo proceso (`apps/api-python/Dockerfile`, sin `--workers`); falta fijar *Replicas = 1* en Railway.
- [x] Decidir cómo llega el navegador a la API: **directo** (decisión del fundador, 2026-11-13). La imagen de la web exige `NEXT_PUBLIC_API_URL` al compilar y no compila sin ella (`apps/web/Dockerfile`). Opciones evaluadas: llamándola directo (`NEXT_PUBLIC_API_URL=https://api.miturnosapp.com`, recomendado) o por el proxy `/api` de la web. Con el proxy, la API ve la IP del servidor web en lugar de la del usuario y el límite por IP de `/api/auth` (30 por minuto) se comparte entre todos.
- [ ] Configurar la API para leer la IP real detrás del proxy del hosting (uvicorn `--proxy-headers` y `--forwarded-allow-ips` con la IP del proxy). Configurado en `apps/api-python/Dockerfile` (2026-11-13) con `*`, porque Railway no publica las direcciones de su proxy. **Falta verificarlo en staging** ([DEPLOY.md](DEPLOY.md), «Verificar la IP real»): Railway documenta la cabecera `X-Real-IP` y uvicorn lee `X-Forwarded-For`; si no coinciden hace falta un cambio en la API. Sin esto todos los pedidos parecen venir de la misma IP y el límite por IP de `/api/auth` deja de servir.

### Criterios para elegir hosting

- Que corra un proceso worker permanente además de la API (descarta opciones solo serverless para el backend).
- Postgres gestionado con backups y restauración a un punto en el tiempo incluidos.
- Región: para staging cualquiera; para producción, según lo que diga el abogado (Fase 0).
- Costo bajo en staging; escalado simple después.
- Combinación habitual a evaluar: web en Vercel; API y worker en Railway, Render o Fly.io; Postgres gestionado del mismo proveedor o Neon/Supabase. Comparar precio y región al momento de decidir.

## Fase 3 — Producto mínimo para médicos

- [x] Pantalla de **excepciones de agenda** (vacaciones, días libres). Hecho el 2026-09-27, rama `feature/excepciones-agenda`: `/panel/dias-libres`, rangos de fechas, días completos u horas. Si hay turnos activos en esas fechas no se bloquea: se listan y el médico los cancela desde la misma pantalla (decisión del fundador; nada se cancela automáticamente). Las franjas extra (EXTRA) siguen solo por API.
- [ ] Revisar zonas horarias en la UI. La API ya está probada (`test_timezones.py`); la web muestra las horas en la zona del navegador, no en la del médico. Con médicos y pacientes en Argentina se ve bien; falla si alguien reserva desde otro país.
- [ ] **Login con Google** validado con credenciales reales en staging.
- [ ] Canal de feedback visible para los médicos (formulario o contacto directo). Falta definir una dirección de soporte: el email «Tu contraseña cambió» dice «avisá a soporte» sin indicar a dónde.
- [ ] Onboarding: el administrador aprueba a cada médico (ya existe en `/admin`).
- [x] Seña con Mercado Pago **desactivada** en la beta. Hecho el 2026-11-10, rama `chore/preparacion-produccion`: sin `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` la API rechaza activar la seña (`test_hallazgos::test_deposit_cannot_be_enabled_without_payment_provider`). Para la beta alcanza con no cargar esas variables. Antes el médico podía activarla igual y sus pacientes recibían un error al reservar.

## Fase 4 — Lanzamiento de la beta

- [ ] Producción creada con lo aprendido en staging.
- [ ] Crear la cuenta del administrador con `npm run admin:create -- email` (ver [README](../README.md)); el administrador demo no existe en producción.
- [ ] Seed demo bloqueado en producción (ya garantizado por `test_seed.py` y `test_config.py`).
- [ ] 3–5 médicos invitados y aprobados manualmente.
- [ ] Revisión semanal de errores, feedback y backups.

## Puede esperar hasta después de la beta

Pagos con Mercado Pago, adjuntos y PDF, WhatsApp/SMS, rate limiting compartido entre réplicas, pruebas de carga, seed grande, registro de accesos denegados.

## Qué ya está listo

Flujos de registro, login, agenda, reserva, cancelación e historia clínica con pruebas automáticas; integridad en PostgreSQL (sin turnos solapados, historia inmutable); suspensión de usuarios; validación de configuración de producción; CI en cada PR. Detalle: [COBERTURA_HALLAZGOS.md](COBERTURA_HALLAZGOS.md) y [CI.md](CI.md).
