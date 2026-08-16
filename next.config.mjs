/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  images: {
    unoptimized: true,
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
