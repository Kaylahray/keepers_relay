import { post, request } from './client';
import type { CommunitySummary, HandoffRequest } from '@/types/community';
import type { JourneySummary } from '@/types/chain';

export function listCommunities(address?: string | null) {
  const q = address ? `?address=${encodeURIComponent(address)}` : '';
  return request<CommunitySummary[]>(`/api/communities${q}`);
}

export function getCommunity(slug: string, address?: string | null) {
  const q = address ? `?address=${encodeURIComponent(address)}` : '';
  return request<{
    community: CommunitySummary;
    streaks: JourneySummary[];
    members: { address: string; displayName: string; username: string }[];
  }>(`/api/communities/${encodeURIComponent(slug)}${q}`);
}

export function createCommunity(input: {
  address: string;
  name: string;
  blurb: string;
  coverImageUrl?: string;
}) {
  return post<CommunitySummary>('/api/communities', { action: 'create', ...input });
}

export function joinCommunity(slug: string, address: string) {
  return post<CommunitySummary>('/api/communities', { action: 'join', slug, address });
}

export function leaveCommunity(slug: string, address: string) {
  return post<CommunitySummary>('/api/communities', { action: 'leave', slug, address });
}

export function grantCommunityProof(input: {
  address: string;
  slug: string;
  recipientAddress: string;
  amount: number;
  note?: string;
}) {
  return post<{
    recipient: { address: string; displayName: string; proofBalance: number };
    granted: number;
    note?: string;
  }>('/api/communities', { action: 'grant_proof', ...input });
}

export function listHandoffs(journeyId: string) {
  return request<HandoffRequest[]>(
    `/api/handoffs?journeyId=${encodeURIComponent(journeyId)}`,
  );
}

export function requestHandoff(input: {
  address: string;
  journeyId: string;
  note?: string;
}) {
  return post<HandoffRequest>('/api/handoffs', { action: 'request', ...input });
}

export function acceptHandoff(input: {
  address: string;
  requestId: string;
  city?: string;
  cellOutPoint?: { txHash: string; index: string };
  txHash?: string;
  expiresAt?: string;
}) {
  return post('/api/handoffs', { action: 'accept', ...input });
}

export function declineHandoff(input: { address: string; requestId: string }) {
  return post<HandoffRequest>('/api/handoffs', { action: 'decline', ...input });
}
