import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'harustream';

// Resource origins to warm up on first paint: the provider API (featured
// feed) plus any poster-artwork CDNs. All read from env so no third-party
// host is hardcoded in the bundle.
const PROVIDER_ORIGIN = process.env.NEXT_PUBLIC_PROVIDER_API_URL?.trim() || '';
const IMAGE_ORIGINS = (process.env.NEXT_PUBLIC_IMAGE_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const metadata: Metadata = {
  title: `${SITE_NAME} — Find your next story`,
  description: 'A cinematic streaming experience built on community provider sources.',
  generator: 'next.js',
  icons: {
    icon: [
      {
        url: '/favicon/icon.ico',
        type: 'image/x-icon',
      },
      {
        url: '/favicon/icon.png',
        type: 'image/png',
        sizes: '96x96',
      },
      {
        url: '/favicon/icon-light-32x32.png',
        type: 'image/png',
        sizes: '32x32',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon/icon-dark-32x32.png',
        type: 'image/png',
        sizes: '32x32',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/favicon/icon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
      },
    ],
    apple: [
      {
        url: '/favicon/apple-touch-icon.png',
        sizes: '180x180',
      },
    ],
  },
  manifest: '/favicon/site.webmanifest',
};

export const viewport: Viewport = {
  // allow user zoom up to 5x (a11y floor) but disable auto-shrink on mobile
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  colorScheme: 'dark',
  // Single dark theme. A light theme-color would flash the browser chrome
  // white on first paint on iOS Safari before the dark CSS loads. Matches
  // the graphite default background (oklch(0.13 0.005 0)).
  themeColor: '#090707',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Restore the persisted theme before first paint so the page doesn't
            flash one theme then swap. Falls back to the default (graphite)
            when nothing is stored. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem('harustream:settings')||'{}');var t=s&&s.theme;if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
        {/* Warm up the connections the home screen needs most: the provider
            API (featured feed) and the CDNs that host the poster artwork.
            Both lists come from env so they can be swapped without a code
            change. */}
        {PROVIDER_ORIGIN && <link rel="preconnect" href={PROVIDER_ORIGIN} />}
        {IMAGE_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} />
        ))}
      </head>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
