import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
import { JoinNudge } from '@/components/JoinNudge';
import { OnChainIdentitySync } from '@/components/OnChainIdentitySync';
import './globals.css';

export const metadata: Metadata = {
  title: 'Keepers Relay — take it, mark it, pass it on',
  description:
    'A living CKB Cell passes from hand to hand. Every Keeper leaves a mark and has a clock. Pass it in time or it dies on your watch.',
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
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Orbitron:wght@600;700;800&family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-[#15121d] text-[#f5f5f5]">
        <Providers>
          <OnChainIdentitySync />
          <SiteHeader />
          <JoinNudge />
          {children}
        </Providers>
      </body>
    </html>
  );
}
