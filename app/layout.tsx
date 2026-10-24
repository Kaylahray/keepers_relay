import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
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
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Orbitron:wght@600;700;800&family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-[#15121d] text-[#f5f5f5]">
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
