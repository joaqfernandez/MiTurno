# Cierre: usuarios suspendidos y referencias clínicas

Fecha: 21 de septiembre de 2026. Estado: **cerrados en la implementación local los riesgos D01 y A11**, con los límites indicados en este documento. Corresponde a la sección 3 del trabajo: consolidar evidencia y criterios de aceptación de los puntos 1 y 2.

La referencia de código es `f506dbb` más los cambios locales de esta sesión. Este cierre no afirma que los cambios estén publicados, integrados en una rama remota o desplegados en producción.

## Criterios de aceptación

| Riesgo / criterio | Resultado y evidencia reproducible |
| --- | --- |
| D01: bloquear cuentas no activas | Contraseña, refresh y Google rechazan cuentas suspendidas. [test_suspension.py](../apps/api-python/tests/test_suspension.py), `test_suspend_open_session_reactivate_requires_new_login`; [test_google_auth.py](../apps/api-python/tests/test_google_auth.py), `test_non_active_account_cannot_login`. |
| D01: impedir operaciones con una sesión abierta | Médico y paciente suspendidos no pueden leer historias/agenda, cancelar turnos ni escribir evoluciones. Mismo test de suspensión, parametrizado por rol. |
| D01: reactivar sin recuperar credenciales anteriores | Access tokens, refresh tokens y tickets/vinculaciones Google anteriores siguen rechazados; un nuevo login funciona. `test_legacy_access_token_is_rejected`, `test_google_ticket_cannot_survive_suspend_and_reactivate` y `test_google_link_cannot_survive_suspend_and_reactivate`. |
| D01: renovación atómica y suspensión concurrente | PostgreSQL comprueba que un refresh tenga un solo ganador y que competir con login, refresh o canje Google no deje credenciales utilizables tras la suspensión. [test_postgres.py](../apps/api-python/tests/test_postgres.py), `test_postgres_refresh_is_single_use_under_concurrency` y `test_postgres_suspension_competes_with_session_issuance`. |
| D01: retirar sesión y datos de la interfaz | Cliente HTTP limpia credenciales/caché ante invalidación de sesión sin confundirla con un 403 por permisos. Pruebas [api.test.cjs](../apps/web/test/api.test.cjs) y recorridos de suspensión de paciente/médico en [real-app.spec.ts](../apps/web/e2e/real-app.spec.ts). |
| A11: impedir referencias cruzadas | Dos pacientes y dos médicos, con relaciones asistenciales legítimas, no pueden mezclar historias, autores o episodios. [test_clinical_references.py](../apps/api-python/tests/test_clinical_references.py), casos `cross_patient`, `colleague`, `invalid_appointment` y `amendment_cannot_change_or_remove_original_episode`. |
| A11: conservar el episodio de la enmienda | Omitir el turno lo hereda; cambiarlo o quitarlo explícitamente se rechaza. Las cadenas de enmiendas conservan el episodio y el original firmado. También comprobado desde el formulario en Playwright. |
| A11: estados del turno y carreras | Una relación válida no permite asociar una entrada nueva a otro turno pendiente/cancelado. PostgreSQL prueba tanto cancelación anterior a escritura como escritura anterior a cancelación. |
| A11: garantías en base de datos | SQLite/PostgreSQL rechazan referencias inválidas mediante SQL directo y cambios de propiedad de padres. Las entradas son inmutables; se rechazan reemplazos SQLite por PK y por `rowid`, `_rowid_` u `oid`, incluso sin triggers recursivos. |
| A11: rechazo sin efectos parciales ni filtraciones | No quedan historias, entradas ni auditorías de escritura exitosa tras rechazos/fallo de auditoría. La lectura no incluye una enmienda de otra historia, incluso simulando legado inconsistente. El formulario conserva el borrador ante un rechazo real de la API. |
| Ambos: migración y conservación de datos | `0003` revoca credenciales sin alterar cuentas/historias/turnos. `0004` conserva referencias válidas y se detiene ante inconsistencias sin reescribir contenido clínico. Hay pruebas SQLite y PostgreSQL. |

## Resultados ejecutados

Resultados de las ejecuciones finales de implementación, anteriores a esta consolidación documental. No se volvieron a ejecutar las suites al cambiar únicamente la documentación.

| Verificación | Resultado |
| --- | --- |
| `npm run test:api` | 184 aprobadas; 24 PostgreSQL omitidas por ser opt-in |
| Suite `tests/test_postgres.py` con `TEST_POSTGRES_URL` | 24 aprobadas en bases temporales PostgreSQL |
| `npm run test:web` | 19 aprobadas |
| `npm run test:e2e` | 11 aprobadas, con web/API/base temporal reales |
| `npm run build:web` | Compilación y comprobación de tipos correctas |
| `git diff --check` | Sin errores de formato del diff |

**Total: 238 casos aprobados**, sin contar dos veces los 24 casos PostgreSQL. Son resultados de las suites completas, no 238 pruebas nuevas exclusivas de estos riesgos. El último registro local de Playwright informa `status: passed` y `failedTests: []`.

Los primeros intentos incluyeron correcciones de selectores de los tests de navegador y un ajuste del DDL PostgreSQL antes de su aplicación local. Una ejecución de navegador con una pausa prolongada falló en dos recorridos generales; la ejecución final completa pasó. El resultado se refiere a esa ejecución final, no oculta que hubo intentos fallidos.

Para repetir PostgreSQL, desde `apps/api-python`, configurar `TEST_POSTGRES_URL` hacia un servidor de pruebas y ejecutar:

```bash
.venv/bin/python -m pytest tests/test_postgres.py -x --tb=short
```

La fixture crea y elimina bases exclusivas; no usa la base de desarrollo como destino de los casos. El comando de navegador usa puertos 3100/3101 y una SQLite temporal. No hace falta recrear el seed de desarrollo para repetir las pruebas.

## Estado local verificado

Las migraciones `0003` y `0004` fueron aplicadas durante la implementación. La consulta posterior a `0004` confirmó:

```text
Migración local: 0004
Referencias clínicas inconsistentes: 0
Triggers clínicos instalados: 3
```

La instalación de guards no reescribió contenido clínico. La revocación de sesiones al pasar a `0003` fue deliberada. Se conservaron las conexiones de Google Calendar. Si un proceso seguía abierto con una versión anterior, debe reiniciarse para cargar el código nuevo.

## Políticas adoptadas y límites

- La suspensión se valida por petición; una operación ya autorizada antes de confirmar la suspensión puede terminar. La interfaz se limpia cuando recibe el rechazo, sin notificación push a pestañas inactivas.
- Una evolución sin turno sigue permitida si existe relación asistencial. `CONFIRMED`, `COMPLETED` y `NO_SHOW` son estados habilitantes; una ausencia no se considera prueba de atención efectiva.
- Solo el autor enmienda su entrada y debe conservar historia y episodio. Un colega puede registrar otra evolución con su firma. Una enmienda de turno posteriormente cancelado sigue requiriendo otra relación asistencial habilitante cuando corresponda.
- La lectura administrativa general permanece como comportamiento existente. El mínimo privilegio administrativo, registro de accesos denegados e idempotencia de escritura no se dan por cerrados aquí; **A10 no se cierra íntegramente** por haber probado atomicidad.
- Los guards SQL protegen integridad; no sustituyen la autenticación ni protegen contra un administrador capaz de desactivar las propias restricciones.
- Las pruebas de Google sustituyen al proveedor externo en la frontera de integración. Este cierre no acredita verificación pública de Google ni completa pruebas de otros proveedores, backups, carga o despliegue.

El resto de los pendientes de [ROADMAP.md](ROADMAP.md) conserva su estado. El cierre de D01/A11 no declara cerrada toda la auditoría histórica ni habilitado el producto para producción.

## Revisión de seguridad y documentación

Se aplicó **differential-review de Trail of Bits** al cambio de integridad clínica, con revisión adversarial independiente. Se detectó y corrigió la vía SQLite de reemplazo por `rowid`; el revisor confirmó su cierre y las regresiones la cubren. No se ejecutaron Semgrep, CodeQL ni una auditoría de dependencias en este trabajo.

- [Informe diferencial](../MiTurno_DIFFERENTIAL_REVIEW_2026-09-21.md).
- [Contrato de suspensión](suspension-usuarios.md).
- [Contrato de integridad clínica](integridad-historias-clinicas.md).
- [Auditoría histórica](AUDITORIA.md), D01 y A11: antecedentes del backend anterior, conservados sin reescribir sus hallazgos originales.
