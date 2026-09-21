# Revisión diferencial de seguridad: referencias clínicas

## 1. Resultado ejecutivo

Revisión realizada con el skill **differential-review de Trail of Bits**, incluyendo una revisión adversarial independiente y pruebas de regresión. El alcance es el punto 2: historias, autores, turnos y enmiendas. Los cambios de suspensión del punto 1 estaban presentes en el árbol de trabajo y no se atribuyen a esta revisión.

| Gravedad | Hallazgos abiertos en el alcance revisado |
| --- | ---: |
| Crítica | 0 |
| Alta | 0 |
| Media | 0 |
| Baja | 0 |

**Riesgo del cambio:** alto por integridad clínica y autorización. **Recomendación:** aprobar el cambio en este alcance tras aplicar la migración `0004` a una base que supere su revisión de referencias. No equivale a certificar la seguridad del producto completo.

Se corrigieron las referencias de episodio/autor y se agregaron defensas de base. Durante la revisión se reprodujo una vía de reemplazo SQLite que eludía la inmutabilidad; también quedó corregida y con pruebas.

## 2. Qué cambió

Baseline: `f506dbb`, más los cambios locales previos del punto 1. Las reglas clínicas anteriores provienen de `a5f9247` (2026-09-18). No se crearon commits durante este trabajo.

| Archivo | Cambio | Riesgo |
| --- | --- | --- |
| `apps/api-python/app/medical_records.py:14` | Bloqueo de relación asistencial y validación de episodio/autor; capacidad `canAmend`; lectura anidada limitada a la historia | Alto |
| `apps/api-python/app/clinical_integrity_v1.py:11` | Revisión de datos existentes, triggers y protección frente a reemplazos | Alto |
| `apps/api-python/migrations/versions/0004_clinical_references.py:10` | Revisión e instalación transaccional de guards | Alto |
| `apps/api-python/app/database.py:23` | Triggers recursivos SQLite y esquema de prueba coherente | Alto |
| `apps/api-python/app/schemas.py:140` | Rechazo de referencias vacías | Medio |
| `apps/web/app/panel/pacientes/[id]/page.tsx:50` | Opciones de enmienda propias y conservación del borrador ante errores | Medio |
| `apps/web/lib/types.ts:87` | Tipos de capacidad y episodio | Bajo |
| `apps/api-python/tests/test_clinical_references.py` | Casos positivos/negativos, SQL directo y migración | Validación |
| `apps/api-python/tests/test_postgres.py:180` | Guards, migración y concurrencia real PostgreSQL | Validación |
| `apps/web/e2e/real-app.spec.ts:99` | Enmienda, autoría y rechazo en navegador | Validación |
| `docs/integridad-historias-clinicas.md`, `README.md` | Contrato funcional y documentación | Bajo |

Se analizaron los 12 archivos de implementación, pruebas y documentación del punto 2. Los seis archivos existentes de implementación/documentación principal suman +64/-29 líneas; el DDL versionado y su migración añaden 148 líneas. Las pruebas se amplían sobre los archivos existentes y uno nuevo.

## 3. Hallazgos y correcciones

### DR-01 — Cambio o pérdida de episodio al enmendar (corregido)

**Baseline:** `a5f9247`, `medical_records.py:64–71`. Se verificaba la misma historia y, si se enviaba turno, la pareja paciente/médico. No se comparaba el turno con el de la entrada original.

**Escenario:** un médico con dos turnos del mismo paciente creaba una enmienda con el ID del segundo turno, o sin `appointmentId`. La nueva entrada quedaba asociada a otro episodio o sin episodio.

**Corrección:** `medical_records.py:69–77` hereda el turno cuando el campo se omite y rechaza cualquier cambio explícito, incluido `null`. Los triggers repiten esa comprobación con comparación segura de nulos. Se restringe además la enmienda al autor original; el colega conserva la posibilidad de escribir una evolución propia.

**Evidencia:** pruebas de cambio/eliminación de episodio, cadena de enmiendas, autor diferente y recorrido del formulario. No se retiró la validación preexistente de historia/paciente.

### DR-02 — Escritura ligada a un turno cancelado o pendiente (corregido)

**Baseline:** mismo bloque `a5f9247`. Otro turno confirmado del paciente bastaba para superar la relación asistencial, aunque el turno referenciado estuviera cancelado o pendiente.

**Escenario:** el médico usa la relación válida del turno A para crear una evolución ligada al turno B cancelado. Una cancelación concurrente también podía ocurrir entre lectura y escritura.

**Corrección:** `medical_records.py:78–84` valida el estado del episodio de una evolución nueva. `relationship(..., lock=True)` y el episodio toman locks compartidos. Los triggers PostgreSQL también bloquean el turno antes de validarlo. La corrección de una entrada previa no pierde el episodio por una cancelación posterior, pero mantiene la exigencia de relación asistencial.

**Evidencia:** rechazo con otra relación válida y pruebas deterministas de ambos órdenes de cancelación/escritura en PostgreSQL.

### DR-03 — Reemplazo SQLite que eludía append-only (corregido)

**Acceso requerido:** escritura SQL directa; no se encontró un endpoint HTTP que emita `REPLACE`. El riesgo es de integridad ante otro escritor del servicio o herramienta con acceso DML, no una explotación HTTP anónima.

**Escenario reproducido:** con `recursive_triggers=OFF`, `INSERT OR REPLACE` elimina una fila sin disparar el guard `BEFORE DELETE`. Rechazar una PK repetida no bastaba: una PK nueva con el `rowid` de la entrada original también reemplazaba la fila, si no había enmiendas/adjuntos que impidieran el borrado mediante FK.

```sql
INSERT OR REPLACE INTO medical_record_entries
  (rowid, id, "createdAt", "recordId", "doctorId", title, content)
SELECT rowid, 'replacement', "createdAt", "recordId", "doctorId", title, 'Replaced'
FROM medical_record_entries WHERE id = :original;
```

**Corrección:** `clinical_integrity_v1.py:84–114` rechaza colisiones de PK o `rowid` antes de insertar entradas o padres clínicos. Las conexiones activan además triggers recursivos. Se verificaron los alias `rowid`, `_rowid_` y `oid` con triggers recursivos desactivados. La revisión independiente reprodujo el problema y confirmó el cierre.

### Defensa de lectura y migración

Las enmiendas anidadas se filtran por `recordId`, evitando incluir una nota de otro paciente incluso ante un dato histórico inconsistente. La migración falla antes de instalar los guards si detecta referencias inválidas; no modifica contenido firmado para hacer pasar la revisión. PostgreSQL bloquea las tablas afectadas durante revisión e instalación. La prueba de fallo verifica que el número de revisión permanece en `0003`.

## 4. Cobertura de pruebas

Resultado final: **184 pruebas API/SQLite, 24 PostgreSQL, 19 de frontend y 11 recorridos de navegador aprobados**, además de compilación web correcta. La suite API omite los 24 casos PostgreSQL por diseño; se ejecutaron por separado sobre bases temporales. Las comprobaciones cubren todas las funciones nuevas o modificadas del recorrido clínico; no se obtuvo un porcentaje instrumental de cobertura de líneas.

- Casos negativos con dos pacientes y dos médicos, incluyendo un atacante que ya tiene relación legítima con ambos pacientes.
- Referencias inexistentes/vacías, autor ajeno, turno de otro médico/paciente y estado inválido.
- Nulos, herencia del episodio, enmiendas de enmiendas e inmutabilidad del original.
- Inserciones SQL directas, modificaciones de padres, reemplazos SQLite por PK/rowid y rollback ante fallo de auditoría.
- Migración válida y rechazo de legado inconsistente en SQLite y PostgreSQL.
- Cancelación que gana antes de la escritura y cancelación que espera a una escritura ya autorizada.
- Formulario real: selección de entrada propia, conservación del episodio, colega con acceso de lectura y borrador conservado al rechazar una referencia.

## 5. Alcance de impacto

Conteo de llamadores directos de producción:

| Función | Llamadores | Efecto |
| --- | ---: | --- |
| `relationship` | 2 | Lectura autorizada y creación de evoluciones |
| `entry_json` | 2 | GET de historia y respuesta de escritura |
| `install` de integridad clínica | 2 | Migración y esquema de prueba |
| `validate_existing` | 1 | Migración |
| `add_entry` | 1 ruta HTTP | Mutación clínica desde el formulario y clientes API |

Cadena principal: formulario → POST `/api/medical-records/entries` → autorización → validación de referencias → INSERT/trigger → auditoría → commit. Los triggers alcanzan también al seed, probado en ambas bases. No hay nuevos servicios ni dependencias externas.

## 6. Contexto histórico y regresiones

Se inspeccionaron `git log` y `git blame` del bloque de validación original. Los controles introducidos por la migración a Python (`a5f9247`) se conservan y amplían; no se reintroduce el comportamiento del backend NestJS retirado. El criterio de relación asistencial sigue incluyendo `NO_SHOW`; no se presenta una ausencia como prueba de atención efectiva.

## 7. Recomendaciones

No quedan acciones de código bloqueantes identificadas dentro de este alcance. La base local quedó en `0004`: verificación posterior con **0 referencias inconsistentes y 3 triggers clínicos instalados**. Reiniciar los procesos abiertos para que API y esquema usen las mismas reglas. En otras instalaciones, aplicar `0004` antes de ejecutar esta versión. Si otra instalación contiene enmiendas históricas de autor/episodio incompatible, revisar su procedencia y decidir una reparación auditable antes de migrar; no deshabilitar los guards para forzar el avance.

La lectura administrativa general y las entradas sin turno son comportamientos existentes documentados, no decisiones nuevas de esta revisión. Adjuntos, dependencias y el resto de la aplicación requieren sus propios alcances de revisión.

## 8. Metodología y límites

Estrategia FOCUSED para una aplicación de tamaño mediano (56 archivos en app backend, rutas web y librerías web). Se revisaron dependencias de un salto: autenticación/roles, modelos/FKs, sesión transaccional, cancelación, seed, migraciones, serializer y consumidores web.

Se aplicaron análisis diferencial, historia Git, conteo de llamadores, escenarios adversariales y ejecución de regresiones. Se utilizó un revisor independiente siguiendo `differential-review:adversarial-modeler`. No se ejecutaron Semgrep, CodeQL ni auditoría de dependencias; no se atribuyen resultados a esas herramientas. `code-improver` no se lanzó: este trabajo utilizó el revisor diferencial directamente.

La confianza es alta en las reglas y rutas probadas, sin equivaler a una auditoría integral. Un administrador de base capaz de desactivar triggers/FKs queda fuera de las garantías. La autorización de identidad reside en la API; el DDL impone integridad estructural.

## 9. Referencias

- Skill: `/Users/joaquinfernandez/.codex/plugins/cache/trailofbits/differential-review/1.1.4/skills/differential-review/SKILL.md`.
- Reglas funcionales: [integridad-historias-clinicas.md](docs/integridad-historias-clinicas.md).
- Auditoría histórica: [AUDITORIA.md](docs/AUDITORIA.md), A11; backend anterior.
