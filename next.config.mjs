/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  images: {
    unoptimized: true,
  },
  // ffmpeg-static ships a platform binary inside the package; it must stay
  // external so Turbopack doesn't try to bundle it and Vercel includes the
  // full package (with the linux binary) in the /api/play function.
  serverExternalPackages: ['ffmpeg-static'],
  experimental: {
    // Rewrite barrel imports to direct paths at build time. Cuts the
    // 200-800ms lucide-react cold-start cost on every page load. base-ui
    // is imported via subpath (`@base-ui/react/button`) so it has no
    // barrel to rewrite — keep it out of this list.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
