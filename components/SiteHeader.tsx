'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Link as LinkIcon, LogOut, UsersRound, WalletMinimal } from 'lucide-react';
import { CharacterAvatar } from '@/components/CharacterPicker';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/communities', label: 'Communities' },
  { href: '/streaks', label: 'Streaks' },
  { href: '/launch', label: 'Launch' },
  { href: '/builders', label: 'Builders' },
  { href: '/studio', label: 'Studio' },
  { href: '/profile/me', label: 'Passport' },
  { href: '/how-it-works', label: 'How it works' },
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
  const shownHandle =
    builder?.username || onChainUsername?.username || null;

  return (
    <header className="mx-3 mt-3 border-[3px] border-black bg-[#224cff] text-black shadow-[6px_6px_0_#101010] sm:mx-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border-[3px] border-black bg-[#d6ff00]">
            <LinkIcon className="h-5 w-5 stroke-[3]" aria-hidden="true" />
          </span>
          <span className="leading-none">
            <span className="block font-poster text-2xl uppercase text-[#fff8e7] sm:text-3xl">
              Keepers Relay
            </span>
            <span className="mt-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#d6ff00]">
              ONE CELL. ONE MARK. PASS IT ON.
            </span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/builders"
            className="hidden items-center gap-1.5 border-[3px] border-black bg-[#ff4cbd] px-3 py-2 text-[11px] font-black uppercase tracking-wider sm:flex"
          >
            <UsersRound className="h-4 w-4 stroke-[3]" />
            Who&rsquo;s here
          </Link>

          {!isReady ? (
            <span className="border-[3px] border-black bg-[#fff8e7] px-3 py-2 text-[11px] font-black uppercase text-black/50">
              Checking wallet…
            </span>
          ) : isConnected ? (
            <div className="flex items-center gap-2 border-[3px] border-black bg-[#fff8e7] py-1 pl-1 pr-2">
              {builder?.characterId && (
                <CharacterAvatar characterId={builder.characterId} size="sm" />
              )}
              <Link
                href={shownHandle ? `/u/${shownHandle}` : '/profile/me'}
                className="leading-none hover:opacity-80"
              >
                <p className="text-[11px] font-black uppercase">
                  {shownHandle
                    ? `@${shownHandle}`
                    : 'You'}
                </p>
                <p className="mt-1 font-mono text-[9px] font-bold text-black/55">
                  {formattedAddress}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => disconnect()}
                aria-label="Disconnect wallet"
                className="border-2 border-black bg-[#ffe454] p-1.5"
              >
                <LogOut className="h-3.5 w-3.5 stroke-[3]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => connect()}
              className="neo-button flex items-center gap-2 bg-[#d6ff00] px-3 py-2 text-[11px] font-black uppercase tracking-wider"
            >
              <WalletMinimal className="h-4 w-4 stroke-[3]" />
              Connect wallet
            </button>
          )}
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="flex gap-0 overflow-x-auto border-t-[3px] border-black bg-black"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 border-r-[3px] border-black px-4 py-2.5 text-[11px] font-black uppercase tracking-wider ${
                active
                  ? 'bg-[#d6ff00] text-black'
                  : 'text-[#fff8e7] hover:bg-[#ff4cbd] hover:text-black'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
