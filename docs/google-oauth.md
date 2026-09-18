# Google: acceso a MiTurno y conexión de Calendar

Son dos autorizaciones independientes. El acceso pide `openid email profile` y
crea un paciente si no existe. Calendar se conecta desde la configuración del
médico y pide permisos de eventos y email. Iniciar sesión no conecta Calendar.

## Configuración

1. En Google Cloud, configurar la pantalla de consentimiento y un cliente OAuth
   de tipo **Aplicación web**. Habilitar Google Calendar API. Si la aplicación está
   en modo de pruebas, agregar las cuentas que van a probarla como usuarios de prueba.
2. Configurar en el entorno de la API:

   ```dotenv
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_LOGIN_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/google/callback
   WEB_URL=http://localhost:3001
   ```

   Registrar ambas URI exactas como redirecciones autorizadas en Google.
   Mantener el secreto solamente en el backend. Calendar también requiere
   `ENCRYPTION_KEY` para cifrar sus tokens.

3. Cookies y dominios: usar HTTPS en producción y `NODE_ENV=production`.
   La API y la web deben estar en el mismo sitio (por ejemplo `api.miturno.com`
   y `app.miturno.com`), o usar el proxy `/api` de Next con todas las URI OAuth
   apuntando al dominio de la web. Con API en otro origen, configurar
   `NEXT_PUBLIC_API_URL` con su origen; los requests de Calendar y entrega de
   sesión incluyen credenciales. No mezclar callback en un host con requests
   posteriores al proxy en otro host: las cookies son propias de cada host.
   En localhost los puertos 3000 y 3001 comparten host; no mezclar `localhost`
   con `127.0.0.1`. Si web y API están en sitios distintos, usar el proxy y
   dejar `NEXT_PUBLIC_API_URL` sin definir y configurar `API_URL` en el entorno
   de Next con el destino del backend; las cookies `SameSite=Lax` no sirven para
   fetch entre sitios. En ese caso ambas URI de callback deben usar el origen
   público de la web, seguido de `/api/auth/google/callback` o
   `/api/calendar/google/callback` respectivamente.

## Base de datos

Este repositorio todavía no versiona un historial de migraciones Prisma. Para
una base nueva, seguir la inicialización del README con el esquema actualizado.
Para una base existente sin historial de migraciones, aplicar una sola vez:

```sh
cd apps/api
npx prisma db execute --schema prisma/schema.prisma --file prisma/updates/20260918_google_oauth.sql
npx prisma generate
```

Si tu entorno ya tiene migraciones Prisma, generar e incorporar la migración
`google_oauth` en ese historial usando el esquema actualizado, en lugar de
ejecutar el SQL manualmente. No aplicar ambos caminos sobre la misma base.

## Comportamiento y protección

- Cada autorización tiene un `state` aleatorio de 256 bits, un hash en DB y
  una cookie de vinculación `HttpOnly`, `SameSite=Lax`, `Secure` en producción.
  Vence a los 10 minutos. Se verifica antes de canjear el código de Google.
- El estado está separado por propósito y se consume mediante un borrado
  condicional: solo un callback puede usarlo, incluso con varias instancias.
  El médico se recupera del registro guardado, nunca de un ID recibido en `state`.
- El login verifica el ID token con la biblioteca de Google (firma, audiencia,
  emisor y vencimiento), exige email verificado y comprueba `nonce`.
- La identidad estable es `sub`. Un usuario nuevo recibe exclusivamente el rol
  paciente. Un usuario existente conserva sus perfiles y roles.
- Un email existente no se vincula solo por coincidir: el usuario ingresa su
  contraseña una vez y vuelve a Google para confirmar el mismo email. El endpoint
  `POST /api/auth/google/link` requiere JWT y vincula el estado al usuario autenticado.
  Se conservan sus roles y perfiles. Los siguientes ingresos usan Google directamente.
  Esto evita asociar una identidad a una cuenta local sin comprobar acceso a ambas.
  Las cuentas suspendidas no reciben tokens.
- El callback de login entrega un ticket por cookie `HttpOnly`, válido 60 segundos
  y de un solo uso. La web lo canjea con un POST cuyo `Origin` debe ser `WEB_URL`.
  Los JWT y refresh tokens no se incluyen en URLs. La sesión de la web mantiene
  el mecanismo existente de almacenamiento local.
- Las solicitudes vencidas se eliminan al crear nuevas solicitudes. Iniciar
  nuevamente un mismo flujo en otro tab reemplaza su cookie: se completa el
  intento más reciente; el anterior debe reiniciarse.

## Verificación

```sh
npm run test:oauth --workspace apps/api
```

Las pruebas automatizadas usan dobles de Google y de la base de datos. Cubren
estado ausente, alterado, vencido, repetido, de otro navegador o propósito,
consumo concurrente, nonce inválido, claims inválidos, creación de pacientes,
roles existentes, cuentas suspendidas y entrega de sesión con validación de origen.

Con credenciales reales, verificar además:

1. Login de un paciente nuevo, cierre de sesión y segundo login sin duplicar usuario.
2. Login de un médico ya registrado: verificar contraseña para vincular, elegir
   el mismo email de Google y conservar su panel; el segundo ingreso usa solo Google.
3. Conexión de Calendar desde una sesión real de médico y sincronización de un turno.
4. Cancelar el consentimiento: mostrar error y permitir reiniciar.
5. Repetir un callback o abrirlo en otro navegador: no crear sesión ni vincular Calendar.

Referencia: [OpenID Connect de Google](https://developers.google.com/identity/openid-connect/openid-connect).
