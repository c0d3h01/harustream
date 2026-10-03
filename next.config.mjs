/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    // Immutable caching for /_next/static is handled by Vercel itself. Setting
    // it here as well makes Next warn that a custom Cache-Control breaks dev
    // behaviour, and it buys nothing.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
