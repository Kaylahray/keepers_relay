'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@ckb-ccc/connector-react';
import {
  answerEventApi,
  createEventApi,
  fetchEvent,
  fetchEventLeaderboard,
  fetchEventResults,
  fetchEvents,
  fetchHolderQuestion,
  joinEventApi,
  sponsorEventApi,
  startEventApi,
  timeoutEventApi,
} from '@/lib/api/events';
import {
  eventCellsLive,
  eventModeToCode,
  joinEventOnChain,
  mintCreateEvent,
} from '@/lib/relay/ckb';
import type { EventMode, EventPlayRules, HostQuestionDraft, QuestionDifficulty, QuestionSource } from '@/types/event';

export function useEventsQuery(status?: string) {
  return useQuery({
    queryKey: ['events', status ?? 'all'],
    queryFn: () => fetchEvents(status),
  });
}

export function useEventQuery(id: string) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => fetchEvent(id),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const status = q.state.data?.event.status;
      if (status === 'live' || status === 'ready' || status === 'registration') return 1500;
      return false;
    },
  });
}

export function useEventResultsQuery(id: string) {
  return useQuery({
    queryKey: ['event-results', id],
    queryFn: () => fetchEventResults(id),
    enabled: Boolean(id),
  });
}

export function useEventLeaderboardQuery() {
  return useQuery({
    queryKey: ['event-leaderboard'],
    queryFn: () => fetchEventLeaderboard(),
  });
}

export type CreateEventInput = {
  address: string;
  hostName: string;
  name: string;
  description: string;
  category?: string;
  mode?: EventMode;
  topics?: string[];
  difficulty?: QuestionDifficulty;
  entryFee?: number;
  startingPot?: number;
  minPlayers?: number;
  maxPlayers?: number;
  turnSecs?: number;
  shrinkStepSecs?: number;
  minTurnSecs?: number;
  winnersCount?: number;
  startAt?: string;
  communityId?: string | null;
  allowSponsorship?: boolean;
  coverImageUrl?: string | null;
  questionSource?: QuestionSource;
  questions?: HostQuestionDraft[];
  playRules?: EventPlayRules;
};

export function useCreateEvent() {
  const qc = useQueryClient();
  const signer = useSigner();

  return useMutation({
    mutationFn: async (body: CreateEventInput) => {
      let onChain:
        | {
            eventCellId: string;
            createTxHash: string;
            eventOutPoint: { txHash: string; index: string };
            treasuryOutPoint: { txHash: string; index: string };
          }
        | undefined;

      if (eventCellsLive()) {
        if (!signer) throw new Error('Connect your wallet to mint the Event Cell.');
        const minted = await mintCreateEvent(signer, {
          mode: eventModeToCode(body.mode ?? 'pot_rush'),
          minPlayers: Math.max(2, body.minPlayers ?? 2),
          maxPlayers: Math.min(64, Math.max(2, body.maxPlayers ?? 8)),
          turnSecs: Math.min(120, Math.max(5, body.turnSecs ?? 15)),
          shrinkStepSecs: body.shrinkStepSecs ?? 0,
          minTurnSecs: body.minTurnSecs ?? body.turnSecs ?? 15,
          winnersN: Math.max(1, body.winnersCount ?? 1),
          entryFeeCkb: Math.max(0, body.entryFee ?? 0),
          topics: body.topics?.length ? body.topics : ['general'],
          difficulty: body.difficulty ?? 'medium',
          rulesJson: JSON.stringify(body.playRules ?? {}),
        });
        onChain = {
          eventCellId: minted.eventId,
          createTxHash: minted.txHash,
          eventOutPoint: minted.eventOutPoint,
          treasuryOutPoint: minted.treasuryOutPoint,
        };
      }

      return createEventApi({
        ...body,
        ...onChain,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useJoinEvent(eventId: string) {
  const qc = useQueryClient();
  const signer = useSigner();

  return useMutation({
    mutationFn: async (body: { eventId: string; address: string; displayName: string }) => {
      const live = await fetchEvent(body.eventId);
      const ev = live.event;
      const slot = live.players.length;

      if (eventCellsLive() && ev.eventCellId && ev.eventOutPoint && ev.treasuryOutPoint) {
        if (!signer) throw new Error('Connect your wallet to join on-chain.');

        const isHost =
          body.address.toLowerCase() === ev.hostAddress.toLowerCase();

        // Event Cell lock = host/controller. Non-host players get an off-chain
        // seat until the host seats them on-chain.
        if (!isHost) {
          return joinEventApi({
            ...body,
            onChainPending: true,
          });
        }

        const client = signer.client;
        const eventCell = await client.getCellLive(
          {
            txHash: ev.eventOutPoint.txHash,
            index: ev.eventOutPoint.index,
          },
          true,
        );
        const treasuryCell = await client.getCellLive(
          {
            txHash: ev.treasuryOutPoint.txHash,
            index: ev.treasuryOutPoint.index,
          },
          true,
        );
        if (!eventCell || !treasuryCell) {
          throw new Error('Event or treasury cell not found on chain.');
        }

        const joined = await joinEventOnChain(signer, {
          eventId: ev.eventCellId,
          eventOutPoint: ev.eventOutPoint,
          treasuryOutPoint: ev.treasuryOutPoint,
          eventData: eventCell.outputData,
          treasuryCapacity: BigInt(treasuryCell.cellOutput.capacity),
          slot,
        });

        return joinEventApi({
          ...body,
          joinTxHash: joined.txHash,
          playerCellId: ev.eventCellId,
          participantOutPoint: joined.participantOutPoint,
          eventOutPoint: joined.eventOutPoint,
          treasuryOutPoint: joined.treasuryOutPoint,
          onChainPending: false,
        });
      }

      return joinEventApi(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event', eventId] });
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useStartEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startEventApi,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event', eventId] });
    },
  });
}

export function useAnswerEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: answerEventApi,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event', eventId] });
      void qc.invalidateQueries({ queryKey: ['event-results', eventId] });
    },
  });
}

export function useTimeoutEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: timeoutEventApi,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event', eventId] });
      void qc.invalidateQueries({ queryKey: ['event-results', eventId] });
      void qc.invalidateQueries({ queryKey: ['event-question', eventId] });
    },
  });
}

export function useSponsorEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sponsorEventApi,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['event', eventId] });
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useHolderQuestion(eventId: string, address?: string) {
  return useQuery({
    queryKey: ['event-question', eventId, address],
    queryFn: () => fetchHolderQuestion({ eventId, address: address ?? '' }),
    enabled: Boolean(eventId && address),
    refetchInterval: 2000,
  });
}
