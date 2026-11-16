import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The stats route replays each race with the rally rules, read from this file at run time.
  outputFileTracingIncludes: {
    '/api/rally/stats': ['./public/games/rally.wasm'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.magicpatterns.com',
        pathname: '/patterns/generated-images/**',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
