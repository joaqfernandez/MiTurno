import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';
  return {
    rules: {
      userAgent: '*',
      allow: ['/'],
      disallow: ['/panel/', '/admin/', '/mis-turnos', '/mi-historia', '/login', '/registro', '/recuperar-contrasena', '/restablecer-contrasena', '/verificar-email'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
