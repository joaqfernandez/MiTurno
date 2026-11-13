# Desplegar MiTurno en Railway

Guía para publicar MiTurno en internet, escrita para alguien que nunca desplegó nada. Cubre dos entornos: **staging** (datos ficticios, para probar) y **production** (datos reales). Siempre se arma primero staging.

> **Estado al 2026-11-13.** Los archivos de despliegue están en el repositorio y se probaron en esta máquina (ver [Qué se verificó](#qué-se-verificó-y-qué-no)). **Nada de esto se probó todavía en Railway, R2, Cloudflare ni Resend**: no hay cuentas creadas. Lo que dice esta guía sobre esos paneles sale de su documentación, consultada el 2026-11-13; los nombres de los botones pueden diferir. Al hacer el primer despliegue, corregir acá lo que no coincida.

**Regla de oro: el repositorio es público.** Ningún valor real (claves, contraseñas, tokens) se escribe en un archivo del repositorio. Los valores se cargan solo en los paneles de Railway, Cloudflare y GitHub.

## Qué se despliega

Cada entorno tiene cinco servicios dentro de un mismo proyecto de Railway:

| Servicio | Qué hace | Se construye con | Recibe visitas de internet |
| --- | --- | --- | --- |
| `Postgres` | La base de datos (PostgreSQL 16) | Plantilla de Railway | No |
| `api` | La API (FastAPI) | [`apps/api-python/Dockerfile`](../apps/api-python/Dockerfile) | Sí |
| `worker` | Envía emails y recordatorios, vence reservas | El mismo Dockerfile, con otro comando | No |
| `web` | El sitio (Next.js) | [`apps/web/Dockerfile`](../apps/web/Dockerfile) | Sí |
| `backup` | Copia diaria cifrada de la base a Cloudflare R2 | [`infra/backup/Dockerfile`](../infra/backup/Dockerfile) | No |

Direcciones propuestas:

| | Web | API |
| --- | --- | --- |
| staging | `https://staging.miturnosapp.com` | `https://api-staging.miturnosapp.com` |
| production | `https://miturnosapp.com` | `https://api.miturnosapp.com` |

### Por qué no hay archivos `railway.json`

Railway dejó obsoletos los archivos `railway.json` / `railway.toml`: los servicios nuevos ya no pueden usarlos y dejan de leerse el 2026-12-01 ([documentación](https://docs.railway.com/reference/config-as-code)). El reemplazo (`.railway/railway.ts`) se aplica con un comando y un token, y su documentación no cubre varias opciones que necesitamos. Decisión del fundador (2026-11-13): **la configuración de cada servicio se carga a mano en el panel de Railway, siguiendo las tablas de esta guía.** Si se cambia algo en el panel, actualizar esta guía en el mismo momento: es el único registro.

## Paso 1 — Cuentas (una sola vez)

- [ ] Railway, plan Hobby, conectado a la cuenta de GitHub con acceso al repositorio `MiTurno`.
- [ ] Cloudflare (ya existe: ahí está el dominio). Activar **R2** en el panel.
- [ ] Resend (ya existe).

## Paso 2 — Claves de cifrado de los backups (una sola vez por entorno)

Los backups contienen datos de salud: se cifran con [age](https://age-encryption.org) antes de salir de Railway. Hay dos claves:

- **Clave pública** (empieza con `age1…`): sirve solo para cifrar. Va en Railway.
- **Clave privada** (empieza con `AGE-SECRET-KEY-…`): sirve para descifrar. **Nunca va en Railway ni en Git.** Vive en esta computadora y en un gestor de contraseñas.

Con Docker Desktop abierto, desde la raíz del proyecto:

```bash
docker build -t miturno-backup infra/backup
mkdir -p ~/.config/miturno
docker run --rm miturno-backup age-keygen > ~/.config/miturno/backup-age-key-staging.txt
chmod 600 ~/.config/miturno/backup-age-key-staging.txt
grep "public key" ~/.config/miturno/backup-age-key-staging.txt
```

El último comando muestra la clave pública: es el valor de `AGE_RECIPIENT` en Railway. Repetir con `production` en lugar de `staging` para el otro entorno (claves distintas por entorno).

> ⚠️ **Guardar una copia del archivo de la clave privada en un gestor de contraseñas.** Si se pierde, los backups de ese entorno no se pueden descifrar nunca más. Si alguien la obtiene, puede leer todos los backups.

## Paso 3 — Bucket de backups en Cloudflare R2

1. Cloudflare → **R2** → crear un bucket privado (por ejemplo `miturno-backups`). Un solo bucket sirve para los dos entornos: cada uno escribe en su carpeta (`staging/`, `production/`).
2. **Borrado automático a los 30 días:** bucket → *Settings* → *Object lifecycle rules* → agregar una regla que **borre los objetos 30 días después de subidos**, sin prefijo (aplica a todo el bucket).
3. **Token de acceso:** R2 → *Manage API tokens* → crear un token con permiso *Object Read & Write*, **limitado a ese bucket**. Anotar en el gestor de contraseñas: *Access Key ID*, *Secret Access Key* y el *Account ID* de Cloudflare. Conviene un token por entorno.

Los archivos quedan con este nombre: `production/2026-11-13T03-00Z.dump.age` (fecha y hora UTC).

Límite conocido: ese token puede borrar backups. Si alguien entrara a Railway podría borrarlos, pero no leerlos (están cifrados). R2 ofrece reglas de retención (*bucket locks*) que impiden borrar antes de un plazo; evaluarlo antes de producción.

## Paso 4 — Proyecto y servicios en Railway

Crear un proyecto. Railway crea el entorno `production`; crear además el entorno `staging` y **armar todo primero en `staging`**. Los servicios se configuran por entorno.

En cada servicio que sale del repositorio: *Settings → Source* → repositorio `MiTurno`, rama `main`.

### `Postgres`

Agregar la plantilla **PostgreSQL** de Railway. Confirmar en su pantalla que la versión sea **16**. Si fuera más nueva, cambiar la primera línea de `infra/backup/Dockerfile` a esa versión (el programa de backup no puede copiar un servidor más nuevo que él). No activar el acceso público.

### `api`

| Ajuste | Valor |
| --- | --- |
| Root Directory | `/apps/api-python` |
| Builder | Dockerfile (Railway lo detecta solo) |
| Watch Paths | `/apps/api-python/**` |
| Pre-deploy Command | `python -m alembic upgrade head` |
| Custom Start Command | *(vacío: usa el del Dockerfile)* |
| Healthcheck Path | `/api/health` |
| Healthcheck Timeout | `120` |
| Restart Policy | On Failure, máximo 10 reintentos |
| Replicas | **1** |
| Wait for CI | Activado |
| Dominio | el de la API del entorno (Paso 6) |

- **Pre-deploy:** las migraciones corren antes de que arranque la versión nueva; si fallan, el despliegue se cancela y sigue funcionando la versión anterior.
- **Una sola réplica, siempre:** el límite de pedidos por IP se guarda en la memoria del proceso. Con dos réplicas el límite real se duplica.
- **Healthcheck:** Railway lo consulta solo al desplegar, para decidir si la versión nueva recibe tráfico. No avisa si la API se cae después: esa alerta es un pendiente aparte (BETA.md, «Monitoreo de errores»).

### `worker`

| Ajuste | Valor |
| --- | --- |
| Root Directory | `/apps/api-python` |
| Watch Paths | `/apps/api-python/**` |
| Custom Start Command | `python -m app.worker` |
| Pre-deploy Command | *(vacío: las migraciones las corre `api`)* |
| Healthcheck Path | *(vacío: no atiende pedidos web)* |
| Restart Policy | Always |
| Replicas | 1 |
| Wait for CI | Activado |
| Dominio | ninguno |

Usa exactamente la misma imagen que `api`. Como `api` y `worker` se despliegan a la vez, el worker nuevo puede arrancar unos segundos antes de que termine la migración: si falla, Railway lo reinicia solo.

### `web`

| Ajuste | Valor |
| --- | --- |
| Root Directory | *(vacío: la raíz del repositorio)* |
| Variable `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` |
| Watch Paths | `/apps/web/**`, `/package.json`, `/package-lock.json` |
| Healthcheck Path | `/` |
| Healthcheck Timeout | `120` |
| Restart Policy | On Failure, máximo 10 reintentos |
| Wait for CI | Activado |
| Dominio | el de la web del entorno (Paso 6) |

La web se construye desde la raíz porque ahí está `package-lock.json`.

### `backup`

| Ajuste | Valor |
| --- | --- |
| Root Directory | `/infra/backup` |
| Watch Paths | `/infra/backup/**` |
| Cron Schedule | `0 3 * * *` |
| Restart Policy | Never |
| Dominio | ninguno |

`0 3 * * *` es todos los días a las 03:00 UTC (00:00 de Argentina). El servicio arranca, hace la copia y termina. Si algo falla termina con código de error y Railway muestra la ejecución como fallida. **Todavía no hay alerta automática:** hasta agregarla, mirar una vez por semana que haya un archivo por día en R2 (BETA.md, Fase 4).

Los **Watch Paths** hacen que un cambio en la web no vuelva a desplegar la API, y al revés.

## Paso 5 — Variables

Se cargan en Railway, en la pestaña *Variables* de cada servicio y entorno. 🔒 = secreta: no copiarla a ningún archivo, chat ni captura de pantalla.

Para generar un secreto aleatorio (correrlo una vez por cada secreto y por cada entorno):

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### `api` y `worker` (las mismas en los dos servicios)

Para no cargarlas dos veces, definirlas como *Shared Variables* del entorno y referenciarlas desde ambos servicios.

| Variable | 🔒 | Valor | ¿Distinta en staging y production? |
| --- | --- | --- | --- |
| `APP_ENV` | | `production` **en los dos entornos** (ver nota) | No |
| `DATABASE_URL` | 🔒 | `${{Postgres.DATABASE_URL}}` (referencia; Railway pone el valor) | Sí, automática |
| `JWT_ACCESS_SECRET` | 🔒 | Generado con el comando de arriba | **Sí** |
| `ENCRYPTION_KEY` | 🔒 | Generado con el comando de arriba. **No cambiarla nunca** en un entorno con datos | **Sí** |
| `WEB_URL` | | Dirección de la web del entorno, con `https://` | Sí |
| `API_URL` | | Dirección de la API del entorno, con `https://` | Sí |
| `RESEND_API_KEY` | 🔒 | Se crea en Resend → API Keys (una por entorno) | **Sí** |
| `EMAIL_FROM` | | `MiTurno <no-reply@miturnosapp.com>` | Puede ser igual |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 🔒, `GOOGLE_LOGIN_REDIRECT_URI`, `GOOGLE_REDIRECT_URI` | | Solo si se habilita Google; ver [google-oauth.md](google-oauth.md) | Sí |

- **`APP_ENV=production` también en staging.** La API solo acepta `development` o `production`; con `production` exige HTTPS, email real y claves válidas, que es lo que queremos probar en staging. Lo que diferencia a staging son sus direcciones, su base y sus claves.
- **No cargar** `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (la seña queda desactivada en la beta), `DEV_MAILBOX_DIR` (la API no arranca en producción si existe) ni `PORT` (la define Railway).
- Si falta una variable obligatoria o es inválida, la API **no arranca** y el despliegue falla con un mensaje que dice cuál es. Es intencional (`tests/test_config.py`).

### `web`

Ninguna es secreta: quedan visibles en el navegador.

| Variable | Valor | ¿Distinta por entorno? |
| --- | --- | --- |
| `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` | No |
| `NEXT_PUBLIC_API_URL` | Dirección de la API del entorno, con `https://` | Sí |
| `NEXT_PUBLIC_SITE_URL` | Dirección de la web del entorno, con `https://` | Sí |
| `API_URL` | Igual que `NEXT_PUBLIC_API_URL` | Sí |

> ⚠️ **Estas tres direcciones quedan fijadas cuando se compila la imagen.** Si se cambian en Railway, hay que **volver a desplegar** la web para que tomen efecto. Si falta alguna, la compilación falla a propósito.

El navegador llama directo a la API (`NEXT_PUBLIC_API_URL`), que es la opción recomendada en BETA.md: así la API ve la IP de cada usuario.

### `backup`

| Variable | 🔒 | Valor | ¿Distinta por entorno? |
| --- | --- | --- | --- |
| `DATABASE_URL` | 🔒 | `${{Postgres.DATABASE_URL}}` | Sí, automática |
| `BACKUP_ENV` | | `staging` o `production` | **Sí** |
| `AGE_RECIPIENT` | | Clave **pública** de age del entorno (Paso 2) | **Sí** |
| `R2_ACCOUNT_ID` | | Account ID de Cloudflare | No |
| `R2_ACCESS_KEY_ID` | 🔒 | Del token de R2 (Paso 3) | Conviene |
| `R2_SECRET_ACCESS_KEY` | 🔒 | Del token de R2 | Conviene |
| `R2_BUCKET` | | Nombre del bucket | No |

## Paso 6 — DNS en Cloudflare

En Railway, en `web` y en `api`: *Settings → Networking → Custom Domain* → escribir la dirección. Railway muestra los registros DNS que hay que crear. En Cloudflare → `miturnosapp.com` → *DNS* → agregar **exactamente** lo que muestre Railway. Como referencia:

| Tipo | Nombre | Destino | Proxy |
| --- | --- | --- | --- |
| CNAME | `staging` | el que indique Railway para `web` de staging | **DNS only (nube gris)** |
| CNAME | `api-staging` | el que indique Railway para `api` de staging | **DNS only** |
| CNAME | `@` (la raíz) | el de `web` de production | **DNS only** |
| CNAME | `api` | el de `api` de production | **DNS only** |

- **Nube gris (DNS only), no naranja.** Con el proxy de Cloudflare activado, la API vería la IP de Cloudflare en lugar de la del usuario y el límite por IP dejaría de servir. Activarlo más adelante requiere un cambio en la API: avisar antes.
- Railway emite el certificado HTTPS solo; puede tardar unos minutos.

### Resend (email)

1. Resend → *Domains* → *Add Domain* → `miturnosapp.com`.
2. Resend muestra varios registros (DKIM, SPF y un MX para el subdominio de envío). Copiarlos **tal cual** a Cloudflare → DNS, todos en *DNS only*.
3. Agregar DMARC si Resend no lo pide: TXT, nombre `_dmarc`, valor `v=DMARC1; p=none;` (modo observación; endurecerlo después de la beta).
4. En Resend, *Verify*. Cuando el dominio figure verificado, crear una API Key por entorno y cargarla como `RESEND_API_KEY`.
5. Anotar el país donde Resend guarda los datos: falta en los borradores legales (`docs/legal/`).

## Paso 7 — Que Railway despliegue solo con el CI en verde

En `api`, `worker` y `web`: *Settings → Source* → activar **Wait for CI**. Railway espera a que terminen las verificaciones de GitHub Actions de ese commit; si alguna falla, no despliega. Funciona porque nuestro workflow (`.github/workflows/ci.yml`) corre en cada push a `main`. La primera vez Railway pide aceptar permisos nuevos en GitHub.

Además, en GitHub → *Settings → Branches*, proteger `main` para que no se pueda mezclar un PR con el CI en rojo (pendiente en [CI.md](CI.md)).

**Decisión pendiente para producción:** si los dos entornos siguen la rama `main`, cada mezcla despliega staging y producción al mismo tiempo, sin probar antes en staging. Para la beta conviene que producción **no** se despliegue sola (desactivar el despliegue automático en ese entorno y desplegar a mano después de probar en staging) o que siga una rama aparte. Definirlo al crear producción (BETA.md, Fase 4).

## Paso 8 — Checklist del primer despliegue (staging)

- [ ] Pasos 1 a 7 completos en el entorno `staging`.
- [ ] `backup`: correrlo una vez a mano (botón de ejecutar del servicio cron) y ver el archivo en R2, carpeta `staging/`.
- [ ] `api` desplegada: el registro del despliegue muestra las migraciones y después el arranque.
- [ ] Abrir `https://api-staging.miturnosapp.com/api/health` → responde `{"status":"ok","backend":"python"}`.
- [ ] Abrir `https://api-staging.miturnosapp.com/docs` → responde «Not Found» (correcto: no se publica).
- [ ] `worker` en ejecución, sin reinicios repetidos.
- [ ] Abrir `https://staging.miturnosapp.com` → carga la página de inicio.
- [ ] **Verificar la IP real** (ver abajo).
- [ ] Crear el administrador (ver abajo) y recibir el email.
- [ ] Registrar un paciente de prueba, confirmar el email e ingresar.
- [ ] Hacer el simulacro de restauración (sección siguiente) y marcarlo en BETA.md.
- [ ] No cargar datos demo: el seed está bloqueado en producción y staging corre con `APP_ENV=production`.

### Verificar la IP real

La API limita los intentos de ingreso por IP. Hay que confirmar que ve la IP de cada usuario y que nadie puede falsearla. Desde la terminal:

```bash
curl -H "X-Forwarded-For: 203.0.113.9" https://api-staging.miturnosapp.com/api/health
```

Después, en Railway → `api` → *Logs*, buscar la línea de ese pedido (`GET /api/health`) y mirar la IP con la que empieza:

| La línea muestra… | Significa | Qué hacer |
| --- | --- | --- |
| Tu IP pública (la que sale al buscar «cuál es mi IP») | Funciona | Marcar el punto en BETA.md |
| `203.0.113.9` | Cualquiera puede inventar su IP y saltear el límite | **No abrir la beta.** Avisar al agente: hay que cambiar cómo la API lee la IP |
| Una IP interna (empieza con `10.`, `100.` o `192.168.`) | La API ve al proxy de Railway, no al usuario | Igual que arriba |

Motivo de la duda: Railway documenta que envía la IP del usuario en la cabecera `X-Real-IP`, y el servidor de la API (uvicorn) lee `X-Forwarded-For`. No se pudo comprobar sin un despliegue real.

### Crear el administrador

El comando `npm run admin:create` de esta máquina crea la cuenta en la base **local**. Para staging o producción hay que correrlo dentro del servicio `api` de Railway, con el `worker` funcionando (es quien envía el email). Con la [CLI de Railway](https://docs.railway.com/guides/cli) instalada y el proyecto vinculado:

```bash
railway ssh --service api --environment staging
python -m app.create_admin tu@email.com
```

Llega un email con un link (vence en 30 minutos) para elegir la contraseña. Si vence, usar «¿Olvidaste tu contraseña?». *(El comando `railway ssh` no se probó todavía; si no existe en tu versión, consultar la documentación de la CLI y corregir este paso.)*

## Restaurar un backup

### Simulacro (obligatorio en staging antes de la beta, y después una vez por mes)

Baja el último backup, lo descifra y lo restaura en una base nueva (`miturno_restore`) del PostgreSQL de esta computadora. No toca la base demo ni la de Railway.

1. Abrir Docker Desktop y levantar la base local: `docker compose -p miturno-python up -d --wait`
2. Crear el archivo `infra/backup/restore.env` (está excluido de Git) con cuatro líneas, sin comillas:
   ```
   R2_ACCOUNT_ID=…
   R2_ACCESS_KEY_ID=…
   R2_SECRET_ACCESS_KEY=…
   R2_BUCKET=…
   ```
3. Confirmar que la clave privada está en `~/.config/miturno/backup-age-key-staging.txt` (Paso 2).
4. Correr: `scripts/restore-backup.sh staging`
5. El resultado tiene que terminar con «Restauración verificada» y mostrar:
   - el backup elegido (la fecha debe ser de hoy o de ayer);
   - la versión de migraciones (`alembic current`), igual a la última del código;
   - la cantidad de filas de las tablas principales, parecida a la que se ve en el panel `/admin`.
6. Opcional: mirar los datos con la app local apuntando a esa base. Al terminar, borrarla (contiene datos reales si es de producción):
   `docker compose -p miturno-python exec postgres dropdb -U turnos miturno_restore`
7. Anotar la fecha del simulacro en BETA.md.

Un backup puntual: `scripts/restore-backup.sh production 2026-11-13T03-00Z.dump.age`

### Restauración real (se perdió o se dañó la base de Railway)

Con el plan Hobby se recupera el estado del último backup: **se pierde lo ocurrido desde entonces, hasta un día.** Hacerlo con calma y con un agente acompañando; estos son los pasos:

1. Poner el sitio en pausa: en Railway, detener `web`, `api` y `worker` para que nadie escriba mientras tanto.
2. Hacer el simulacro local de arriba con ese backup y confirmar que los datos están bien.
3. En Railway, crear un servicio PostgreSQL **nuevo** (no borrar el dañado todavía) y activar temporalmente su acceso público para obtener su dirección externa.
4. Restaurar el backup en esa base nueva. El script local solo restaura en esta computadora; para apuntar a Railway hay que correr `infra/backup/restore.sh` con la dirección externa de la base nueva. **Pedirle al agente que lo prepare en el momento**: este paso no está automatizado ni probado.
5. Desactivar el acceso público de la base nueva.
6. Cambiar `DATABASE_URL` de `api`, `worker` y `backup` para que referencien la base nueva y desplegar. El pre-deploy aplica las migraciones que falten.
7. Verificar `/api/health`, ingresar y revisar turnos recientes. Avisar a los médicos qué período se perdió.
8. Recién después, borrar la base dañada.

## Probar los archivos de despliegue en esta máquina

```bash
docker build -t miturno-api apps/api-python
docker build -t miturno-backup infra/backup
docker build -f apps/web/Dockerfile -t miturno-web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.ejemplo.com \
  --build-arg NEXT_PUBLIC_SITE_URL=https://ejemplo.com \
  --build-arg API_URL=https://api.ejemplo.com .

# Ciclo completo de backup y restauración, sin R2 ni claves reales (usa bases propias; no toca la demo):
docker compose -p miturno-python up -d --wait
scripts/test-backup-restore.sh
```

## Qué se verificó y qué no

Ver la entrada del 2026-11-13 en la bitácora de [CI.md](CI.md) para los comandos y resultados exactos.

**Sin verificar hasta tener cuentas:** el despliegue en Railway (ajustes del panel, pre-deploy, Wait for CI, cron), la subida real a R2 y su regla de 30 días, el DNS, Resend, la IP real detrás del proxy y `railway ssh`.

## Límites conocidos

- **Sin restauración a un punto en el tiempo (PITR).** Con el plan Hobby se reemplaza por el backup diario cifrado: en el peor caso se pierde hasta un día de datos. Revisarlo al pasar al plan Pro.
- **Sin alerta si falla el backup o se cae la API.** Pendiente (BETA.md, Fase 2).
- **La región de producción** no se elige hasta hablar con el abogado (BETA.md, Fase 0).
