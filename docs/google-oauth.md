# Google: login y Calendar en Python

El backend activo es FastAPI. Login (`openid email profile`) y Calendar son consentimientos separados. Iniciar sesión no concede acceso al calendario.

## Configurar y arrancar

En `apps/api-python/.env` configurar:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_LOGIN_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/google/callback
API_URL=http://localhost:3000
WEB_URL=http://localhost:3001
APP_ENV=development
```

Registrar ambas URI exactas en un cliente OAuth de tipo Aplicación web en Google Cloud. Configurar pantalla de consentimiento y usuarios de prueba; habilitar Calendar API. Calendar también necesita `ENCRYPTION_KEY` (generada por `npm run setup:api`). No compartir secretos ni incluirlos en el frontend.

Si se omiten las URI, se derivan de API_URL. En producción usar `APP_ENV=production` y HTTPS, incluidas las URI explícitas. No mezclar localhost con 127.0.0.1. Web y API deben compartir sitio; para dominios de sitios distintos usar el proxy Next `/api`, los callbacks bajo el origen web y API_URL del servidor Next apuntando al backend. Las cookies HttpOnly/SameSite=Lax son propias del host.

```bash
npm run db:migrate
npm run dev
```

Alembic `0002` añade identidad Google y solicitudes temporales, conservando usuarios, turnos e historias existentes. No usar Prisma ni ejecutar el antiguo SQL NestJS. Si ya tenés una base de desarrollo, no hace falta volver a cargar el seed.

## Comportamiento

- Un usuario nuevo de Google recibe solamente PATIENT y un perfil de paciente.
- Si ya existe su email, se pide contraseña y un nuevo consentimiento para vincular ambas cuentas. No se vinculan automáticamente por email.
- La identidad estable es `sub`. Los roles y perfiles existentes se conservan. Usuarios pendientes o suspendidos no reciben sesión.
- PyJWT verifica firma RS256 con claves públicas Google, audiencia, emisor, expiración e identidad. Se exige email verificado y nonce correspondiente al intento.
- El estado aleatorio está ligado a una cookie HttpOnly independiente, vence a los 10 minutos y se consume una vez mediante DELETE condicional. Incluso un fallo del proveedor invalida el intento consumido.
- El callback entrega un ticket HttpOnly de 60 segundos. La web lo canjea por POST con Origin validado; no se ponen JWT ni refresh tokens en las URLs. El ticket tiene un solo ganador bajo concurrencia PostgreSQL.
- Contraseña y Google comparten el mapeo de sesión: access token, refresh token, perfil del paciente y rol ADMIN/DOCTOR/PATIENT.
- Cancelar un consentimiento válido de Calendar vuelve a configuración con un mensaje de error y consume el intento.

## Pruebas

```bash
npm run test:api
npm run test:web
npm run test:e2e
npm run build:web
```

Las pruebas Python verifican JWT firmados con una clave RSA de prueba; solo el transporte Google y la fuente de claves se sustituyen. Cubren firmas/claims inválidos, estado ausente/alterado/vencido/de otro navegador/propósito, replay, creación, vinculación, suspensión, ticket, Origin, errores del proveedor y migración sin pérdida de datos.

Los recorridos de navegador usan la aplicación, cookies, sesiones y base real temporal; únicamente Google se simula en `scripts/e2e_backend.py`. Este adaptador no está disponible en el arranque normal ni en producción. Las pruebas PostgreSQL de `tests/test_postgres.py` incluyen competencia por estados y tickets. Ver README para configurar TEST_POSTGRES_URL.

## Prueba manual pendiente con Google real

Con credenciales y usuarios de prueba configurados:

1. Ingresar con una cuenta nueva, salir y repetir sin duplicar usuario.
2. Vincular una cuenta existente usando contraseña; comprobar mismo perfil, historia y rol.
3. Probar paciente, médico y administrador, incluida renovación al vencer el access token.
4. Cancelar consentimiento y volver a intentar; repetir un callback debe fallar.
5. Conectar Calendar desde el panel médico, reservar/cancelar un turno y comprobar el evento en Google.

La aprobación automatizada no sustituye esta validación de credenciales, pantalla de consentimiento y callbacks públicos.

Referencias: [OpenID Connect de Google](https://developers.google.com/identity/openid-connect/openid-connect), [verificación de JWT con PyJWT](https://pyjwt.readthedocs.io/en/stable/usage.html).
