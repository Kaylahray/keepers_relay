import { post, request } from './client';
import type { HomeFeed, MarkDraft } from '@/types/retention';
import type { ArtifactKind } from '@/types/keeper';
import type { Chain } from '@/types/chain';

export function getHomeFeed(address: string) {
  return request<HomeFeed>(`/api/home?address=${encodeURIComponent(address)}`);
}

export function markHomeNoticesRead(address: string) {
  return post<HomeFeed>('/api/home', { action: 'mark_read', address });
}

export function getDraftMark(address: string, journeyId: string) {
  return request<MarkDraft | null>(
    `/api/retention?address=${encodeURIComponent(address)}&journeyId=${encodeURIComponent(journeyId)}`,
  );
}

export function saveDraftMark(input: {
  address: string;
  journeyId: string;
  body?: string;
  kind?: ArtifactKind;
  place?: string;
  imageUrl?: string;
}) {
  return post<MarkDraft>('/api/retention', { action: 'save', ...input });
}

export function nominateNextKeeper(input: {
  address: string;
  journeyId: string;
  nomineeAddress: string;
}) {
  return post<Chain>('/api/retention', { action: 'nominate', ...input });
}

export function rescueChain(input: { address: string; journeyId: string }) {
  return post<Chain>('/api/retention', { action: 'rescue', ...input });
}
