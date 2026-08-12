'use client';

import { useQuery } from '@tanstack/react-query';
import { ccc } from '@ckb-ccc/connector-react';
import { getProfileByUsername } from '@/lib/registry/profile';
import { getUsernameByName } from '@/lib/registry/username';
import { getClient } from '@/lib/registry/client';
import { registryConfigured } from '@/lib/registry/config';
import { normalizeUsername } from '@/lib/registry/encoding';
import type { StoredProfile, Username } from '@/lib/registry/types';

export type PublicAvatar = {
  id: string;
  imageUrl: string;
};

export function usePublicProfile(usernameRaw: string | undefined) {
  const username = usernameRaw ? normalizeUsername(usernameRaw) : undefined;

  return useQuery({
    queryKey: ['public-profile', username],
    enabled: Boolean(username) && registryConfigured(),
    queryFn: async (): Promise<{
      username: string;
      usernameRecord: Username | null;
      profile: StoredProfile | null;
      avatar: PublicAvatar | null;
    }> => {
      if (!username) {
        return { username: '', usernameRecord: null, profile: null, avatar: null };
      }

      const [usernameRecord, profile] = await Promise.all([
        getUsernameByName(username),
        getProfileByUsername(username),
      ]);

      let avatar: PublicAvatar | null = null;
      if (profile?.avatarSporeId) {
        avatar = await loadAvatarSpore(profile.avatarSporeId);
      }

      return { username, usernameRecord, profile, avatar };
    },
    staleTime: 20_000,
  });
}

async function loadAvatarSpore(id: string): Promise<PublicAvatar | null> {
  try {
    const client = getClient();
    const found = await ccc.spore.findSpore(client, id);
    if (!found) return null;
    const contentType = found.sporeData.contentType || 'application/octet-stream';
    if (!contentType.startsWith('image/')) return null;
    const bytes = Uint8Array.from(ccc.bytesFrom(found.sporeData.content));
    return {
      id,
      imageUrl: URL.createObjectURL(new Blob([bytes], { type: contentType })),
    };
  } catch {
    return null;
  }
}
