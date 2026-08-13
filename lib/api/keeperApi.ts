import type { BuilderProfile } from '@/types/builder';
import type {
  ArtifactKind,
  LivingArtifact,
  PassportProfile,
  QueueEntry,
  RelayAttempt,
  RelayBoard,
  RelayDetail,
} from '@/types/keeper';
import { post, request } from './client';

export function getArtifact(): Promise<LivingArtifact> {
  return request<LivingArtifact>('/api/artifact');
}

export function publishArtifact(input: {
  body: string;
  kind: ArtifactKind;
  place?: string;
  address?: string;
  journeyId?: string;
  imageUrl?: string;
  contentHash?: string;
  artifactRoot?: string;
  cellOutPoint?: { txHash: string; index: string };
  txHash?: string;
  artifactRootOnChain?: boolean;
}): Promise<LivingArtifact> {
  return post<LivingArtifact>('/api/artifact', input);
}

export function featureArtifact(entryId: string): Promise<LivingArtifact> {
  return post<LivingArtifact>('/api/artifact/feature', { entryId });
}

export function getRelayBoard(): Promise<RelayBoard> {
  return request<RelayBoard>('/api/relays');
}

export function getRelayAttempts(): Promise<Record<string, RelayAttempt>> {
  return request<Record<string, RelayAttempt>>('/api/relays/attempts');
}

export function getRelayDetail(relayId: string): Promise<RelayDetail> {
  return request<RelayDetail>(`/api/relays/${relayId}`);
}

export function activateRelay(relayId: string): Promise<RelayBoard> {
  return post<RelayBoard>(`/api/relays/${relayId}/activate`);
}

export function startRelay(relayId: string): Promise<RelayDetail> {
  return post<RelayDetail>(`/api/relays/${relayId}/start`);
}

export function submitRelayProof(input: {
  relayId: string;
  proof: string;
}): Promise<RelayDetail> {
  return post<RelayDetail>(`/api/relays/${input.relayId}/proof`, { proof: input.proof });
}

export function claimRelayReward(
  relayId: string,
  address?: string,
): Promise<{
  detail: RelayDetail;
  board: RelayBoard;
  passport: PassportProfile;
  builder: BuilderProfile | null;
}> {
  return post(`/api/relays/${relayId}/claim`, address ? { address } : {});
}

export function getQueue(): Promise<QueueEntry[]> {
  return request<QueueEntry[]>('/api/queue');
}

export function joinQueue(input: { name: string; pledge: string }): Promise<QueueEntry[]> {
  return post<QueueEntry[]>('/api/queue', input);
}

export function endorseCandidate(entryId: string): Promise<QueueEntry[]> {
  return post<QueueEntry[]>(`/api/queue/${entryId}/endorse`);
}

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
  return request(`/api/builders/${encodeURIComponent(address)}`);
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
