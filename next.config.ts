import type { NextConfig } from 'next';

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
