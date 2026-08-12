import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export const chainKeys = {
  all: ['chain'] as const,
  detail: () => [...chainKeys.all, 'detail'] as const,
  journeys: () => [...chainKeys.all, 'journeys'] as const,
};

export const communityKeys = {
  all: ['communities'] as const,
  list: (address?: string | null) => [...communityKeys.all, 'list', address ?? 'anon'] as const,
  detail: (slug: string, address?: string | null) =>
    [...communityKeys.all, 'detail', slug, address ?? 'anon'] as const,
  handoffs: (journeyId: string) => [...communityKeys.all, 'handoffs', journeyId] as const,
};

export const keeperKeys = {
  artifact: ['keeper', 'artifact'] as const,
  relayBoard: ['keeper', 'relay-board'] as const,
  relayAttempts: ['keeper', 'relay-attempts'] as const,
  relayDetail: (relayId: string) => ['keeper', 'relay', relayId] as const,
  queue: ['keeper', 'queue'] as const,
  passport: ['keeper', 'passport'] as const,
};
