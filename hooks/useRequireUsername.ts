'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { useMyBuilder, useUpsertBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { registryConfigured } from '@/lib/registry/config';

/**
 * Every player claims a username before they sit in a lobby or play. A connected wallet without
 * one is sent to /join, which brings them back to this page once the name is claimed.
 *
 * It also keeps the players list in step with the chain: a name claimed on another device, or one
 * whose profile row never got saved, is written to the profile the first time it is seen here.
 * The server refuses seats to wallets with no profile name, so this has to happen before joining.
 */
export function useRequireUsername(): { ready: boolean; username: string | null } {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, address } = useWallet();
  const { username, isLoading, hasWallet } = useUsername();
  const { authenticated } = useAuth();
  const mine = useMyBuilder();
  const upsert = useUpsertBuilder();
  const synced = useRef<string | null>(null);

  const gated = registryConfigured() && isConnected && hasWallet;
  const name = username?.username ?? null;
  const missing = gated && !isLoading && !name;

  useEffect(() => {
    if (missing) router.replace(`/join?next=${encodeURIComponent(pathname)}`);
  }, [missing, pathname, router]);

  const stored = mine.data?.builder ?? null;
  const storedName = stored?.username ?? null;
  const profileLoaded = !mine.isLoading;
  const needsSync = Boolean(name && authenticated && address && profileLoaded && storedName !== name);
  const pending = upsert.isPending;
  const { mutate } = upsert;

  useEffect(() => {
    if (!needsSync || pending || !name || synced.current === name) return;
    synced.current = name;
    mutate({ address, username: name, displayName: stored?.displayName || name });
  }, [address, mutate, name, needsSync, pending, stored?.displayName]);

  return { ready: !gated || (Boolean(name) && storedName === name), username: name };
}
