import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import { preconnect } from 'react-dom';
import './globals.css';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'harustream';

// Resource origin to warm up on first paint: the provider API (featured
// feed). Poster artwork is not preconnected anymore — every next/image loads
// through the same-origin /api/image proxy (SSRF-guarded, optimized), so the
// browser never talks to the artwork CDNs directly.
const PROVIDER_ORIGIN = process.env.NEXT_PUBLIC_PROVIDER_API_URL?.trim() || '';

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
  // Warm up the connection the home screen needs most: the provider API
  // (featured feed). React DOM resource hint emits the preconnect link
  // during SSR instead of a manual <link> tag. Comes from env so it can be
  // swapped without a code change.
  if (PROVIDER_ORIGIN) {
    preconnect(PROVIDER_ORIGIN);
  }

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
      </head>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
