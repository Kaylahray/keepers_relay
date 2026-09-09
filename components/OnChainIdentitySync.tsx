'use client';

import { useEffect, useRef } from 'react';
import { useMyBuilder, useUpsertBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';

/**
 * If this wallet already has an on-chain @handle, sync it into the Keepers roster.
 * Attempts once per wallet+handle; does not retry in a loop when the roster rejects it.
 */
export function OnChainIdentitySync() {
  const { address, isConnected, isReady } = useWallet();
  const myBuilder = useMyBuilder();
  const { mutateAsync } = useUpsertBuilder();
  const { username, isLoading: usernameLoading } = useUsername();
  const { profile, isLoading: profileLoading } = useProfile();
  const mutateRef = useRef(mutateAsync);
  mutateRef.current = mutateAsync;
  /** Keys `${address}:${handle}` we already tried (success or permanent failure). */
  const settledKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || !isConnected || !address) return;
    if (myBuilder.isError) return;
    if (!myBuilder.isFetched) return;
    if (myBuilder.data?.builder?.onboarded) return;
    if (usernameLoading || profileLoading) return;
    if (!username?.username) return;

    const attemptKey = `${address}:${username.username}`;
    if (settledKey.current === attemptKey) return;

    settledKey.current = attemptKey;
    const displayName = (profile?.name?.trim() || username.username).slice(0, 24);
    void mutateRef
      .current({
        address,
        username: username.username,
        displayName,
        headline: profile?.headline ?? '',
        avatarSporeId: profile?.avatarSporeId ?? null,
        characterId: null,
      })
      .catch((err) => {
        console.warn('[identity-sync] roster upsert failed:', err);
      });
  }, [
    isReady,
    isConnected,
    address,
    myBuilder.isFetched,
    myBuilder.isError,
    myBuilder.data?.builder?.onboarded,
    usernameLoading,
    profileLoading,
    username?.username,
    profile?.name,
    profile?.headline,
    profile?.avatarSporeId,
  ]);

  return null;
}
