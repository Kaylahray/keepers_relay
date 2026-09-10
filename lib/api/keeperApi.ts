import type { BuilderProfile } from '@/types/builder';
import type { PassportProfile } from '@/types/keeper';
import { post, request } from './client';

export function getPassport(address?: string): Promise<PassportProfile> {
  const query = address ? `?address=${encodeURIComponent(address)}` : '';
  return request<PassportProfile>(`/api/passport${query}`);
}

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

export function releaseBuilderHandle(address: string) {
  return post<BuilderProfile | null>(`/api/builders/${encodeURIComponent(address)}/release`, {});
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

export function unlockBadge(address: string, badgeId: string) {
  return post<BuilderProfile>('/api/rewards/unlock-badge', { address, badgeId });
}
