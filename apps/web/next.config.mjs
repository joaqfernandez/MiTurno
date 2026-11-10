const isDev = process.env.NODE_ENV === 'development';

/** Origen de la API cuando el navegador la llama directamente (otro dominio); vacío si se usa el proxy /api. */
function apiOrigin() {
  try {
    return process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : '';
  } catch {
    return '';
  }
}

// Las sesiones se guardan en el navegador: estas reglas limitan qué puede cargar la página y a dónde puede
// enviar datos, y no dejan que otro sitio la muestre dentro de un marco. Next necesita scripts en línea
// ('unsafe-inline'); en desarrollo además 'unsafe-eval' y WebSocket para recargar los cambios.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Fotos de médicos: archivo subido (data:) o dirección https.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin()}${isDev ? ' ws:' : ''}`.trim(),
  // Mapa de «Dónde atiende».
  'frame-src https://www.google.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // El navegador solo la tiene en cuenta por HTTPS; en localhost no tiene efecto.
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
];

/** @type {import('next').NextConfig} */
export default {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    // Proxy al backend en desarrollo — evita CORS y simplifica cookies.
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*` }];
  },
};
