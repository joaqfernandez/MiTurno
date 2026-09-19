> Auditoría inicial de c3bf815, anterior a las correcciones. Los bloqueos de código descritos se abordaron en la integración Python posterior; ver [google-oauth.md](google-oauth.md) para configuración y validación actual. La prueba con Google real sigue pendiente.

## Resultado de la corrección

Login/vinculación portados a Python con migración 0002; sesión unificada, consentimiento denegado de Calendar manejado y NestJS huérfano retirado. **123 pruebas Python + 6 PostgreSQL + 14 web + 6 navegador = 149 aprobadas**, además del build de producción. Migración aplicada a la base local conservando datos. Las pruebas de navegador simulan únicamente Google; no validan credenciales reales. En esta Mac faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.

# Verificación antes del merge de OAuth

Fecha: 2026-09-19. Rama revisada: `feature/google-oauth`, commit `c3bf815`.
Base remota: `origin/main`, commit `5ee96f4`. Referencias actualizadas mediante `git fetch origin --prune`.

**Resultado: no está lista para merge funcional.** La rama ya contiene main y la migración Python (merge `7801f74`), pero la implementación nueva de login Google quedó en NestJS, fuera del backend ejecutable.

## Pruebas ejecutadas

| Verificación | Resultado |
| --- | --- |
| `npm run test:api` | 93 aprobadas; 4 PostgreSQL omitidas aquí y ejecutadas por separado |
| PostgreSQL con `TEST_POSTGRES_URL`, `pytest tests/test_postgres.py` | 4 aprobadas |
| `npm run test:web` | 10 aprobadas |
| `npm run test:e2e` | 3 aprobadas |
| `npm run build:web` | Compilación y tipos aprobados |
| `git merge-base --is-ancestor origin/main HEAD` | La rama incluye main |

Los recorridos de navegador verifican login por contraseña, reserva persistida, lectura clínica, configuración del médico y separación de sesión administrativa. No cubren login Google. Los adaptadores de Calendar existentes se prueban con HTTP simulado; no se autorizó una cuenta real ni se enviaron eventos reales a Google.

Las bases de pruebas son temporales. No se modificaron los datos de desarrollo. Hay dos avisos de deprecación Starlette/AnyIO en la suite Python.

## Bloqueos confirmados

### 1. El backend activo no implementa el login Google

`package.json` solo declara el workspace web y ejecuta Python mediante `scripts/backend.py`. Los archivos nuevos `apps/api/src/modules/auth/google-auth.controller.ts`, `google-auth.service.ts` y `modules/oauth/*` pertenecen al backend NestJS retirado. No hay un workspace ejecutable en `apps/api` ni registro de esas rutas en FastAPI.

Prueba HTTP con FastAPI TestClient, una base temporal migrada con Alembic y la aplicación real:

| Petición | Respuesta |
| --- | --- |
| GET `/api/auth/google/start` | 404 |
| GET `/api/auth/google/callback?code=test&state=test` | 404 |
| POST `/api/auth/google/link` | 404 |
| POST `/api/auth/google/complete` | 404 |

Esto no es una falta de credenciales: las rutas no están registradas. El botón «Continuar con Google» navega a la primera ruta y falla. Es necesario portar login, vinculación, verificación de identidad, estado y ticket de sesión a Python, con su modelo/migración Alembic y pruebas de seguridad equivalentes.

### 2. El contrato de sesión Google pierde información

En `apps/web/lib/auth.tsx`, `completeGoogleLogin` solo guarda accessToken, nombre, email y un rol reducido a DOCTOR/PATIENT. A diferencia del login normal:

- No conserva `refreshToken`: la sesión no podrá renovarse al vencer el acceso.
- No conserva `patientProfileId`: la pantalla «Mi historia» no podrá resolver el perfil.
- No reconoce ADMIN: un administrador termina con rol visual PATIENT.

Además, `apps/web/app/auth/google/callback/page.tsx` solo redirige a panel médico o mis turnos; falta administración. Hallazgos por revisión del código; el recorrido real no puede completarse mientras falten las rutas Python. Conviene compartir el mapeo de sesión con login normal y probar los tres roles.

### 3. Cancelar el consentimiento de Calendar no vuelve a la pantalla prevista

Petición reproducida: GET `/api/calendar/google/callback?error=access_denied&state=test` devuelve 400 JSON (`query.code: Field required`). El callback Python exige `code` antes de manejar una denegación. El nuevo componente espera `?calendar=error` en configuración, pero ese camino no lo genera el backend.

Hay que manejar error/denegación, validar y consumir el estado correspondiente y redirigir a la web sin filtrar datos sensibles. El camino exitoso existente sí redirige con `calendar=ok`.

### 4. Documentación y tests OAuth apuntan al stack retirado

`docs/google-oauth.md` pide Prisma, `NODE_ENV` y `npm run test:oauth --workspace apps/api`. El proyecto activo usa Alembic, `APP_ENV` y no declara ese workspace. Las variables `GOOGLE_LOGIN_REDIRECT_URI` y `GOOGLE_REDIRECT_URI` tampoco son consumidas por Settings Python; Calendar deriva su callback de API_URL.

Los tests nuevos TypeScript en `apps/api/test/oauth.test.ts` no forman parte de ninguna suite ejecutable actual. Por eso todas las suites existentes pueden pasar aunque el login Google no funcione.

### 5. Archivos generados versionados

La rama heredó archivos `__pycache__/*.pyc`, `.next-e2e` y resultados de pruebas versionados, aunque figuren en `.gitignore`. Ejecutar las pruebas los modifica. Deben retirarse del índice Git en una limpieza independiente; no contienen código fuente que deba integrarse. En esta revisión se restauraron únicamente los artefactos generados modificados por las pruebas.

## Orden recomendado

1. Portar el login/vinculación Google a Python preservando nonce, firma/audiencia/emisor, email verificado, estado de un solo uso ligado al navegador, protección de cuentas existentes y usuarios suspendidos.
2. Unificar el contrato de sesión de contraseña y Google; verificar refresh, historia del paciente y panel administrador.
3. Cubrir denegación y errores Calendar, actualizar documentación/configuración y retirar los archivos NestJS huérfanos.
4. Incorporar tests de estos flujos sobre FastAPI y navegador. Repetir las suites existentes.
5. Con credenciales de prueba, verificar consentimiento, vinculación y sincronización real de Calendar. Recién entonces evaluar el merge.

No se hizo merge ni se modificó el código de OAuth durante esta revisión.
