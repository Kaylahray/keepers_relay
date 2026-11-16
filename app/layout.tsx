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
    'Live car races on CKB. 2 to 5 players race on the same track, and the chain replays every race and pays the winner.',
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
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-ink text-chalk">
        <Providers>
          <SiteHeader />
          <main className="relative min-h-[calc(100vh-4rem)]">{children}</main>
          <SiteFooter />
          <BottomTabs />
        </Providers>
      </body>
    </html>
  );
}
