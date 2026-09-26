# Verificación automática (CI)

Registro vivo de la infraestructura de pruebas. **Cualquier agente que cambie tests, migraciones o el workflow debe actualizar este archivo**, incluida la bitácora al final.

## Por qué existe

El código de MiTurno lo escriben agentes de IA y el fundador no lo revisa línea por línea. Las pruebas guardan las decisiones y los errores ya corregidos; el CI las ejecuta en cada cambio sin depender de lo que un agente informe. Un ✅ no certifica seguridad ni prueba proveedores reales: solo indica que lo testeado sigue funcionando.

## Qué corre y cuándo

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

| Job | Qué ejecuta | Equivalente local |
| --- | --- | --- |
| API (SQLite + PostgreSQL) | Suite Python completa contra Postgres 16 en contenedor del CI; incluye `test_migrations.py` | `npm run test:api:pg` |
| Web (tests, tipos y build) | `test:web`, `tsc --noEmit`, `next build` | mismos comandos |
| Navegador (Playwright) | Recorridos reales con API y SQLite temporal; si falla sube trazas como artefacto `playwright-trazas` | `npm run test:e2e` |

Los tres jobs corren juntos, una vez, en cada pull request hacia `main` (y en cada push nuevo a ese PR) y al mezclar en `main`. Un push a una rama sin PR no dispara el CI.

Los resultados se ven en la pestaña **Actions** del repositorio y como ✅/❌ en cada commit y PR. El repositorio es público: los resultados también se pueden leer sin autenticación en `https://api.github.com/repos/joaqfernandez/MiTurno/actions/runs`.

## Forma de trabajo acordada

1. Cada tarea en una rama propia; nada se commitea directo en `main`.
2. Push de la rama y PR hacia `main` → corren los tres jobs.
3. Mezclar solo con todo en ✅. Si algo falla, corregir la causa; nunca borrar ni debilitar un test para pasar.

## Garantías de migraciones (`apps/api-python/tests/test_migrations.py`)

- Una sola cadena lineal de revisiones Alembic (sin cabezas duplicadas).
- El esquema que generan las migraciones coincide con `app/models.py`.
- Cada migración se puede revertir y reaplicar; el downgrade total no deja tablas.

Se verificó que fallan ante: columna nueva sin migración, downgrade incompleto y segunda cabeza.

## Pendiente

- [ ] Proteger `main` en GitHub (Settings → Branches) para exigir los checks antes de mezclar.
- [x] Trazabilidad hallazgo → test: [COBERTURA_HALLAZGOS.md](COBERTURA_HALLAZGOS.md).
- [ ] Seed grande opcional (`db:seed:large`) para probar la UI con muchos datos, si se decide.
- [ ] Avisos de deprecación Starlette/AnyIO en la suite Python.

## Bitácora

| Fecha | Cambio | Evidencia |
| --- | --- | --- |
| 2026-09-22 | `npm run test:api:pg`: suite completa sin omitir PostgreSQL (`f76e99f`) | Local: 208 pasan, 0 omitidos |
| 2026-09-22 | `test_migrations.py` (`613d0b0`) | Local: 213 pasan con PG; 187 pasan y 26 omitidos sin PG |
| 2026-09-22 | Workflow `ci.yml` en rama `ci/github-actions` | Local antes del push: web 19/19, `tsc` ok, build ok, Playwright 11/11. Primer run en GitHub: web ✅, API ❌ por test intermitente |
| 2026-09-22 | Arreglo de `test_postgres_cancel_before_clinical_write_rechecks_status`: dependía del orden aleatorio de IDs (fallaba ~12/25). La app era correcta; el test no detectaba el bloqueo cuando ocurría en `relationship()`. Acciones actualizadas a versiones Node 24 | Local: 0/40 fallos; suite 213 pasan |
| 2026-09-22 | `test_hallazgos.py` (criterios de auditoría sin test propio) y `test_config.py`; corrección D10 en `app/config.py` | Local: 11 tests de config fallaban antes de corregir; suite con PG 251 pasan |
| 2026-09-22 | CI sin checks duplicados: corre solo en PR hacia `main` y en push a `main`, con los tres jobs cada vez | Pendiente del run del PR |
| 2026-09-25 | Next 14 → 16 y React 18 → 19. `next-env.d.ts` deja de versionarse (Next 16 lo reescribe apuntando a carpetas temporales); el job web lo genera con `next typegen` antes de `tsc` | Local: web 19/19, `tsc` ok desde estado limpio, build ok, Playwright 11/11; `npm audit` 0 vulnerabilidades |
| 2026-09-26 | `test_account.py` (recuperar contraseña y verificar email, incluido el límite por IP de `/api/auth`, que no tenía test), 2 tests PostgreSQL de concurrencia y `e2e/account.spec.ts`. Se verificó rompiendo cada una de las 14 defensas que algún test falla. Los tests de registro de `test_flows.py` cambian porque el registro ya no inicia sesión; el test de datos clínicos heredados quita solo los guards de 0004 | Local: `test:api:pg` 282 pasan, 0 omitidos; `test:api` 254 pasan, 28 omitidos; web 20/20; `tsc` ok; build ok; Playwright 13/13 (3 corridas) |
