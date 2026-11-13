# Imagen de la web de MiTurno (Next.js en modo «standalone»). Guía: docs/DEPLOY.md
#
# Se construye desde la RAÍZ del repositorio, porque package-lock.json está ahí:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.ejemplo.com \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://ejemplo.com \
#     --build-arg API_URL=https://api.ejemplo.com \
#     -t miturno-web .

FROM node:24-slim AS dependencias
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM node:24-slim AS compilacion
WORKDIR /repo
# Estas tres variables quedan FIJADAS en la compilación: cambiarlas en Railway no tiene efecto hasta
# volver a desplegar. Por eso staging y producción compilan cada uno su propia imagen.
# Railway pasa las variables del servicio a la compilación solo si se declaran con ARG.
#   NEXT_PUBLIC_API_URL   dirección de la API que usa el navegador (también entra en la política CSP)
#   NEXT_PUBLIC_SITE_URL  dirección pública de la web (robots.txt y sitemap.xml)
#   API_URL               destino del proxy /api de Next (respaldo; el navegador llama directo a la API)
# Ninguna es secreta: las NEXT_PUBLIC_* quedan visibles en el navegador.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG API_URL
# Sin estas direcciones la web compilaría apuntando a localhost: mejor que el despliegue falle acá.
RUN test -n "$NEXT_PUBLIC_API_URL" && test -n "$NEXT_PUBLIC_SITE_URL" && test -n "$API_URL" \
  || (echo "Faltan NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL o API_URL en la compilación" >&2; exit 1)
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    API_URL=$API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencias /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
RUN npm run build --workspace apps/web

FROM node:24-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001
WORKDIR /app
# «standalone» ya trae solo los archivos necesarios de node_modules; los estáticos se copian aparte.
COPY --from=compilacion --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=compilacion --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
