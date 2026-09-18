/** @type {import('next').NextConfig} */
export default {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  async rewrites() {
    // Proxy al backend en desarrollo — evita CORS y simplifica cookies.
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*` }];
  },
};
