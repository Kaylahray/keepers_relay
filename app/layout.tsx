import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { BottomTabs, SiteFooter, SiteHeader } from '@/components/SiteHeader';
import './globals.css';

// Link previews need absolute image URLs. Vercel names the production domain; locally it is localhost.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Crowns',
  description:
    'One deadline, one pot, one king. Beat the score, and the chain replays your run, crowns you, grows the pot and cuts the clock.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Root layout: these fonts load on every page, which is what this rule wants from _document. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-ink text-white">
        {/* Our backdrop behind every page: dark shards, faded so the content stays readable. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[url('/uismod/hero-bg.png')] bg-cover bg-center opacity-45" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-ink/10 via-ink/40 to-ink/70" />
        <Providers>
          <SiteHeader />
          <main className="relative z-[1] min-h-[calc(100vh-4rem)]">{children}</main>
          <SiteFooter />
          <BottomTabs />
        </Providers>
      </body>
    </html>
  );
}
