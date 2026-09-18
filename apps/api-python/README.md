# Prueba de backend Python: actualización de paciente

Esta es la prueba acordada para decidir si te resulta más fácil mantener el backend en Python. Implementa **GET y PATCH `/api/patients/me`** con FastAPI, JWT, validación y persistencia SQLite independiente. Vive en `experiment/python-patient-update`.

El backend NestJS y la web siguen usando su configuración habitual. Esta prueba no cambia el proxy web ni migra datos de PostgreSQL. SQLite permite probar guardado real sin configurar otro servicio; no representa una decisión de cambiar la base del producto.

## Ejecutarla en tu máquina

Verificado con Python **3.14.5**. Desde una terminal:

```bash
cd /Users/joaquinfernandez/Documents/Personal/MiTurno/apps/api-python
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export JWT_ACCESS_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
python -m app.demo
python -m uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

En esta copia ya están creados el entorno virtual y las dependencias: podés empezar en `source .venv/bin/activate`. Ejecutá los comandos en la misma terminal para conservar la variable de entorno. No uses un secreto real del proyecto: esta prueba tiene su propio token y sus propios datos ficticios.

Abrí **http://127.0.0.1:8000/docs**:

1. Copiá el token que imprimió `python -m app.demo`.
2. Presioná **Authorize**, pegá solo el token y confirmá.
3. Abrí **GET /api/patients/me → Try it out → Execute** para ver el paciente.
4. Abrí **PATCH /api/patients/me → Try it out** y reemplazá el body completo por:

   ```json
   { "firstName": "Juana", "healthInsurance": "Mi obra social" }
   ```

5. Ejecutá y volvé a consultar GET: los cambios están guardados. Incluso sobreviven al reinicio.
6. Probá este body: responde **400** y no guarda ninguno de los dos campos:

   ```json
   { "firstName": "No guardar", "user": { "update": { "roles": ["ADMIN"] } } }
   ```

El token vence en 15 minutos. Para renovarlo, detené Uvicorn con Ctrl+C, ejecutá otra vez `python -m app.demo`, reiniciá Uvicorn y actualizá Authorize. El script conserva las ediciones existentes. Si abrís otra terminal, generá un secreto nuevo y reiniciá ambos pasos con ese mismo secreto; los tokens anteriores dejarán de servir.

Los datos locales viven en `.data/pilot.sqlite3`, que está excluida de Git. El script demo no es un login de producción ni un endpoint expuesto.

## Cómo leer el código

Empezá por estos archivos, en este orden:

| Archivo Python | Qué hace | Equivalente aproximado en NestJS |
| --- | --- | --- |
| [app/patients.py](app/patients.py) | Declara seis campos editables y valida valores | `dto/update-patient.dto.ts` |
| [app/main.py](app/main.py) | Define las rutas, conecta autenticación y guardado, responde errores | `patients.controller.ts` + configuración de aplicación |
| [app/auth.py](app/auth.py) | Verifica firma/vencimiento del JWT y obtiene identidad | `jwt.strategy.ts` + guard |
| [app/database.py](app/database.py) | Comprueba propiedad/estado, limita columnas y guarda en transacción | `PatientsService.updateMe` + persistencia |
| [tests/test_patients.py](tests/test_patients.py) | Demuestra qué se permite, qué se rechaza y qué se conserva | `patients-update.test.cjs` |

Un PATCH recorre `UpdatePatient` → `current_patient`/`authenticate` → `Database.update_patient` → `patient_response`. FastAPI resuelve autenticación y validación antes de ejecutar el cuerpo de la función de ruta. `model_dump(exclude_unset=True)` entrega solo los campos enviados. La lista `EDITABLE_FIELDS` es una segunda defensa antes de construir el UPDATE; todos los valores van como parámetros SQL.

Las anotaciones `str`, `dict` o `str | None` son tipos de Python; no hace falta trasladar decoradores ni módulos de NestJS literalmente. En este ejemplo, `None` sirve como valor por defecto de campos omitidos, pero el validador rechaza que el cliente mande `null` explícitamente.

## Contrato y diferencias deliberadas

- Se conservan ruta, nombres JSON y los seis campos de la versión TypeScript.
- PATCH parcial conserva campos omitidos; un body vacío es un no-op.
- Nombre y apellido requieren strings no vacíos. Fecha requiere YYYY-MM-DD válido; en la respuesta se devuelve ISO UTC, como Nest/Prisma.
- Tipos inválidos, `null`, campos extra y operaciones anidadas reciben 400. JWT ausente/inválido/vencido recibe 401. Sin perfil propio activo, 403. Documento duplicado, 409.
- JWT usa HS256 y requiere `sub`, `pid` y `exp` para acceder al perfil. No hay login/refresh: el script emite una identidad ficticia de prueba.
- La versión Python comprueba en DB propiedad y estado ACTIVE, incluso si el JWT es válido. Es una defensa adicional de esta prueba; el backend Nest no recibió esa corrección automáticamente.
- SQLite y su esquema mínimo de User/Patient no sustituyen al schema Prisma completo. No hay migraciones de producción, pagos, turnos, historias clínicas ni integración web en esta prueba.
- Los errores de validación conservan 400 y `message`; otros errores usan `detail`. No se afirma compatibilidad completa con todo el backend actual.

## Tests

Desde `apps/api-python`, con el entorno virtual activado:

```bash
python -m pytest
```

La suite cubre los escenarios de seguridad/validación de los 51 tests TypeScript y añade persistencia real, rollback, perfil ajeno, suspensión, algoritmos JWT no autorizados, SQL parametrizado, configuración y script demo. Usa FastAPI TestClient, tokens firmados y una SQLite temporal nueva por test; no hace falta arrancar Uvicorn ni Docker. La documentación oficial describe este enfoque de [testing de FastAPI](https://fastapi.tiangolo.com/tutorial/testing/).

Dependencias directas en `requirements.in`; versiones instaladas, incluidas transitivas, fijadas en `requirements.txt`. Hay dos advertencias de deprecación emitidas por Starlette/AnyIO al usar TestClient con HTTPX; no se ocultan ni son fallos de las pruebas. Revisarlas al actualizar esas dependencias.

## Cómo decidir si seguimos con Python

Antes de migrar más módulos, intentá explicar qué sucede al enviar `{ "roles": ["ADMIN"] }` y por qué no cambia otro paciente si el body incluye su ID.

Después podés hacer un ejercicio chico: agregar un límite de 100 caracteres a `firstName` y `lastName` en `patients.py`, y dos casos en `tests/test_patients.py` que rechacen 101 caracteres. Es una propuesta para evaluar comprensión; ese límite no forma parte de la implementación actual.

Si podés localizar y hacer ese cambio entendiendo sus tests, tendremos evidencia de que Python te facilita mantener este producto. Si elegimos migrar, el siguiente paso será diseñar persistencia PostgreSQL/migraciones y contratos de auth; el resto se migraría por recorridos funcionales, conservando las pantallas existentes.

Referencias de implementación: [validación de modelos Pydantic](https://docs.pydantic.dev/latest/concepts/models/) y [validación de tokens PyJWT](https://pyjwt.readthedocs.io/en/stable/usage.html).
