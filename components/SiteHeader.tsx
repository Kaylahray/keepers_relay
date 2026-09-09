'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, WalletMinimal, X } from 'lucide-react';
import { CharacterAvatar } from '@/components/CharacterPicker';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';

/** Slim bar — logo | centered links | wallet/profile */
const NAV = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/communities', label: 'Communities' },
  { href: '/create', label: 'Create' },
  { href: '/profile', label: 'Profile' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { connect, disconnect, isConnected, formattedAddress, isReady } = useWallet();
  const myBuilder = useMyBuilder();
  const builder = myBuilder.data?.builder;
  const { username: onChainUsername } = useUsername();
  const shownHandle = builder?.username || onChainUsername?.username || null;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative z-40 w-full border-b border-white/10 bg-[#111]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-1.5">
          <span className="font-poster text-lg uppercase tracking-wide text-white sm:text-xl">
            Keepers
          </span>
          <span className="font-poster text-lg uppercase tracking-wide text-[#99ee2d] sm:text-xl">
            Relay
          </span>
        </Link>

        <nav
          id="primary-nav"
          aria-label="Primary"
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-10 lg:flex"
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`text-[15px] font-medium tracking-wide transition ${
                  active ? 'text-white' : 'text-white/55 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {!isReady ? null : isConnected ? (
            <div className="flex items-center gap-2">
              {builder?.characterId && (
                <CharacterAvatar characterId={builder.characterId} size="sm" />
              )}
              <Link
                href={
                  shownHandle
                    ? `/profile`
                    : `/join?next=${encodeURIComponent(pathname || '/')}`
                }
                className="hidden text-right leading-none sm:block"
              >
                <p className="text-[11px] font-bold uppercase text-white">
                  {shownHandle ? `@${shownHandle}` : 'View profile'}
                </p>
                <p className="mt-0.5 max-w-[7rem] truncate font-mono text-[9px] text-white/40">
                  {formattedAddress}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => disconnect()}
                aria-label="Disconnect"
                className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => connect()}
              className="arena-cta flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase"
            >
              <WalletMinimal className="h-4 w-4" />
              Connect
            </button>
          )}

          <button
            type="button"
            className="p-2 text-white lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          className="border-t border-white/10 bg-[#111] px-4 py-4 lg:hidden"
        >
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-2 py-2.5 text-sm font-medium uppercase ${
                    isActive(pathname, item.href) ? 'text-[#99ee2d]' : 'text-white/70'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
