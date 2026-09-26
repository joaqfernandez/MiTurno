# Registro de cambios

Una línea por cambio, **la más reciente arriba**. Todo agente (o persona) que modifique el repositorio agrega su entrada en el mismo commit del cambio.

Formato: `AAAA-MM-DD HH:MM (hora Argentina) · quién · qué cambió, muy resumido · commit o rama`

---

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
