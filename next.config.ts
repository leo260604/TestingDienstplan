import type { NextConfig } from 'next';

/* Interne Weiterleitungen nach Server-Aktionen (Login/Logout) direkt über 127.0.0.1 statt über den Hostnamen
   des Proxys – auf dem Server ist „localhost“ nicht auflösbar (Log: „failed to get redirect response … ENOTFOUND localhost“). */
if (process.env.NODE_ENV === 'production' && !process.env.__NEXT_PRIVATE_ORIGIN) process.env.__NEXT_PRIVATE_ORIGIN = `http://127.0.0.1:${process.env.PORT || 3000}`;

const nextConfig: NextConfig = {
  // Eigenständiges Server-Bundle für das Docker-Image
  output: 'standalone',
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // Service Worker immer frisch laden, damit Updates sofort greifen
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
