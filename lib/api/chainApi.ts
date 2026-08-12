import type { Chain } from '@/types/chain';
import { post, request } from './client';

export function getChain(): Promise<Chain> {
  return request<Chain>('/api/chain');
}

export function passChain(
  recipient: string,
  city?: string,
  onChain?: {
    recipientAddress?: string;
    cellOutPoint?: { txHash: string; index: string };
    txHash?: string;
    expiresAt?: string;
  },
): Promise<Chain> {
  return post<Chain>('/api/chain/pass', { recipient, city, ...onChain });
}

export function resetChain(): Promise<Chain> {
  return post<Chain>('/api/chain/reset');
}

/** Demo helper — pull the expiry down to a few seconds. */
export function fastForwardToEdge(): Promise<Chain> {
  return post<Chain>('/api/chain/fast-forward');
}

/** Demo: connected builder takes the live Cell as Keeper. */
export function assumeKeeper(address: string): Promise<Chain> {
  return post<Chain>('/api/chain/assume-keeper', { address });
}

export function listJourneys() {
  return request<{
    activeJourneyId: string;
    journeys: import('@/types/chain').JourneySummary[];
  }>('/api/journeys');
}

export function launchJourney(input: {
  address: string;
  communityId: string;
  creatureName: string;
  seedPrompt: string;
  mode: 'open' | 'return_home';
  trophyGoal: number;
  windowHours?: number;
  initialProof?: number;
  rewardPoolNote?: string;
  coverImageUrl?: string;
  cellOutPoint?: { txHash: string; index: string };
  onChainChainId?: string;
  genesisTxHash?: string;
  expiresAt?: string;
}): Promise<Chain> {
  return post<Chain>('/api/journeys', { action: 'launch', ...input });
}

export function selectJourney(journeyId: string): Promise<Chain> {
  return post<Chain>('/api/journeys', { action: 'select', journeyId });
}

export function fundJourneyTreasury(input: {
  journeyId: string;
  address: string;
  amount: number;
  note?: string;
}): Promise<Chain> {
  return post<Chain>('/api/journeys', { action: 'fund', ...input });
}
