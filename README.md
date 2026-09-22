# MiTurno

Backend **Python / FastAPI / SQLAlchemy / PostgreSQL**, frontend **TypeScript / Next.js**. El backend NestJS fue retirado; su código queda en el historial Git.

## Ejecutar en esta máquina

Con Docker Desktop abierto, desde la raíz:

```bash
docker compose -p miturno-python up -d --wait
npm run dev
```

Abrí **http://localhost:3001**. El comando inicia web, API (puerto 3000) y worker; Ctrl+C detiene los tres. La base nueva ya tiene datos ficticios persistentes. No hace falta activar el virtualenv manualmente.

| Rol | Email | Contraseña de desarrollo |
| --- | --- | --- |
| Paciente | ana@example.com | DemoTurnos2026! |
| Otro paciente | lucas@example.com | DemoTurnos2026! |
| Médica | valeria@example.com | DemoTurnos2026! |
| Médico | pedro@example.com | DemoTurnos2026! |
| Administrador | admin@example.com | DemoTurnos2026! |

Ingresá con estas cuentas usando el formulario normal. Los botones «demo» son una simulación visual separada; no guardan en PostgreSQL. Ana tiene una historia ficticia y un turno; los médicos atienden de lunes a viernes, 9–13, sin seña para probar sin credenciales externas.

## Instalación desde cero

Verificado con Python 3.14.5, Node 24 y Docker Desktop.

```bash
npm ci
npm run setup:api
docker compose -p miturno-python up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

`setup:api` instala dependencias y genera `apps/api-python/.env` con secretos aleatorios si no existe. El seed conserva los datos si ya fue cargado; no reinicia tus cambios. Está bloqueado en producción. PostgreSQL usa puerto **55432**, base **miturno_python** y volumen independiente: no reemplaza la base anterior.

Si no inicia, verificá Docker y que 3000/3001 estén libres. Probá `npm run dev:api`, `npm run dev:web` y `npm run worker:api` en terminales separadas para identificar el proceso que falla. Salud: http://localhost:3000/api/health. Documentación de endpoints: http://localhost:3000/docs.

## Pruebas

```bash
npm run test:api
npm run test:web
npx playwright install chromium
npm run test:e2e
npm run build:web
```

Las pruebas habituales usan bases SQLite temporales y omiten las de PostgreSQL. Para correr la suite completa, incluidas concurrencia e integridad en PostgreSQL, con Docker iniciado:

```bash
npm run test:api:pg
```

Crean y eliminan bases exclusivas de prueba; no modifican la demo. Los tests de navegador usan API/Next en 3100/3101 y una SQLite temporal.

## Código y estado

- [Contexto y reglas para agentes de IA](AGENTS.md)
- [Verificación automática (CI) y estado de las pruebas](docs/CI.md)
- [Configurar login Google y Calendar](docs/google-oauth.md)
- [Integridad de historias clínicas y enmiendas](docs/integridad-historias-clinicas.md)
- [Cierre de seguridad: sesiones e historias clínicas](docs/CIERRE_SEGURIDAD_SESIONES_HISTORIAS.md)
- [Guía del backend Python](apps/api-python/README.md)
- [Migración, evidencias y límites](docs/MIGRACION_PYTHON.md)
- [Roadmap y deuda pendiente](docs/ROADMAP.md)
- [Auditoría histórica del backend anterior](docs/AUDITORIA.md)

Pagos, Google Calendar y notificaciones tienen adaptadores implementados, pero necesitan credenciales y validación con los proveedores. Sin configuración no se simulan cobros ni envíos exitosos. Adjuntos y exportación PDF siguen pendientes. Esta migración no equivale a una habilitación para producción.
