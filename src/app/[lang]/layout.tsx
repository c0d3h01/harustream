import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { preconnect } from 'react-dom';
import { UnderDevelopmentToast } from '@/components/layout/UnderDevelopmentToast';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { Toaster } from '@/components/ui/toast';
import {
  hasLocale,
  LOCALE_COOKIE,
  LOCALES,
  LocaleProvider,
  readLocalePreference,
} from '@/lib/i18n';
import '../globals.css';

// Resource origin to warm up on first paint: the provider API (featured
// feed). Poster artwork is not preconnected anymore — every next/image loads
// through the same-origin /api/image proxy (SSRF-guarded, optimized), so the
// browser never talks to the artwork CDNs directly.
const PROVIDER_ORIGIN = process.env.NEXT_PUBLIC_PROVIDER_API_URL?.trim() || '';

export const metadata: Metadata = {
  title: `HaruStream — Find your next story`,
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
  manifest: '/favicon/manifest.json',
};

export const viewport: Viewport = {
  // allow user zoom up to 5x (a11y floor) but disable auto-shrink on mobile
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  colorScheme: 'dark',
  // Single dark liquid-glass theme. The theme-color matches the --background
  // token (oklch(0.12 0 0) ≈ #121212).
  themeColor: '#121212',
};

/** Prerender every supported locale segment. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  // The route segment is the source of truth for the rendered language —
  // /ja/settings always renders Japanese, shareable and bookmarkable. The
  // cookie only records the explicit settings choice (or 'auto'), which the
  // middleware uses to redirect bare paths like /settings.
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const cookieStore = await cookies();
  const preference = readLocalePreference(cookieStore.get(LOCALE_COOKIE)?.value);

  // Warm up the connection the home screen needs most: the provider API
  // (featured feed). React DOM resource hint emits the preconnect link
  // during SSR instead of a manual <link> tag. Comes from env so it can be
  // swapped without a code change.
  if (PROVIDER_ORIGIN) {
    preconnect(PROVIDER_ORIGIN);
  }

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}
    >
      <body className="antialiased">
        <LocaleProvider locale={lang} preference={preference}>
          <MotionProvider>{children}</MotionProvider>
          <Toaster />
          <UnderDevelopmentToast />
        </LocaleProvider>
      </body>
    </html>
  );
}
