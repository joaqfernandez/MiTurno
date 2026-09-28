# Registro de cambios

Una línea por cambio, **la más reciente arriba**. Todo agente (o persona) que modifique el repositorio agrega su entrada en el mismo commit del cambio.

Formato: `AAAA-MM-DD HH:MM (hora Argentina) · quién · qué cambió, muy resumido · commit o rama`

---

- 2026-09-28 18:11 · Claude Code · `.env.example` reescrito: todas las variables en uso (API y web), cuáles son obligatorias en producción, sin valores secretos y con aviso de repo público; `test_env_example.py` lo protege · rama `chore/env-example`
- 2026-09-28 14:52 · Claude Code · Botón «Cancelar» en la agenda del médico con motivo opcional; los avisos de turnos muestran médico y hora local del médico (antes UTC), el motivo si cancela el médico y el link al panel para el médico · rama `feature/medico-cancela-turnos`
- 2026-09-28 14:42 · Claude Code · Tests de zona horaria (otras zonas, cambios de horario de verano, fecha local en Auckland) y corrección: `UTCDateTime` normaliza a UTC al escribir y comparar; en SQLite un bloqueo en zonas lejanas no detectaba turnos reservados (PostgreSQL no estaba afectado) · rama `tests/zonas-horarias`
- 2026-09-28 14:29 · Claude Code · Búsqueda de médicos: filtros en la base (antes la especialidad se filtraba después de cortar en 500), el texto también busca por especialidad, páginas de 12 con total; `/medicos` con estado de error y «Reintentar», paginación en la URL y aviso de página sin resultados · rama `feature/busqueda-medicos`
- 2026-09-27 17:12 · Claude Code · Link propio de cada médico (`/<nombre>`): nombre automático con nombre y apellido o especialidad, el médico lo cambia desde Configuración, los links viejos redirigen y nunca se reasignan, el administrador asigna los que chocan, sin indexar (migración 0007); la agenda de reserva pasa a `components/doctor-booking.tsx` · rama `feature/link-medico`
- 2026-09-27 15:22 · Claude Code · Pantalla «Días libres» para vacaciones y días libres: bloqueos por rango de fechas (migración 0006), la API rechaza bloquear días con turnos activos y los lista para que el médico los cancele desde ahí; ideas del link del médico y la marca anotadas en ROADMAP · rama `feature/excepciones-agenda`
- 2026-09-27 14:50 · Claude Code · BETA.md: pendiente legal de mencionar la IP en los logs en la política de privacidad · rama `seguridad/logs-sin-datos-sensibles`
- 2026-09-27 14:48 · Claude Code · API: un error inesperado responde 500 genérico con CORS y se registra sin su mensaje (solo tipo, ruta y líneas de código); dos tests de historia clínica verifican el 500 en vez de la excepción, con permiso del fundador · rama `seguridad/logs-sin-datos-sensibles`
- 2026-09-27 14:41 · Claude Code · API: errores de SQLAlchemy sin valores de la consulta (`hide_parameters`) y log de acceso sin query ni token del feed ICS; `test_logs.py` · rama `seguridad/logs-sin-datos-sensibles`
- 2026-09-26 00:12 · Claude Code · Web: pantallas de recuperar contraseña, nueva contraseña y confirmar email; registro sin sesión hasta confirmar; recorridos Playwright; límite de `/api/auth` configurable solo para e2e y con test · rama `feature/recuperar-contrasena-verificar-email`
- 2026-09-26 00:05 · Claude Code · API: recuperar contraseña y verificar email con links de un solo uso (migración 0005), registro y login sin revelar cuentas, buzón local de desarrollo · rama `feature/recuperar-contrasena-verificar-email`
- 2026-09-25 22:29 · Claude Code · Actualiza Next.js 14 → 16 y React 18 → 19 (vulnerabilidad crítica); `npm audit` en 0, `next-env.d.ts` fuera del repo y generado en el CI · rama `deps/actualiza-nextjs`
- 2026-09-22 22:45 · Claude Code · Agrega `docs/BETA.md`: checklist por fases para la beta cerrada (legal, seguridad, hosting, producto) · rama `docs/checklist-beta`
- 2026-09-22 22:20 · Claude Code · CI sin checks duplicados: los tres jobs corren una vez por PR y al mezclar en `main` · rama `ci/sin-checks-duplicados`
- 2026-09-22 21:45 · Claude Code · Tests de hallazgos sin cobertura (`test_hallazgos.py`, `test_config.py`), corrige validación de `APP_ENV` y `ENCRYPTION_KEY` (D10) y agrega `docs/COBERTURA_HALLAZGOS.md` · rama `tests/cobertura-hallazgos`
- 2026-09-22 21:10 · Claude Code · Corrige test PostgreSQL intermitente (falla ~50%, detectado por el primer run del CI) y actualiza acciones del workflow · rama `ci/github-actions`
- 2026-09-22 20:55 · Claude Code · Crea este registro de cambios y la regla en AGENTS.md · rama `ci/github-actions`
- 2026-09-22 20:51 · Claude Code · CI con GitHub Actions (API+PG y web en cada push; Playwright en PR) y `docs/CI.md` · `155f7ec`
- 2026-09-22 20:48 · Claude Code · Test que verifica que las migraciones coinciden con los modelos y son reversibles · `613d0b0`
- 2026-09-22 20:47 · Claude Code · Contexto para IAs en AGENTS.md y comando `npm run test:api:pg` · `f76e99f`
- 2026-09-22 20:22 · Claude Code · Commit del rediseño de la página de inicio (hecho en una sesión anterior) · `e5df3e7`

Historia anterior a este registro: `git log`.
