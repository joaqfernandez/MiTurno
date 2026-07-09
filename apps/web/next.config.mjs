/** @type {import('next').NextConfig} */
export default {
  async rewrites() {
    // Proxy al backend en desarrollo — evita CORS y simplifica cookies.
    return [{ source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*` }];
  },
};
