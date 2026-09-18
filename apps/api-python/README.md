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

## Pruebas

Desde esta carpeta: `.venv/bin/python -m pytest`. Las pruebas de PostgreSQL se omiten salvo que exista `TEST_POSTGRES_URL` (ver README raíz). Adaptadores externos se prueban con transportes HTTP controlados: no son evidencia de una operación real en las cuentas de los proveedores.

Dependencias directas en `requirements.in`; versiones fijadas en `requirements.txt`. Hay dos avisos de deprecación de Starlette/AnyIO en TestClient que deben revisarse al actualizar dependencias.
