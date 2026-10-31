import type { BuilderProfile } from '@/types/builder';
import type { PlayerStats } from '@/lib/server/crown-history';
import { post, request } from './client';

export function listBuilders(): Promise<BuilderProfile[]> {
  return request<BuilderProfile[]>('/api/builders');
}

export function upsertBuilder(input: {
  address: string;
  username: string;
  displayName: string;
  characterId?: string | null;
  headline?: string;
  avatarSporeId?: string | null;
}): Promise<BuilderProfile> {
  return post<BuilderProfile>('/api/builders', input);
}

export function getBuilder(address: string): Promise<{ builder: BuilderProfile | null }> {
  const params = new URLSearchParams({ address });
  return request(`/api/builders?${params.toString()}`);
}

export function checkUsername(username: string, except?: string) {
  const params = new URLSearchParams({ username });
  if (except) params.set('except', except);
  return request<{ username: string; available: boolean; reason: string | null }>(
    `/api/builders/username?${params.toString()}`,
  );
}

export function setBuilderAvatar(address: string, avatarSporeId: string | null) {
  return post<BuilderProfile>(`/api/builders/${encodeURIComponent(address)}/avatar`, {
    avatarSporeId,
  });
}

export function clearAvatarIfSpore(address: string, sporeId: string) {
  return post<BuilderProfile | null>(`/api/builders/${encodeURIComponent(address)}/avatar`, {
    clearIf: sporeId,
  });
}

export function getPlayerStats(address: string): Promise<PlayerStats> {
  return request<PlayerStats>(`/api/builders/${encodeURIComponent(address)}/stats`);
}

/** Clears the released username from the profile (after the on-chain release). */
export function releaseBuilderName(address: string) {
  return post<BuilderProfile | null>(`/api/builders/${encodeURIComponent(address)}/release`, {});
}
