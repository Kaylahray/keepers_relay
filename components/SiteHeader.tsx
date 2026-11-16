'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AtSign, Crown, Flag, Gauge, LogOut, User, Users, WalletMinimal } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/auth-provider';
import { useMyBuilder } from '@/hooks/useBuilder';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { useKeyCellSweep } from '@/hooks/useKeyCellSweep';

const NAV = [
  { href: '/rally', label: 'Race' },
  { href: '/rally/practice', label: 'Practice' },
  { href: '/players', label: 'Players' },
  { href: '/leaderboard', label: 'Leaderboard' },
] as const;

const TABS = [
  { href: '/rally', label: 'Race', icon: Flag },
  { href: '/rally/practice', label: 'Practice', icon: Gauge },
  { href: '/players', label: 'Players', icon: Users },
  { href: '/profile', label: 'Profile', icon: User },
] as const;

const FOOTER = [
  {
    title: 'Play',
    links: [
      { href: '/rally', label: 'Race now' },
      { href: '/rally/practice', label: 'Practice' },
      { href: '/leaderboard', label: 'Leaderboard' },
    ],
  },
  {
    title: 'Players',
    links: [
      { href: '/players', label: 'Find a player' },
      { href: '/profile', label: 'Your profile' },
      { href: '/profile/edit', label: 'Edit profile' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: '/#how', label: 'How it works' },
      { href: '/#items', label: 'Items' },
      { href: '/#fair-play', label: 'Why it’s fair' },
    ],
  },
];

/** Pages that are a game screen or a big screen: no tab bar or footer over them. */
function isBare(pathname: string): boolean {
  return pathname === '/rally/practice';
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  // Practice has its own tab, so it does not light up Race.
  if (href === '/rally') return pathname === '/rally' || (pathname.startsWith('/rally/') && pathname !== '/rally/practice');
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
      <Crown className={`${size === 'lg' ? 'h-7 w-7' : 'h-6 w-6'} text-lime`} strokeWidth={2.5} aria-hidden="true" />
      <span className={`font-display font-black uppercase tracking-wide ${size === 'lg' ? 'text-4xl' : 'text-2xl'}`}>Crowns</span>
    </Link>
  );
}

/** The signed-in player's face: their Spore picture, or a ready-made face. */
function MyFace({ name }: { name: string }) {
  const mine = useMyBuilder();
  const sporeId = mine.data?.builder?.avatarSporeId ?? null;
  const picture = useQuery({
    queryKey: ['avatar-spore', sporeId],
    enabled: Boolean(sporeId),
    queryFn: () => loadAvatarSpore(sporeId!),
    staleTime: 60_000,
  });
  const src = mine.isPending ? undefined : !sporeId ? null : picture.isPending ? undefined : (picture.data?.imageUrl ?? null);
  return <Avatar name={name} tone="#99ee2d" size={32} src={src} />;
}

export function SiteHeader() {
  const pathname = usePathname();
  const { disconnect, isReady, isConnected, balance, address: walletAddress, formattedAddress } = useWallet();
  useKeyCellSweep();
  const { signOut, ensureAuth, busy: authBusy, authenticated, checked, address: sessionAddress } = useAuth();
  const { username } = useUsername();
  const handle = username?.username ?? null;
  const signedIn = isConnected && checked && authenticated && sessionAddress === walletAddress.trim().toLowerCase();
  if (isBare(pathname)) return null;
  // The front page's hero runs under the bar; every other page has a solid bar.
  const overlay = pathname === '/';

  return (
    <header className={`${overlay ? 'absolute' : 'sticky border-b border-line bg-ink/85 backdrop-blur-md'} inset-x-0 top-0 z-40`}>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:h-20 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-2 font-display text-lg font-bold uppercase tracking-wide transition-colors duration-150 ${
                  active ? 'bg-chalk/10 text-lime' : 'text-chalk/70 hover:text-chalk'
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
                  <AtSign className="h-4 w-4" aria-hidden="true" /> Claim name
                </Button>
              ) : null}
              <Link
                href="/profile"
                title={formattedAddress || 'Your wallet'}
                aria-label={`Your profile. Wallet balance ${formatWalletCkb(balance)} CKB`}
                className="flex items-center gap-2.5 rounded-full border border-line bg-ink-2/80 py-1 pl-1 pr-4 transition-colors duration-150 hover:border-chalk/30"
              >
                <MyFace name={handle ?? walletAddress} />
                <span className="hidden font-display text-lg font-extrabold lg:inline">{handle ? `@${handle}` : 'You'}</span>
                <span className="flex items-center gap-1 font-display text-lg font-black tabular-nums text-gold">
                  <WalletMinimal className="h-4 w-4" aria-hidden="true" />
                  {formatWalletCkb(balance)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void signOut().finally(() => disconnect())}
                aria-label="Disconnect"
                className="grid h-10 w-10 place-items-center rounded-full text-fog hover:bg-chalk/10 hover:text-chalk"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Button disabled={authBusy} onClick={() => void ensureAuth().catch(() => undefined)}>
              <WalletMinimal className="h-4 w-4" aria-hidden="true" />
              {authBusy ? (isConnected ? 'Signing in…' : 'Connecting…') : isConnected ? 'Sign in' : 'Connect wallet'}
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
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 transition-colors duration-150 ${active ? 'text-lime' : 'text-fog'}`}
              >
                <t.icon className="h-5 w-5" strokeWidth={active ? 2.75 : 2} aria-hidden="true" />
                <span className="font-display text-sm font-extrabold uppercase tracking-wide">{t.label}</span>
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
    <footer className="relative border-t border-line bg-ink pb-16 md:pb-0">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <Logo size="lg" />
          <p className="mt-4 max-w-xs text-fog">A live car race on Nervos CKB. The chain pays the winner.</p>
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-chalk/80">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Live on testnet
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER.map((column) => (
            <div key={column.title}>
              <p className="font-display text-lg font-extrabold uppercase tracking-wide">{column.title}</p>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-fog transition-colors duration-150 hover:text-lime">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-6 text-sm text-fog sm:flex-row sm:justify-between sm:px-8">
          <span>Crowns</span>
          <span>Built on Nervos CKB · Trophies are Spore NFTs</span>
        </div>
      </div>
    </footer>
  );
}
