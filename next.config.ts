import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.magicpatterns.com',
        pathname: '/patterns/generated-images/**',
      },
    ],
  },
};

export default nextConfig;
