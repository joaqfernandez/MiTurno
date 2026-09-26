# Backend Python

Este es el backend activo de MiTurno. Se ejecuta desde la raíz con `npm run dev:api`; la guía completa de instalación y cuentas está en [README](../../README.md).

## Por dónde empezar a leer

1. `app/main.py`: aplicación, rutas, errores y transacciones.
2. `app/patients.py`: validación y lista explícita de campos editables. Roles y relaciones no pueden modificarse desde el perfil.
3. `app/dependencies.py`: identidad verificada contra la base y autorización.
4. `app/models.py`: entidades SQLAlchemy. `migrations/versions` conserva el esquema versionado con Alembic.
5. `app/appointments.py` y `app/availability.py`: disponibilidad, reservas y cancelación.
6. `tests/test_patients.py` y `tests/test_flows.py`: ejemplos ejecutables de comportamientos permitidos y rechazados.

Es un monolito modular: cada archivo de dominio reúne rutas y lógica, con persistencia compartida y transacciones por petición. `PaymentProvider` en `payments.py` separa el contrato de pagos de Mercado Pago. `outbox.py` guarda trabajos en la misma transacción que la reserva; `worker.py` procesa notificaciones, calendario y reembolsos con reintentos. Redis/BullMQ ya no son necesarios.

PostgreSQL impide solapamientos de turnos activos mediante una exclusión por intervalo. Triggers impiden UPDATE/DELETE de evoluciones clínicas y AuditLog; las correcciones se agregan como enmiendas. SQLite reproduce las protecciones para tests, pero la verificación de concurrencia usa PostgreSQL real.

## Configuración

`npm run setup:api` crea `.venv` y `.env`. No subir secretos a Git. Variables opcionales en [`.env.example`](../../.env.example). Los tokens Google se cifran con AES-GCM. El callback OAuth es `${API_URL}/api/calendar/google/callback`.

Los envíos requieren Resend (`EMAIL_FROM` verificado) o Twilio. Los trabajos sin configuración se reintentan y finalmente quedan FAILED; el administrador puede reintentarlos cuando configure el proveedor. El seed no envía correos ni realiza cobros.

**Emails en desarrollo:** sin Resend, el worker escribe cada email en `.data/mailbox/` (un `.txt` por email, con el link). Es una entrega real a una carpeta, no una simulación, y `config.py` la prohíbe en producción, donde `RESEND_API_KEY` y `EMAIL_FROM` son obligatorias.

**Cuentas (`app/account.py`):** verificación de email y recuperación de contraseña con links de un solo uso. Resumen de las defensas (cada una tiene su test en `tests/test_account.py`):

- En la base solo queda el SHA-256 del token; el token lo genera el worker al enviar y viaja en el fragmento `#` del link.
- Vencen a los 30 minutos (contraseña) o 24 horas (email), sirven una vez, un link nuevo anula el anterior y cambiar la contraseña o suspender la cuenta los anula.
- Registro, "olvidé mi contraseña" y reenvío responden igual exista o no la cuenta; el login verifica contra un hash señuelo si la cuenta no existe.
- Máximo 3 emails por hora por cuenta y tipo, además del límite por IP de `/api/auth`.
- Restablecer cierra todas las sesiones, queda en auditoría y avisa por email. No reactiva ni aprueba cuentas.
- Sin email confirmado no hay sesión. Las cuentas previas a la migración 0005 quedan confirmadas.

## Pruebas

Desde esta carpeta: `.venv/bin/python -m pytest`. Las pruebas de PostgreSQL se omiten salvo que exista `TEST_POSTGRES_URL` (ver README raíz). Adaptadores externos se prueban con transportes HTTP controlados: no son evidencia de una operación real en las cuentas de los proveedores.

Dependencias directas en `requirements.in`; versiones fijadas en `requirements.txt`. Hay dos avisos de deprecación de Starlette/AnyIO en TestClient que deben revisarse al actualizar dependencias.
