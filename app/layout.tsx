import type { Metadata } from 'next';
import { Archivo_Black, DM_Mono, Instrument_Serif, Inter } from 'next/font/google';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
import { OnboardingModal } from '@/components/OnboardingModal';
import { OnChainIdentitySync } from '@/components/OnChainIdentitySync';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-inter',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
});

export const metadata: Metadata = {
  title: 'Keepers Relay — Chain Letter',
  description:
    'A living CKB collectible that survives only if every Keeper passes it on before time runs out.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmMono.variable} ${instrumentSerif.variable} ${archivoBlack.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#d6ff00]">
        <Providers>
          <OnChainIdentitySync />
          <SiteHeader />
          {children}
          <OnboardingModal />
        </Providers>
      </body>
    </html>
  );
}
