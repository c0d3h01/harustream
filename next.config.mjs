/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';
// React dev mode reconstructs call stacks via eval(); production never uses
// eval, so keep 'unsafe-eval' out of the prod policy.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

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
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "media-src 'self' https: blob:",
              "connect-src 'self' https: blob:",
              'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
