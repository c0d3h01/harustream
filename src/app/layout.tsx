import type { Metadata, Viewport } from 'next';
import { Anton, Geist } from 'next/font/google';
import { preconnect } from 'react-dom';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

/* Encode-cover display face — heroes, page + section headings only. Anton is
   single-weight condensed caps: the fansub release-cover voice. */
const AntonFont = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
});

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
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: '#0b0c0f',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const PROVIDER_ORIGIN = process.env.NEXT_PUBLIC_PROVIDER_API_URL?.trim() || '';

  if (PROVIDER_ORIGIN) {
    preconnect(PROVIDER_ORIGIN);
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${AntonFont.variable} font-sans`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
