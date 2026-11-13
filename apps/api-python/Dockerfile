# Imagen de la API y del worker de MiTurno (la misma imagen, distinto comando). Guía: docs/DEPLOY.md
#
#   API:        comando por defecto (CMD de abajo)
#   Worker:     python -m app.worker
#   Migración:  python -m alembic upgrade head   (pre-deploy de la API en Railway)
#
# Se construye con apps/api-python como contexto:
#   docker build -t miturno-api apps/api-python

# ---- Etapa 1: instala las dependencias en un entorno aislado ----
FROM python:3.14-slim AS dependencias
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
COPY requirements.txt .
RUN /opt/venv/bin/pip install -r requirements.txt

# ---- Etapa 2: imagen final, sin herramientas de compilación ni caché de pip ----
FROM python:3.14-slim
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000 \
    FORWARDED_ALLOW_IPS="*"
# FORWARDED_ALLOW_IPS="*" (equivale a --forwarded-allow-ips): de qué direcciones uvicorn acepta las cabeceras
# que traen la IP real del usuario. Va "*" porque:
#   1. Railway no publica las direcciones de su proxy tal como las ve el contenedor, y pueden cambiar
#      (docs.railway.com/networking/public-networking/specs-and-limits, consultado el 2026-11-13).
#   2. El contenedor no tiene puerto público propio: el tráfico HTTP solo entra por el proxy de Railway.
# Si alguna vez la API se publica por otro camino (TCP proxy, otro hosting), hay que cambiar este valor por las
# direcciones del proxy: con "*" cualquiera que llegue directo podría inventar su IP.
# PENDIENTE de verificar en staging (docs/DEPLOY.md, «Verificar la IP real»): Railway documenta la cabecera
# X-Real-IP; uvicorn lee X-Forwarded-For.

RUN useradd --system --uid 10001 --no-create-home miturno
WORKDIR /app
COPY --from=dependencias /opt/venv /opt/venv
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
USER miturno

EXPOSE 3000
# Para Docker local. Railway usa su propio healthcheck (Settings → Healthcheck Path = /api/health).
# El worker no atiende HTTP: localmente se corre con --no-healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"

# Un solo proceso (sin --workers): el límite de pedidos por IP se guarda en memoria del proceso.
# sh -c para que $PORT se reemplace; exec para que uvicorn reciba la señal de apagado de Railway.
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port \"$PORT\" --proxy-headers"]
