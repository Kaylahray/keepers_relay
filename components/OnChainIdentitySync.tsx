'use client';

import { useEffect, useRef } from 'react';
import { useMyBuilder, useUpsertBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';

/**
 * If this wallet already has an on-chain @handle, sync it into the Keepers roster.
 */
export function OnChainIdentitySync() {
  const { address, isConnected, isReady } = useWallet();
  const myBuilder = useMyBuilder();
  const upsert = useUpsertBuilder();
  const { username, isLoading: usernameLoading } = useUsername();
  const { profile, isLoading: profileLoading } = useProfile();
  const syncing = useRef(false);

  useEffect(() => {
    if (!isReady || !isConnected || !address) return;
    if (!myBuilder.isFetched) return;
    if (myBuilder.data?.builder?.onboarded) return;
    if (usernameLoading || profileLoading) return;
    if (!username?.username) return;
    if (syncing.current || upsert.isPending) return;

    syncing.current = true;
    const displayName = (profile?.name?.trim() || username.username).slice(0, 24);
    void upsert
      .mutateAsync({
        address,
        username: username.username,
        displayName,
        headline: profile?.headline ?? '',
        avatarSporeId: profile?.avatarSporeId ?? null,
        characterId: null,
      })
      .catch((err) => {
        console.warn('[identity-sync] roster upsert failed:', err);
      })
      .finally(() => {
        syncing.current = false;
      });
  }, [
    isReady,
    isConnected,
    address,
    myBuilder.isFetched,
    myBuilder.data?.builder?.onboarded,
    usernameLoading,
    profileLoading,
    username?.username,
    profile?.name,
    profile?.headline,
    profile?.avatarSporeId,
    upsert,
  ]);

  return null;
}
