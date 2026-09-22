# Instrucciones para todo el repositorio

- Escribir en español los mensajes de commit, tanto el título como el cuerpo cuando lo haya. Conservar nombres técnicos, identificadores y rutas cuando corresponda.

## Contexto del proyecto

MiTurno es una startup de un único fundador, que aprende sobre la marcha. **Todo el código lo escriben agentes de IA** (Claude Code, Codex); el fundador no revisa el código línea por línea. El producto maneja datos de salud y apunta a escala nacional.

Consecuencias para cualquier agente que trabaje acá:

- **No afirmar que algo funciona sin evidencia.** Al reportar, decir exactamente qué comandos de prueba se corrieron, cuántos pasaron, cuántos se omitieron y qué no se verificó.
- **Explicar en lenguaje simple** qué se cambió y por qué; proponer el plan antes de cambios grandes.
- **Las pruebas son la memoria del proyecto.** Cada test protege una decisión o un error ya corregido. No borrar ni debilitar un test para que un cambio pase; si un test parece incorrecto, explicarlo y consultar.
- **No romper las garantías centrales:** sin turnos solapados; historia clínica y auditoría inmutables; identidad y roles leídos de la base, nunca del cliente; usuarios suspendidos sin sesión; un error de la API nunca se muestra como éxito simulado.

## Antes de trabajar

- Estado y deuda: [README.md](README.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/MIGRACION_PYTHON.md](docs/MIGRACION_PYTHON.md).
- `docs/AUDITORIA.md` es histórica (backend NestJS retirado); sus rutas de archivo ya no existen.
- Backend en `apps/api-python` (FastAPI, SQLAlchemy, Alembic); web en `apps/web` (Next.js).

## Base de datos y migraciones

- Todo cambio en `app/models.py` requiere una **migración Alembic nueva** en `apps/api-python/migrations/versions/`, con `downgrade`. Nunca editar una migración ya commiteada.
- La base demo (`miturno_python`) es para pruebas manuales; los tests nunca la usan: crean y eliminan sus propias bases temporales.

## Pruebas

| Comando | Qué verifica |
| --- | --- |
| `npm run test:api` | API con SQLite temporal (omite los tests PostgreSQL) |
| `npm run test:api:pg` | API completa, incluidos concurrencia y triggers en PostgreSQL (requiere Docker) |
| `npm run test:web` | Cliente HTTP y sesión de la web |
| `npm run test:e2e` | Recorridos de navegador con API y base reales |
| `npm run build:web` | Compilación de producción de Next.js |

Un cambio de backend no está verificado si solo se corrió `test:api`: los tests PostgreSQL cubren las garantías de concurrencia.

## Trabajo en curso (septiembre 2026)

Se está incorporando verificación automática: comando para correr los tests PostgreSQL sin omitirlos, chequeo automático de migraciones y ejecución de todas las suites en GitHub Actions en cada push. Al completarse, actualizar esta sección y la forma de trabajo (ramas y pull requests con CI en verde antes de mezclar a `main`).
