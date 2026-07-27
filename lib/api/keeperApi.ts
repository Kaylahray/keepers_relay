import type {
  ArtifactEntry,
  ArtifactKind,
  LivingArtifact,
  PassportProfile,
  QueueEntry,
  RelayBoard,
} from '@/types/keeper';

/** Mock community services. Each collection is separate so it can later map to
 * CKB-indexed cells, a social indexer, or a backend without changing the UI. */

const DEMO_KEEPER = 'Emma';

let artifact: LivingArtifact = {
  id: 'relic_01',
  title: 'The Unbroken Note',
  prompt: 'Leave one thing worth carrying forward.',
  entries: [
    { id: 'a1', author: 'Alice', kind: 'rule', body: 'Never pass it to someone who will not protect it.', createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), isFeatured: false },
    { id: 'a2', author: 'Charlie', kind: 'meme', body: 'my friend said “it’s just an NFT” and then checked the timer 14 times', createdAt: new Date(Date.now() - 32 * 60 * 60 * 1000).toISOString(), isFeatured: true },
    { id: 'a3', author: 'David', kind: 'message', body: 'A cell can hold a promise, not only value.', createdAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(), isFeatured: false },
  ],
};

let board: RelayBoard = {
  activeRelayId: 'relay_nervos_101',
  relays: [
    { id: 'relay_nervos_101', partner: 'CKB Academy', title: 'Decode one Cell', description: 'Learn why a Cell can represent state, ownership, and a living object.', category: 'Learn', rewardXp: 80, rewardLabel: 'Cell Scout badge', participantCount: 184 },
    { id: 'relay_dob', partner: 'Spore', title: 'Visit a digital object', description: 'Explore a creator-made object and leave a respectful reaction.', category: 'Explore', rewardXp: 60, rewardLabel: 'Culture signal', participantCount: 96 },
    { id: 'relay_builder', partner: 'CKB Builders', title: 'Ship a signal', description: 'Share one useful CKB tool, idea, or resource with the chain.', category: 'Create', rewardXp: 120, rewardLabel: 'Relay maker badge', participantCount: 57 },
  ],
};

let queue: QueueEntry[] = [
  { id: 'q1', name: 'Noah', pledge: 'I’ll bring the chain to my local CKB crew.', joinedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(), endorsements: 12, status: 'waiting' },
  { id: 'q2', name: 'Mina', pledge: 'I’ll turn the next note into a comic panel.', joinedAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(), endorsements: 8, status: 'waiting' },
  { id: 'q3', name: 'Kai', pledge: 'I’ll onboard someone new to CKB before I pass it.', joinedAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(), endorsements: 5, status: 'waiting' },
];

let passport: PassportProfile = {
  displayName: 'You',
  relayStreak: 3,
  contributionXp: 260,
  completedRelayIds: ['relay_dob'],
  artifactCount: 1,
  badgeLabels: ['Early carrier', 'Culture signal'],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(clone(value)), ms));
}

export async function getArtifact(): Promise<LivingArtifact> {
  return delay(artifact);
}

export async function publishArtifact(input: { body: string; kind: ArtifactKind }): Promise<LivingArtifact> {
  const body = input.body.trim();
  if (!body) throw new Error('Write a note before sealing it into the relic.');
  if (body.length > 180) throw new Error('Keep the relic entry under 180 characters.');

  const entry: ArtifactEntry = {
    id: `entry_${Date.now().toString(36)}`,
    author: DEMO_KEEPER,
    kind: input.kind,
    body,
    createdAt: new Date().toISOString(),
    isFeatured: false,
  };
  artifact = { ...artifact, entries: [...artifact.entries, entry] };
  passport = {
    ...passport,
    artifactCount: passport.artifactCount + 1,
    contributionXp: passport.contributionXp + 100,
    badgeLabels: passport.badgeLabels.includes('Living archive')
      ? passport.badgeLabels
      : [...passport.badgeLabels, 'Living archive'],
  };
  return delay(artifact, 500);
}

export async function featureArtifact(entryId: string): Promise<LivingArtifact> {
  if (!artifact.entries.some((entry) => entry.id === entryId)) throw new Error('That relic entry no longer exists.');
  artifact = {
    ...artifact,
    entries: artifact.entries.map((entry) => ({ ...entry, isFeatured: entry.id === entryId })),
  };
  return delay(artifact, 350);
}

export async function getRelayBoard(): Promise<RelayBoard> {
  return delay(board);
}

export async function activateRelay(relayId: string): Promise<RelayBoard> {
  if (!board.relays.some((relay) => relay.id === relayId)) throw new Error('That relay is unavailable.');
  board = { ...board, activeRelayId: relayId };
  return delay(board, 350);
}

export async function completeRelay(relayId: string): Promise<{ board: RelayBoard; passport: PassportProfile }> {
  const relay = board.relays.find((item) => item.id === relayId);
  if (!relay) throw new Error('That relay is unavailable.');
  if (passport.completedRelayIds.includes(relayId)) throw new Error('You already earned this relay reward.');

  board = {
    ...board,
    relays: board.relays.map((item) => item.id === relayId ? { ...item, participantCount: item.participantCount + 1 } : item),
  };
  passport = {
    ...passport,
    relayStreak: passport.relayStreak + 1,
    contributionXp: passport.contributionXp + relay.rewardXp,
    completedRelayIds: [...passport.completedRelayIds, relayId],
    badgeLabels: passport.badgeLabels.includes(relay.rewardLabel)
      ? passport.badgeLabels
      : [...passport.badgeLabels, relay.rewardLabel],
  };
  return delay({ board, passport }, 550);
}

export async function getQueue(): Promise<QueueEntry[]> {
  return delay(queue);
}

export async function joinQueue(input: { name: string; pledge: string }): Promise<QueueEntry[]> {
  const name = input.name.trim();
  const pledge = input.pledge.trim();
  if (!name || !pledge) throw new Error('Add your name and a promise to the next keeper.');
  if (name.length > 24 || pledge.length > 120) throw new Error('Keep your pledge concise so the keeper can read it.');
  if (queue.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already in the handoff queue.');

  queue = [{ id: `queue_${Date.now().toString(36)}`, name, pledge, joinedAt: new Date().toISOString(), endorsements: 0, status: 'waiting' }, ...queue];
  return delay(queue, 450);
}

export async function endorseCandidate(entryId: string): Promise<QueueEntry[]> {
  if (!queue.some((entry) => entry.id === entryId)) throw new Error('This candidate is no longer in the queue.');
  queue = queue.map((entry) => entry.id === entryId ? { ...entry, endorsements: entry.endorsements + 1, status: 'endorsed' } : entry);
  return delay(queue, 350);
}

export async function getPassport(): Promise<PassportProfile> {
  return delay(passport);
}
