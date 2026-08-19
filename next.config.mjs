/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  images: {
    // Artwork optimization is on: every poster/backdrop/logo is a next/image
    // whose src is a relative /api/image/<encoded-upstream> URL (the
    // SSRF-guarded proxy in app/api/image). The upstream URL is carried as a
    // path segment, not a query string, so the optimizer never needs a
    // localPatterns entry and no CDN allowlist is required.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
  experimental: {
    // Rewrite barrel imports to direct paths at build time. Cuts the
    // 200-800ms lucide-react cold-start cost on every page load. base-ui
    // is imported via subpath (`@base-ui/react/button`) so it has no
    // barrel to rewrite — keep it out of this list.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
