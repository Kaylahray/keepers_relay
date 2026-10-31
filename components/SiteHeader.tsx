'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AtSign, Crown, Gamepad2, Home, LogOut, Swords, Users, WalletMinimal } from 'lucide-react';
import { Avatar } from '@/components/duel/Avatar';
import { LogoMark } from '@/components/ui/LogoMark';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/auth-provider';
import { useMyBuilder } from '@/hooks/useBuilder';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/games', label: 'Play' },
  { href: '/play', label: 'Crowns', tone: 'lime' },
  { href: '/duels', label: 'Duels', tone: 'pink' },
  { href: '/create', label: 'Host' },
  { href: '/players', label: 'Players' },
  { href: '/profile', label: 'Profile' },
] as const;

const TABS = [
  { href: '/', label: 'Home', icon: Home, active: 'text-white' },
  { href: '/games', label: 'Play', icon: Gamepad2, active: 'text-white' },
  { href: '/play', label: 'Crowns', icon: Crown, active: 'text-lime' },
  { href: '/duels', label: 'Duels', icon: Swords, active: 'text-pink' },
  { href: '/players', label: 'Players', icon: Users, active: 'text-white' },
] as const;

const FOOTER = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/verify', label: 'Check a game' },
  { href: '/players', label: 'Players' },
  { href: '/create', label: 'Host a crown' },
];

/** Pages that are a game screen or a big screen: no tab bar or footer over them. */
function isBare(pathname: string): boolean {
  return pathname.startsWith('/watch/');
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatWalletCkb(balance: string): string {
  const value = Number(balance);
  if (!balance || !Number.isFinite(value)) return '…';
  return value.toLocaleString('en-US', { maximumFractionDigits: value >= 1000 ? 0 : 2 });
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <Link href="/" aria-label="Crowns home" className="inline-flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <LogoMark size={size === 'lg' ? 44 : 34} />
      <span className={`font-poster font-black uppercase tracking-wide ${size === 'lg' ? 'text-2xl' : 'text-base max-[420px]:hidden'}`}>Crowns</span>
    </Link>
  );
}

/** The signed-in player's face: their Spore picture, or the face drawn from their name. */
function MyFace({ name }: { name: string }) {
  const mine = useMyBuilder();
  const sporeId = mine.data?.builder?.avatarSporeId ?? null;
  const picture = useQuery({
    queryKey: ['avatar-spore', sporeId],
    enabled: Boolean(sporeId),
    queryFn: () => loadAvatarSpore(sporeId!),
    staleTime: 60_000,
  });
  return <Avatar name={name} tone="#99ee2d" size={40} src={picture.data?.imageUrl ?? null} />;
}

export function SiteHeader() {
  const pathname = usePathname();
  const { disconnect, isReady, isConnected, balance, address: walletAddress, formattedAddress } = useWallet();
  const { signOut, ensureAuth, busy: authBusy, authenticated, checked, address: sessionAddress } = useAuth();
  const { username } = useUsername();
  const handle = username?.username ?? null;
  const signedIn = isConnected && checked && authenticated && sessionAddress === walletAddress.trim().toLowerCase();
  if (isBare(pathname)) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            const tone = 'tone' in n ? n.tone : null;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                  active ? (tone === 'lime' ? 'bg-lime/10 text-lime' : tone === 'pink' ? 'bg-pink/10 text-pink' : 'bg-white/10 text-white') : 'text-mute hover:text-white'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {!isReady ? null : signedIn ? (
            <>
              {!handle && pathname !== '/join' ? (
                <Button href={`/join?next=${encodeURIComponent(pathname)}`} variant="pink" size="sm">
                  <AtSign className="h-3.5 w-3.5" aria-hidden="true" /> Claim name
                </Button>
              ) : null}
              <Link
                href="/profile"
                title={formattedAddress || 'Your wallet'}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-ink-3 px-2.5 sm:gap-2 sm:px-3"
                aria-label={`Wallet balance ${formatWalletCkb(balance)} CKB`}
              >
                <WalletMinimal className="h-4 w-4 text-gold" aria-hidden="true" />
                <span className="font-poster text-sm font-bold tabular-nums text-gold">{formatWalletCkb(balance)}</span>
                <span className="hidden font-mono text-[10px] font-bold text-gold/80 sm:inline">CKB</span>
              </Link>
              <Link href="/profile" aria-label="Your profile" className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                <MyFace name={handle ?? walletAddress} />
              </Link>
              <button
                type="button"
                onClick={() => void signOut().finally(() => disconnect())}
                aria-label="Disconnect"
                className="grid h-10 w-10 place-items-center rounded-xl text-mute hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Button disabled={authBusy} onClick={() => void ensureAuth().catch(() => undefined)}>
              <WalletMinimal className="h-4 w-4" aria-hidden="true" />
              {authBusy ? (isConnected ? 'Signing in…' : 'Connecting…') : isConnected ? 'Sign in' : 'Connect'}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Phones: the main sections in a bar along the bottom. */
export function BottomTabs() {
  const pathname = usePathname();
  if (isBare(pathname)) return null;
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors duration-150 ${active ? t.active : 'text-mute'}`}
              >
                <t.icon className={`h-6 w-6 ${active && t.href === '/play' ? 'fill-lime/20' : ''}`} aria-hidden="true" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (isBare(pathname)) return null;
  return (
    <footer className="relative z-[1] mt-20 border-t border-white/5 bg-ink/80 pb-20 lg:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-mute">Every stake sits in a smart contract on CKB. Crowns never holds your money.</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-3">
          {FOOTER.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-sm font-semibold text-mute transition-colors duration-150 hover:text-white">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
