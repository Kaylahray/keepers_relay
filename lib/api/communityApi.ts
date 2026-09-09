import { post, request } from './client';
import type { CommunityMember, CommunitySummary } from '@/types/community';
import type { EventSummary } from '@/types/event';

export function listCommunities(address?: string | null) {
  const q = address ? `?address=${encodeURIComponent(address)}` : '';
  return request<CommunitySummary[]>(`/api/communities${q}`);
}

export function getCommunity(slug: string, address?: string | null) {
  const q = address ? `?address=${encodeURIComponent(address)}` : '';
  return request<{
    community: CommunitySummary;
    events: EventSummary[];
    members: CommunityMember[];
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

export function joinCommunity(slug: string, address: string, invitedByAddress?: string) {
  return post<CommunitySummary>('/api/communities', {
    action: 'join',
    slug,
    address,
    invitedByAddress,
  });
}

export function leaveCommunity(slug: string, address: string) {
  return post<CommunitySummary>('/api/communities', { action: 'leave', slug, address });
}

export function grantCommunityPoints(input: {
  address: string;
  slug: string;
  recipientAddress: string;
  amount: number;
  note?: string;
}) {
  return post<{
    granted: number;
    recipient: { pointsBalance: number };
  }>('/api/communities', { action: 'grant_points', ...input });
}
