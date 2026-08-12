import type { Chain, JourneySummary, Owner } from '@/types/chain';
import { TROPHY_GOAL } from '@/types/chain';
import type { BuilderProfile, UpsertBuilderInput } from '@/types/builder';
import type { Community, CommunitySummary, HandoffRequest } from '@/types/community';
import type {
  ArtifactKind,
  LivingArtifact,
  PassportProfile,
  QueueEntry,
  Relay,
  RelayAttempt,
  RelayBoard,
  RelayDetail,
} from '@/types/keeper';
import type { CharacterId } from '@/lib/characters';
import { CHARACTERS } from '@/lib/characters';
import { posterDataUri, resolveCover } from '@/lib/poster';
import {
  normalizeUsername,
  REWARD_LABELS,
  REWARD_POINTS,
  validateUsername,
  type RewardMilestone,
  KEEPER_BADGES,
} from '@/lib/rewards/milestones';

/**
 * Server-side mock of the CKB-style backend.
 *
 * On CKB the collectible is a single Cell: only one owner exists and only one
 * transaction can spend it. Every transfer consumes the old cell and creates a
 * new one (new owner + new expiry). This module is the single source of truth
 * the route handlers read and write, so it can later be swapped for an indexer
 * plus a real database without touching the UI.
 */

const SEED_NAMES = ['Alice', 'Bob', 'Charlie', 'David', 'Emma'];
const SEED_CITIES = ['Kaduna', 'Abuja', 'Lagos', 'Accra', 'London'];
const WINDOW_HOURS = 24;
const DEMO_KEEPER = 'Emma';
const DEMO_ADDRESS = 'ckt1qdemo...keeper';

/** Mock review latency so the pending state is observable without a job queue. */
const REVIEW_MS: Record<'auto' | 'manual', number> = {
  auto: 6_000,
  manual: 20_000,
};

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

function randomHash(): string {
  const chars = '0123456789abcdef';
  let out = '0x';
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makeOwner(
  name: string,
  receivedAt: number,
  passedAt: number | null,
  city?: string,
  contributionId: string | null = null,
  address?: string,
): Owner {
  return {
    id: `cell_${receivedAt.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    receivedAt: new Date(receivedAt).toISOString(),
    passedAt: passedAt === null ? null : new Date(passedAt).toISOString(),
    cellHash: randomHash(),
    city,
    contributionId,
    address,
  };
}

function findBuilderByAddressOrHandle(query: string): BuilderProfile | undefined {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  if (!q) return undefined;
  return Object.values(state().builders).find(
    (b) =>
      b.address.toLowerCase() === q ||
      b.username.toLowerCase() === q ||
      b.displayName.toLowerCase() === q,
  );
}

function seedChain(): Chain {
  const now = Date.now();
  const step = hours(20);
  const owners: Owner[] = SEED_NAMES.map((name, i) => {
    const receivedAt = now - step * (SEED_NAMES.length - 1 - i);
    const isCurrent = i === SEED_NAMES.length - 1;
    // Past keepers already contributed; current Keeper (Emma) still owes a mark.
    const contributionId = isCurrent ? null : `a${i + 1}`;
    return makeOwner(
      name,
      receivedAt,
      isCurrent ? null : receivedAt + step,
      SEED_CITIES[i],
      contributionId,
    );
  });

  return {
    id: 'chain_genesis_0001',
    status: 'alive',
    communityId: 'comm_ckb_main',
    owners,
    // Emma holds it with ~8h left, so the dashboard opens with real tension.
    expiresAt: new Date(now + hours(8)).toISOString(),
    windowHours: WINDOW_HOURS,
    trophyGoal: 50,
    diedAt: null,
    creatorName: 'CKB Academy',
    seedPrompt: 'Show me the view outside your window — one line, one place.',
    mode: 'return_home',
    creatureName: 'Window Relay',
    coverImageUrl: posterDataUri('Window Relay'),
    returnedAt: null,
    createdAt: new Date(now - step * (SEED_NAMES.length - 1)).toISOString(),
    rewardPoolProof: 100,
    rewardPoolNote: 'PROOF for keepers who help Window Relay come home.',
  };
}

const COMMUNITY_SEED_MEMBERS = [
  DEMO_ADDRESS,
  'ckt1qzdemo_ember_builder_02',
  'ckt1qzdemo_volt_builder_03',
  'ckt1qzdemo_mira_builder_04',
  'ckt1qzdemo_spark_builder_05',
];

function seedCommunities(): Record<string, Community> {
  const now = Date.now();
  const neon = 'ckt1qzdemo_neon_admin_00';
  const base = {
    creatorAddress: neon,
    creatorName: 'Neon',
    memberAddresses: COMMUNITY_SEED_MEMBERS,
    createdAt: new Date(now - hours(120)).toISOString(),
  };

  return {
    comm_ckb_main: {
      id: 'comm_ckb_main',
      slug: 'ckb-main',
      name: 'CKB Main',
      blurb: 'The home room. Keep the flagship Cell streak alive with the wider CKB crew.',
      coverImageUrl: posterDataUri('CKB Main'),
      featured: true,
      ...base,
    },
    comm_fun_facts: {
      id: 'comm_fun_facts',
      slug: 'fun-facts',
      name: 'Fun Facts',
      blurb: 'Weird CKB trivia, one mark at a time. Pass the fact Cell before it dies.',
      coverImageUrl: posterDataUri('Fun Facts'),
      featured: true,
      ...base,
      memberAddresses: COMMUNITY_SEED_MEMBERS.slice(0, 3),
    },
    comm_study: {
      id: 'comm_study',
      slug: 'study-circle',
      name: 'Study Circle',
      blurb: 'Docs, scripts, and “explain it like I’m new.” Learning streaks live here.',
      coverImageUrl: posterDataUri('Study Circle'),
      featured: true,
      ...base,
      memberAddresses: COMMUNITY_SEED_MEMBERS.slice(1),
    },
    comm_memes: {
      id: 'comm_memes',
      slug: 'memes',
      name: 'Memes',
      blurb: 'Funny things only. If the joke Cell dies, the timeline gets quieter.',
      coverImageUrl: posterDataUri('Memes'),
      featured: true,
      ...base,
      memberAddresses: [DEMO_ADDRESS, 'ckt1qzdemo_volt_builder_03'],
    },
  };
}

function seedArtifact(): LivingArtifact {
  const now = Date.now();
  return {
    id: 'relic_01',
    title: 'Window Relay · living book',
    prompt: 'Show me the view outside your window — one line, one place.',
    entries: [
      {
        id: 'a1',
        author: 'Alice',
        kind: 'view',
        body: 'Harmattan dust over the rooftops — Kaduna morning.',
        createdAt: new Date(now - hours(72)).toISOString(),
        isFeatured: false,
        place: 'Kaduna',
      },
      {
        id: 'a2',
        author: 'Bob',
        kind: 'stamp',
        body: 'Passed through the Abuja junction before the rain.',
        createdAt: new Date(now - hours(52)).toISOString(),
        isFeatured: false,
        place: 'Abuja',
      },
      {
        id: 'a3',
        author: 'Charlie',
        kind: 'meme',
        body: 'my friend said “it’s just an NFT” and then checked the timer 14 times',
        createdAt: new Date(now - hours(32)).toISOString(),
        isFeatured: true,
        place: 'Lagos',
      },
      {
        id: 'a4',
        author: 'David',
        kind: 'message',
        body: 'A cell can hold a promise, not only value.',
        createdAt: new Date(now - hours(13)).toISOString(),
        isFeatured: false,
        place: 'Accra',
      },
    ],
  };
}

function seedRelays(): Relay[] {
  return [
    {
      id: 'relay_nervos_101',
      partner: 'CKB Academy',
      partnerUrl: 'https://docs.nervos.org/docs/tech-explanation/cell-model',
      title: 'Decode one Cell',
      description: 'Learn why a Cell can represent state, ownership, and a living object.',
      category: 'Learn',
      rewardXp: 80,
      rewardLabel: 'Cell Scout badge',
      participantCount: 184,
      intent:
        'Most people meet CKB through price charts. The Cell model is the actual idea worth spreading: a unit of state with one unambiguous owner. Understanding it is the shortest path from curiosity to building.',
      instructions: [
        'Read the Cell model explanation in the Nervos docs.',
        'Find one real Cell on the CKB Explorer and look at its lock, type, capacity, and data.',
        'Write two sentences explaining what that Cell represents in plain language.',
      ],
      eligibility: 'Open to anyone. One completion per Keeper identity.',
      estimatedMinutes: 12,
      proofType: 'note',
      proofLabel: 'Your two-sentence explanation',
      proofPlaceholder: 'This Cell holds… Its lock means…',
      reviewMode: 'auto',
    },
    {
      id: 'relay_dob',
      partner: 'Spore',
      partnerUrl: 'https://spore.pro',
      title: 'Visit a digital object',
      description: 'Explore a creator-made object and leave a respectful reaction.',
      category: 'Explore',
      rewardXp: 60,
      rewardLabel: 'Culture signal',
      participantCount: 96,
      intent:
        'Digital Objects are where CKB stops being abstract. Sending real attention to a creator is worth more to the ecosystem than another anonymous mint.',
      instructions: [
        'Open a Spore digital object made by someone you have never interacted with.',
        'Read what the creator wrote about it.',
        'Leave a specific, respectful reaction — not just an emoji.',
        'Paste the link to the object you visited.',
      ],
      eligibility: 'Open to anyone. Self-promotion links are rejected in review.',
      estimatedMinutes: 8,
      proofType: 'link',
      proofLabel: 'Link to the object you visited',
      proofPlaceholder: 'https://…',
      reviewMode: 'manual',
    },
    {
      id: 'relay_builder',
      partner: 'CKB Builders',
      partnerUrl: 'https://github.com/nervosnetwork',
      title: 'Ship a signal',
      description: 'Share one useful CKB tool, idea, or resource with the chain.',
      category: 'Create',
      rewardXp: 120,
      rewardLabel: 'Relay maker badge',
      participantCount: 57,
      intent:
        'The ecosystem grows when knowledge stops living in private notes. One genuinely useful resource, shared publicly, compounds for every builder who comes after you.',
      instructions: [
        'Pick a CKB tool, SDK, script pattern, or explanation you actually used.',
        'Publish a short write-up, thread, or repo README explaining why it helped.',
        'Make sure it is publicly reachable without a login.',
        'Submit the public link.',
      ],
      eligibility: 'Open to anyone. Must be original work you published.',
      estimatedMinutes: 25,
      proofType: 'link',
      proofLabel: 'Public link to what you shipped',
      proofPlaceholder: 'https://…',
      reviewMode: 'manual',
    },
  ];
}

function seedQueue(): QueueEntry[] {
  const now = Date.now();
  return [
    {
      id: 'q1',
      name: 'Noah',
      pledge: 'I’ll bring the chain to my local CKB crew.',
      joinedAt: new Date(now - 2.5 * 60 * 60 * 1000).toISOString(),
      endorsements: 12,
      status: 'waiting',
    },
    {
      id: 'q2',
      name: 'Mina',
      pledge: 'I’ll turn the next note into a comic panel.',
      joinedAt: new Date(now - 75 * 60 * 1000).toISOString(),
      endorsements: 8,
      status: 'waiting',
    },
    {
      id: 'q3',
      name: 'Kai',
      pledge: 'I’ll onboard someone new to CKB before I pass it.',
      joinedAt: new Date(now - 22 * 60 * 1000).toISOString(),
      endorsements: 5,
      status: 'waiting',
    },
  ];
}

function seedPassport(): PassportProfile {
  return {
    address: DEMO_ADDRESS,
    displayName: 'You',
    characterId: null,
    relayStreak: 3,
    contributionXp: 260,
    completedRelayIds: [],
    artifactCount: 1,
    badgeLabels: ['Early carrier'],
    keeperTurns: 0,
  };
}

/** Seeded CKB builder community so the roster never feels empty on first visit. */
function seedBuilders(): Record<string, BuilderProfile> {
  const now = Date.now();
  const seeds: Array<{
    address: string;
    username: string;
    displayName: string;
    characterId: CharacterId;
    headline: string;
    hoursAgo: number;
    proofBalance: number;
  }> = [
    {
      address: 'ckt1qzdemo_nova_builder_01',
      username: 'ada_cells',
      displayName: 'Ada',
      characterId: 'nova',
      headline: 'New to CKB — learning Cells this week.',
      hoursAgo: 2,
      proofBalance: 40,
    },
    {
      address: 'ckt1qzdemo_ember_builder_02',
      username: 'tolu_watch',
      displayName: 'Tolu',
      characterId: 'ember',
      headline: 'Holding the night watch for the builder group.',
      hoursAgo: 5,
      proofBalance: 55,
    },
    {
      address: 'ckt1qzdemo_volt_builder_03',
      username: 'sora_scripts',
      displayName: 'Sora',
      characterId: 'volt',
      headline: 'Shipping scripts and answering newbie questions.',
      hoursAgo: 9,
      proofBalance: 20,
    },
    {
      address: 'ckt1qzdemo_mira_builder_04',
      username: 'nia_archive',
      displayName: 'Nia',
      characterId: 'mira',
      headline: 'Documenting every handoff for the crew.',
      hoursAgo: 14,
      proofBalance: 70,
    },
    {
      address: 'ckt1qzdemo_spark_builder_05',
      username: 'leo_onboard',
      displayName: 'Leo',
      characterId: 'spark',
      headline: 'Onboarding the next three builders into the group.',
      hoursAgo: 20,
      proofBalance: 15,
    },
  ];

  const out: Record<string, BuilderProfile> = {};
  for (const seed of seeds) {
    out[seed.address] = {
      address: seed.address,
      username: seed.username,
      displayName: seed.displayName,
      characterId: seed.characterId,
      avatarSporeId: null,
      headline: seed.headline,
      joinedAt: new Date(now - hours(seed.hoursAgo + 48)).toISOString(),
      lastSeenAt: new Date(now - hours(seed.hoursAgo)).toISOString(),
      onboarded: true,
      proofBalance: seed.proofBalance,
      claimedMilestones: ['username_claimed'],
      claimedBadgeIds: seed.proofBalance >= 10 ? ['explorer'] : [],
    };
  }
  return out;
}

interface JourneyBundle {
  chain: Chain;
  artifact: LivingArtifact;
}

export interface StoreState {
  activeJourneyId: string;
  journeys: Record<string, JourneyBundle>;
  communities: Record<string, Community>;
  handoffRequests: HandoffRequest[];
  board: RelayBoard;
  queue: QueueEntry[];
  passport: PassportProfile;
  attempts: Record<string, RelayAttempt>;
  builders: Record<string, BuilderProfile>;
  passports: Record<string, PassportProfile>;
}

function seedState(): StoreState {
  const chain = seedChain();
  const artifact = seedArtifact();
  return {
    activeJourneyId: chain.id,
    journeys: {
      [chain.id]: { chain, artifact },
    },
    communities: seedCommunities(),
    handoffRequests: [],
    board: { activeRelayId: 'relay_nervos_101', relays: seedRelays() },
    queue: seedQueue(),
    passport: seedPassport(),
    attempts: {},
    builders: seedBuilders(),
    passports: {},
  };
}

// Communities + scoped streaks + handoff requests.
const globalStore = globalThis as typeof globalThis & {
  __keepersRelayStoreV7?: StoreState;
};

function state(): StoreState {
  if (!globalStore.__keepersRelayStoreV7) {
    globalStore.__keepersRelayStoreV7 = seedState();
  }
  return globalStore.__keepersRelayStoreV7;
}

/** Used by persistence layer — do not call from UI. */
export function exportStoreState(): StoreState {
  return clone(state());
}

/** Hydrate from Neon / local file on cold start. */
export function importStoreState(next: StoreState): void {
  globalStore.__keepersRelayStoreV7 = next;
}

function activeBundle(): JourneyBundle {
  const s = state();
  const bundle = s.journeys[s.activeJourneyId];
  if (!bundle) {
    throw new StoreError('Active journey missing from store.', 500);
  }
  return bundle;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class StoreError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------------ chain */

/** Apply the "did the clock run out?" rule lazily whenever the chain is read. */
function reconcileJourneyClock(chain: Chain): void {
  if (chain.status === 'dead' || chain.status === 'returned') return;
  if (Date.now() > new Date(chain.expiresAt).getTime()) {
    chain.status = 'dead';
    chain.diedAt = chain.expiresAt;
  }
}

function reconcileExpiry(): void {
  reconcileJourneyClock(activeBundle().chain);
}

function toSummary(chain: Chain): JourneySummary {
  const community = state().communities[chain.communityId];
  return {
    id: chain.id,
    communityId: chain.communityId,
    communityName: community?.name ?? 'Unknown room',
    communitySlug: community?.slug ?? '',
    creatureName: chain.creatureName,
    creatorName: chain.creatorName,
    seedPrompt: chain.seedPrompt,
    status: chain.status,
    mode: chain.mode,
    holderCount: chain.owners.length,
    currentHolder: chain.owners[chain.owners.length - 1]?.name ?? '',
    trophyGoal: chain.trophyGoal,
    rewardPoolProof: chain.rewardPoolProof,
    expiresAt: chain.expiresAt,
    createdAt: chain.createdAt,
    coverImageUrl: resolveCover(chain.coverImageUrl, chain.creatureName),
  };
}

export function listJourneys(communityId?: string): {
  activeJourneyId: string;
  journeys: JourneySummary[];
} {
  const s = state();
  for (const journey of Object.values(s.journeys)) {
    reconcileJourneyClock(journey.chain);
  }
  const journeys = Object.values(s.journeys)
    .map((j) => toSummary(j.chain))
    .filter((j) => (communityId ? j.communityId === communityId : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { activeJourneyId: s.activeJourneyId, journeys };
}

export function selectJourney(journeyId: string): Chain {
  const s = state();
  if (!s.journeys[journeyId]) throw new StoreError('Journey not found.', 404);
  s.activeJourneyId = journeyId;
  reconcileExpiry();
  return clone(s.journeys[journeyId].chain);
}

export type LaunchJourneyInput = {
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
};

/** Members of a community can launch a Cell streak inside that room. */
export function launchJourney(input: LaunchJourneyInput): Chain {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before launching a journey.', 403);
  }

  const community = state().communities[input.communityId];
  if (!community) throw new StoreError('Community not found.', 404);
  if (!community.memberAddresses.includes(builder.address)) {
    throw new StoreError('Join this community before launching a streak here.', 403);
  }

  const creatureName = input.creatureName.trim();
  const seedPrompt = input.seedPrompt.trim();
  if (creatureName.length < 2 || creatureName.length > 40) {
    throw new StoreError('Name your journey in 2–40 characters.');
  }
  if (seedPrompt.length < 8 || seedPrompt.length > 160) {
    throw new StoreError('Seed prompt must be 8–160 characters.');
  }
  const trophyGoal = Math.max(5, Math.min(500, Math.floor(input.trophyGoal || 50)));
  const windowHours =
    input.windowHours === 168 || input.windowHours === 720 ? input.windowHours : 24;
  const initialProof = Math.max(0, Math.min(10_000, Math.floor(input.initialProof ?? 0)));

  if (initialProof > 0 && builder.proofBalance < initialProof) {
    throw new StoreError(
      `Not enough PROOF to seed the pot (you have ${builder.proofBalance}).`,
      409,
    );
  }

  const now = Date.now();
  const id = `journey_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const chain: Chain = {
    id,
    status: 'alive',
    communityId: community.id,
    owners: [makeOwner(builder.displayName, now, null, undefined, null, builder.address)],
    expiresAt: input.expiresAt ?? new Date(now + hours(windowHours)).toISOString(),
    windowHours,
    trophyGoal,
    diedAt: null,
    creatorName: builder.displayName,
    creatorAddress: builder.address,
    seedPrompt,
    mode: input.mode,
    creatureName,
    coverImageUrl: resolveCover(input.coverImageUrl, creatureName),
    returnedAt: null,
    createdAt: new Date(now).toISOString(),
    rewardPoolProof: initialProof,
    rewardPoolNote:
      input.rewardPoolNote?.trim() ||
      (initialProof > 0
        ? `Seeded by ${builder.displayName} for keepers who carry this Cell.`
        : undefined),
    cellOutPoint: input.cellOutPoint,
    onChainChainId: input.onChainChainId,
    genesisTxHash: input.genesisTxHash,
    lastTxHash: input.genesisTxHash,
  };

  const artifact: LivingArtifact = {
    id: `relic_${id}`,
    title: `${creatureName} · living book`,
    prompt: seedPrompt,
    entries: [],
  };

  const s = state();
  if (initialProof > 0) {
    builder.proofBalance -= initialProof;
    s.builders[builder.address] = builder;
  }

  s.journeys[id] = { chain, artifact };
  s.activeJourneyId = id;
  return clone(chain);
}

/** Soft treasury top-up — later becomes a real sUDT / claim-ticket flow. */
export function fundJourneyTreasury(input: {
  journeyId: string;
  address: string;
  amount: number;
  note?: string;
}): Chain {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before funding a pot.', 403);
  }
  const amount = Math.floor(input.amount);
  if (amount < 1) throw new StoreError('Add at least 1 PROOF.');
  if (builder.proofBalance < amount) {
    throw new StoreError(`Not enough PROOF (you have ${builder.proofBalance}).`, 409);
  }

  const s = state();
  const journey = s.journeys[input.journeyId];
  if (!journey) throw new StoreError('Journey not found.', 404);
  if (journey.chain.status === 'dead') {
    throw new StoreError('Cannot fund a dead journey.', 409);
  }

  builder.proofBalance -= amount;
  s.builders[builder.address] = builder;
  journey.chain.rewardPoolProof += amount;
  if (input.note?.trim()) {
    journey.chain.rewardPoolNote = input.note.trim();
  }

  s.activeJourneyId = input.journeyId;
  return clone(journey.chain);
}

/* -------------------------------------------------------------- communities */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function toCommunitySummary(
  community: Community,
  viewerAddress?: string | null,
): CommunitySummary {
  const s = state();
  let liveStreakCount = 0;
  for (const journey of Object.values(s.journeys)) {
    reconcileJourneyClock(journey.chain);
    if (
      journey.chain.communityId === community.id &&
      journey.chain.status === 'alive'
    ) {
      liveStreakCount += 1;
    }
  }
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    blurb: community.blurb,
    coverImageUrl: resolveCover(community.coverImageUrl, community.name),
    featured: community.featured,
    memberCount: community.memberAddresses.length,
    liveStreakCount,
    creatorName: community.creatorName,
    creatorAddress: community.creatorAddress,
    createdAt: community.createdAt,
    isMember: viewerAddress
      ? community.memberAddresses.includes(viewerAddress)
      : false,
  };
}

export function listCommunities(viewerAddress?: string | null): CommunitySummary[] {
  const s = state();
  return Object.values(s.communities)
    .map((c) => toCommunitySummary(c, viewerAddress))
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function getCommunityBySlug(
  slug: string,
  viewerAddress?: string | null,
): {
  community: CommunitySummary;
  streaks: JourneySummary[];
  members: { address: string; displayName: string; username: string }[];
} {
  const s = state();
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new StoreError('Community not found.', 404);

  const streaks = Object.values(s.journeys)
    .map((j) => {
      reconcileJourneyClock(j.chain);
      return toSummary(j.chain);
    })
    .filter((j) => j.communityId === community.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const members = community.memberAddresses.map((address) => {
    const builder = s.builders[address];
    return {
      address,
      displayName: builder?.displayName ?? address.slice(0, 10),
      username: builder?.username ?? '',
    };
  });

  return {
    community: toCommunitySummary(community, viewerAddress),
    streaks,
    members,
  };
}

export function createCommunity(input: {
  address: string;
  name: string;
  blurb: string;
  coverImageUrl?: string;
}): CommunitySummary {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before creating a community.', 403);
  }

  const name = input.name.trim();
  const blurb = input.blurb.trim();
  if (name.length < 2 || name.length > 40) {
    throw new StoreError('Community name must be 2–40 characters.');
  }
  if (blurb.length < 8 || blurb.length > 180) {
    throw new StoreError('Blurb must be 8–180 characters.');
  }

  let slug = slugify(name) || `room-${Date.now().toString(36)}`;
  const s = state();
  if (Object.values(s.communities).some((c) => c.slug === slug)) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
  }

  const id = `comm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const community: Community = {
    id,
    slug,
    name,
    blurb,
    coverImageUrl: resolveCover(input.coverImageUrl, name),
    featured: false,
    creatorAddress: builder.address,
    creatorName: builder.displayName,
    memberAddresses: [builder.address],
    createdAt: new Date().toISOString(),
  };

  s.communities[id] = community;
  return toCommunitySummary(community, builder.address);
}

export function joinCommunity(slug: string, address: string): CommunitySummary {
  const builder = getBuilder(address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before joining a community.', 403);
  }
  const s = state();
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new StoreError('Community not found.', 404);
  if (!community.memberAddresses.includes(address)) {
    community.memberAddresses.push(address);
  }
  return toCommunitySummary(community, address);
}

export function leaveCommunity(slug: string, address: string): CommunitySummary {
  const s = state();
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new StoreError('Community not found.', 404);
  if (community.creatorAddress === address && community.featured) {
    throw new StoreError('Featured community creators can’t leave the room.', 409);
  }
  community.memberAddresses = community.memberAddresses.filter((a) => a !== address);
  return toCommunitySummary(community, address);
}

export function requestHandoff(input: {
  address: string;
  journeyId: string;
  note?: string;
}): HandoffRequest {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before requesting the Cell.', 403);
  }

  const s = state();
  const journey = s.journeys[input.journeyId];
  if (!journey) throw new StoreError('Streak not found.', 404);
  reconcileJourneyClock(journey.chain);
  if (journey.chain.status !== 'alive') {
    throw new StoreError('This streak is no longer open for handoffs.', 409);
  }

  const community = s.communities[journey.chain.communityId];
  if (!community) throw new StoreError('Community missing for this streak.', 500);
  if (!community.memberAddresses.includes(builder.address)) {
    throw new StoreError('Join the community before requesting this Cell.', 403);
  }

  const current = journey.chain.owners[journey.chain.owners.length - 1];
  if (current?.name.toLowerCase() === builder.displayName.toLowerCase()) {
    throw new StoreError('You already hold this Cell.', 409);
  }

  const existing = s.handoffRequests.find(
    (r) =>
      r.journeyId === input.journeyId &&
      r.requesterAddress === builder.address &&
      r.status === 'pending',
  );
  if (existing) return clone(existing);

  const request: HandoffRequest = {
    id: `handoff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    journeyId: input.journeyId,
    communityId: community.id,
    requesterAddress: builder.address,
    requesterName: builder.displayName,
    note: (input.note ?? '').trim().slice(0, 120),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  s.handoffRequests.unshift(request);
  return clone(request);
}

export function listHandoffRequests(journeyId: string): HandoffRequest[] {
  return clone(
    state().handoffRequests.filter(
      (r) => r.journeyId === journeyId && r.status === 'pending',
    ),
  );
}

/** Current holder accepts a community member’s request → pass the Cell to them. */
export function acceptHandoff(input: {
  address: string;
  requestId: string;
  city?: string;
  cellOutPoint?: { txHash: string; index: string };
  txHash?: string;
  expiresAt?: string;
}): Chain {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding first.', 403);
  }

  const s = state();
  const request = s.handoffRequests.find((r) => r.id === input.requestId);
  if (!request || request.status !== 'pending') {
    throw new StoreError('Handoff request not found.', 404);
  }

  const journey = s.journeys[request.journeyId];
  if (!journey) throw new StoreError('Streak not found.', 404);

  s.activeJourneyId = request.journeyId;
  const current = journey.chain.owners[journey.chain.owners.length - 1];
  if (!current || current.name.toLowerCase() !== builder.displayName.toLowerCase()) {
    throw new StoreError('Only the current holder can accept a handoff request.', 403);
  }

  const next = passChain(request.requesterName, input.city, {
    recipientAddress: request.requesterAddress,
    cellOutPoint: input.cellOutPoint,
    txHash: input.txHash,
    expiresAt: input.expiresAt,
  });
  request.status = 'accepted';
  return next;
}

export function declineHandoff(input: {
  address: string;
  requestId: string;
}): HandoffRequest {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding first.', 403);
  }
  const s = state();
  const request = s.handoffRequests.find((r) => r.id === input.requestId);
  if (!request || request.status !== 'pending') {
    throw new StoreError('Handoff request not found.', 404);
  }
  const journey = s.journeys[request.journeyId];
  if (!journey) throw new StoreError('Streak not found.', 404);
  const current = journey.chain.owners[journey.chain.owners.length - 1];
  if (!current || current.name.toLowerCase() !== builder.displayName.toLowerCase()) {
    throw new StoreError('Only the current holder can decline a request.', 403);
  }
  request.status = 'declined';
  return clone(request);
}

/** Community creator / featured manager can mint soft PROOF to a member (app layer). */
export function grantCommunityProof(input: {
  adminAddress: string;
  slug: string;
  recipientAddress: string;
  amount: number;
  note?: string;
}): { recipient: BuilderProfile; granted: number; note?: string } {
  const admin = getBuilder(input.adminAddress);
  if (!admin?.onboarded) throw new StoreError('Finish onboarding first.', 403);

  const s = state();
  const community = Object.values(s.communities).find((c) => c.slug === input.slug);
  if (!community) throw new StoreError('Community not found.', 404);
  if (community.creatorAddress !== admin.address) {
    throw new StoreError('Only the community creator can grant PROOF here.', 403);
  }

  const amount = Math.floor(input.amount);
  if (amount < 1 || amount > 10_000) {
    throw new StoreError('Grant between 1 and 10,000 PROOF.');
  }

  const recipient = getBuilder(input.recipientAddress);
  if (!recipient?.onboarded) {
    throw new StoreError('Recipient must be an onboarded builder.', 404);
  }
  if (!community.memberAddresses.includes(recipient.address)) {
    throw new StoreError('Recipient must be a member of this community.', 403);
  }

  recipient.proofBalance += amount;
  s.builders[recipient.address] = recipient;
  return {
    recipient: clone(recipient),
    granted: amount,
    note: input.note?.trim() || undefined,
  };
}

export function getChain(): Chain {
  reconcileExpiry();
  return clone(activeBundle().chain);
}

export type IndexedLiveCell = {
  chainId: string;
  status: number;
  ownerCount: number;
  expiresAtMs: number;
  windowSeconds: number;
  holderAddress: string;
  outPoint: { txHash: string; index: string };
};

/** Overlay indexer live Cells onto matching journeys. Returns true if anything changed. */
export function applyIndexedCells(cells: IndexedLiveCell[]): boolean {
  const s = state();
  let changed = false;

  for (const cell of cells) {
    const journey = Object.values(s.journeys).find(
      (j) => j.chain.onChainChainId?.toLowerCase() === cell.chainId.toLowerCase(),
    );
    if (!journey) continue;
    const chain = journey.chain;
    const expiresAt = new Date(cell.expiresAtMs).toISOString();
    const windowHours = Math.max(1, Math.round(cell.windowSeconds / 3600));
    const status: Chain['status'] =
      cell.status === 2 ? 'returned' : cell.status === 1 ? 'dead' : 'alive';

    const holder = findBuilderByAddressOrHandle(cell.holderAddress);
    const last = chain.owners[chain.owners.length - 1];
    const holderName = holder?.displayName || last?.name || 'Keeper';

    if (last && cell.ownerCount === chain.owners.length) {
      if (last.address?.toLowerCase() !== cell.holderAddress.toLowerCase()) {
        last.address = cell.holderAddress;
        if (holder) last.name = holder.displayName;
        changed = true;
      }
    } else if (cell.ownerCount > chain.owners.length && last) {
      last.passedAt = last.passedAt ?? new Date().toISOString();
      chain.owners = [
        ...chain.owners,
        makeOwner(holderName, Date.now(), null, undefined, null, cell.holderAddress),
      ];
      changed = true;
    }

    if (chain.status !== status) {
      chain.status = status;
      if (status === 'returned') chain.returnedAt = chain.returnedAt ?? new Date().toISOString();
      if (status === 'dead') chain.diedAt = chain.diedAt ?? new Date().toISOString();
      changed = true;
    }
    if (chain.expiresAt !== expiresAt) {
      chain.expiresAt = expiresAt;
      changed = true;
    }
    if (chain.windowHours !== windowHours) {
      chain.windowHours = windowHours;
      changed = true;
    }
    if (
      chain.cellOutPoint?.txHash !== cell.outPoint.txHash ||
      chain.cellOutPoint?.index !== cell.outPoint.index
    ) {
      chain.cellOutPoint = cell.outPoint;
      chain.lastTxHash = cell.outPoint.txHash;
      changed = true;
    }
  }

  return changed;
}

/** True when the current Keeper has sealed a mark since receiving the Cell. */
export function currentKeeperHasContributed(): boolean {
  const journey = activeBundle();
  const current = journey.chain.owners[journey.chain.owners.length - 1];
  if (!current) return false;
  if (current.contributionId) return true;
  return journey.artifact.entries.some(
    (entry) =>
      entry.author.toLowerCase() === current.name.toLowerCase() &&
      new Date(entry.createdAt).getTime() >= new Date(current.receivedAt).getTime(),
  );
}

export type PassChainOnChain = {
  recipientAddress?: string;
  cellOutPoint?: { txHash: string; index: string };
  txHash?: string;
  expiresAt?: string;
};

export function passChain(recipient: string, city?: string, onChain?: PassChainOnChain): Chain {
  reconcileExpiry();
  const journey = activeBundle();
  const chain = journey.chain;

  const resolved =
    findBuilderByAddressOrHandle(onChain?.recipientAddress || recipient) ??
    findBuilderByAddressOrHandle(recipient);
  const name = (resolved?.displayName || recipient.replace(/^@/, '').trim()).slice(0, 24);
  if (!name) throw new StoreError('A recipient name is required.');

  if (chain.status === 'dead') {
    throw new StoreError('This chain is dead. The cell is permanently locked.', 409);
  }
  if (chain.status === 'returned') {
    throw new StoreError('This Cell already returned home. The journey is sealed.', 409);
  }

  const now = Date.now();
  const current = chain.owners[chain.owners.length - 1];
  const place = city?.trim();

  if (!currentKeeperHasContributed()) {
    throw new StoreError(
      'Seal one contribution into the Living Artifact before you pass the Cell.',
      409,
    );
  }

  if (name.toLowerCase() === current.name.toLowerCase()) {
    throw new StoreError('Pass it to someone else — you already hold it.');
  }

  const priorNames = chain.owners.map((owner) => owner.name.toLowerCase());
  const priorAddresses = chain.owners
    .map((owner) => owner.address?.toLowerCase())
    .filter(Boolean) as string[];
  const nextAddress = (resolved?.address || onChain?.recipientAddress)?.toLowerCase();
  const isCreator =
    name.toLowerCase() === chain.creatorName.toLowerCase() ||
    Boolean(chain.creatorAddress && nextAddress === chain.creatorAddress.toLowerCase());

  if (chain.mode === 'return_home') {
    const heldBefore =
      priorNames.includes(name.toLowerCase()) ||
      Boolean(nextAddress && priorAddresses.includes(nextAddress));
    if (!isCreator && heldBefore) {
      throw new StoreError(
        'Return-home mode: only people who have never held this Cell can receive it (except the creator).',
        409,
      );
    }
  }

  current.passedAt = new Date(now).toISOString();
  if (place && !current.city) current.city = place;

  chain.owners = [
    ...chain.owners,
    makeOwner(name, now, null, place || undefined, null, resolved?.address || onChain?.recipientAddress),
  ];
  chain.expiresAt = onChain?.expiresAt ?? new Date(now + hours(chain.windowHours)).toISOString();
  if (onChain?.cellOutPoint) chain.cellOutPoint = onChain.cellOutPoint;
  if (onChain?.txHash) chain.lastTxHash = onChain.txHash;

  if (chain.mode === 'return_home' && isCreator) {
    chain.status = 'returned';
    chain.returnedAt = new Date(now).toISOString();
    chain.expiresAt = new Date(now + hours(24 * 365)).toISOString();
  }

  const s = state();
  if (current.name === DEMO_KEEPER) {
    s.passport.keeperTurns += 1;
  }

  return clone(chain);
}

export function resetChain(): Chain {
  const s = state();
  const chain = seedChain();
  const artifact = seedArtifact();
  s.journeys = { [chain.id]: { chain, artifact } };
  s.activeJourneyId = chain.id;
  return clone(chain);
}

/** Demo helper: pull the expiry down so the death state can be observed. */
export function fastForwardChain(): Chain {
  reconcileExpiry();
  const chain = activeBundle().chain;
  if (chain.status === 'alive') {
    chain.expiresAt = new Date(Date.now() + 10_000).toISOString();
  }
  return clone(chain);
}

export function getCurrentKeeper(): string {
  const chain = getChain();
  return chain.owners[chain.owners.length - 1]?.name ?? '';
}

/* --------------------------------------------------------------- artifact */

export function getArtifact(): LivingArtifact {
  return clone(activeBundle().artifact);
}

export function publishArtifact(input: {
  body: string;
  kind: ArtifactKind;
  place?: string;
}): LivingArtifact {
  const s = state();
  const journey = activeBundle();
  const body = input.body.trim();
  if (!body) throw new StoreError('Write a note before sealing it into the relic.');
  if (body.length > 180) throw new StoreError('Keep the relic entry under 180 characters.');

  const keeper = getCurrentKeeper() || DEMO_KEEPER;
  const current = journey.chain.owners[journey.chain.owners.length - 1];
  const place = input.place?.trim() || undefined;
  const entryId = `entry_${Date.now().toString(36)}`;

  journey.artifact = {
    ...journey.artifact,
    entries: [
      ...journey.artifact.entries,
      {
        id: entryId,
        author: keeper,
        kind: input.kind,
        body,
        createdAt: new Date().toISOString(),
        isFeatured: false,
        place,
      },
    ],
  };

  if (current && current.name.toLowerCase() === keeper.toLowerCase()) {
    current.contributionId = entryId;
    if (place && !current.city) current.city = place;
  }

  s.passport = {
    ...s.passport,
    artifactCount: s.passport.artifactCount + 1,
    contributionXp: s.passport.contributionXp + 100,
    badgeLabels: s.passport.badgeLabels.includes('Living archive')
      ? s.passport.badgeLabels
      : [...s.passport.badgeLabels, 'Living archive'],
  };
  if (s.passport.address && s.passports[s.passport.address]) {
    s.passports[s.passport.address] = clone(s.passport);
  }

  return clone(journey.artifact);
}

export function featureArtifact(entryId: string): LivingArtifact {
  const journey = activeBundle();
  if (!journey.artifact.entries.some((entry) => entry.id === entryId)) {
    throw new StoreError('That relic entry no longer exists.', 404);
  }
  journey.artifact = {
    ...journey.artifact,
    entries: journey.artifact.entries.map((entry) => ({
      ...entry,
      isFeatured: entry.id === entryId,
    })),
  };
  return clone(journey.artifact);
}

/* ----------------------------------------------------------------- relays */

function emptyAttempt(relayId: string): RelayAttempt {
  return {
    relayId,
    status: 'not_started',
    proof: null,
    startedAt: null,
    submittedAt: null,
    verifiedAt: null,
    claimedAt: null,
    reviewerNote: null,
    reviewEta: null,
  };
}

/** Settle any submitted proof whose mock review window has elapsed. */
function reconcileAttempt(attempt: RelayAttempt): RelayAttempt {
  if (attempt.status !== 'submitted' || !attempt.reviewEta) return attempt;
  if (Date.now() < new Date(attempt.reviewEta).getTime()) return attempt;

  attempt.status = 'verified';
  attempt.verifiedAt = new Date().toISOString();
  attempt.reviewerNote = 'Proof accepted. Reward unlocked.';
  attempt.reviewEta = null;
  return attempt;
}

function attemptFor(relayId: string): RelayAttempt {
  const s = state();
  const existing = s.attempts[relayId];
  if (!existing) return emptyAttempt(relayId);
  return reconcileAttempt(existing);
}

function requireRelay(relayId: string): Relay {
  const relay = state().board.relays.find((item) => item.id === relayId);
  if (!relay) throw new StoreError('That relay is unavailable.', 404);
  return relay;
}

export function getRelayBoard(): RelayBoard {
  return clone(state().board);
}

export function getRelayDetail(relayId: string): RelayDetail {
  const relay = requireRelay(relayId);
  return clone({
    relay,
    attempt: attemptFor(relayId),
    isActive: state().board.activeRelayId === relayId,
  });
}

export function activateRelay(relayId: string): RelayBoard {
  requireRelay(relayId);
  const s = state();
  s.board = { ...s.board, activeRelayId: relayId };
  return clone(s.board);
}

export function startRelay(relayId: string): RelayDetail {
  requireRelay(relayId);
  const s = state();
  const attempt = attemptFor(relayId);
  if (attempt.status === 'not_started') {
    attempt.status = 'started';
    attempt.startedAt = new Date().toISOString();
    s.attempts[relayId] = attempt;
  }
  return getRelayDetail(relayId);
}

export function submitRelayProof(relayId: string, proof: string): RelayDetail {
  const relay = requireRelay(relayId);
  const s = state();
  const attempt = attemptFor(relayId);

  if (attempt.status === 'claimed') {
    throw new StoreError('You already claimed this relay reward.', 409);
  }
  if (attempt.status === 'submitted') {
    throw new StoreError('This proof is already in review.', 409);
  }

  const value = proof.trim();
  if (!value) throw new StoreError('Add your proof before submitting.');
  if (relay.proofType === 'link' && !/^https?:\/\/\S+$/i.test(value)) {
    throw new StoreError('Submit a full link starting with http:// or https://');
  }
  if (relay.proofType === 'tx-hash' && !/^0x[0-9a-f]{6,}$/i.test(value)) {
    throw new StoreError('Submit a valid transaction hash starting with 0x.');
  }
  if (relay.proofType === 'note' && value.length < 40) {
    throw new StoreError('Write at least a couple of real sentences (40+ characters).');
  }

  attempt.status = 'submitted';
  attempt.proof = value;
  attempt.submittedAt = new Date().toISOString();
  attempt.reviewerNote =
    relay.reviewMode === 'manual'
      ? 'A community reviewer is checking this submission.'
      : 'Automated check running.';
  attempt.reviewEta = new Date(Date.now() + REVIEW_MS[relay.reviewMode]).toISOString();
  s.attempts[relayId] = attempt;

  return getRelayDetail(relayId);
}

export function claimRelayReward(
  relayId: string,
  address?: string,
): {
  detail: RelayDetail;
  board: RelayBoard;
  passport: PassportProfile;
  builder: BuilderProfile | null;
} {
  const relay = requireRelay(relayId);
  const s = state();
  const attempt = attemptFor(relayId);

  if (attempt.status !== 'verified') {
    throw new StoreError('This relay is not verified yet.', 409);
  }

  attempt.status = 'claimed';
  attempt.claimedAt = new Date().toISOString();
  s.attempts[relayId] = attempt;

  s.board = {
    ...s.board,
    relays: s.board.relays.map((item) =>
      item.id === relayId ? { ...item, participantCount: item.participantCount + 1 } : item,
    ),
  };

  s.passport = {
    ...s.passport,
    relayStreak: s.passport.relayStreak + 1,
    contributionXp: s.passport.contributionXp + relay.rewardXp,
    completedRelayIds: s.passport.completedRelayIds.includes(relayId)
      ? s.passport.completedRelayIds
      : [...s.passport.completedRelayIds, relayId],
    badgeLabels: s.passport.badgeLabels.includes(relay.rewardLabel)
      ? s.passport.badgeLabels
      : [...s.passport.badgeLabels, relay.rewardLabel],
  };

  let builder: BuilderProfile | null = null;
  if (address && s.builders[address]) {
    builder = awardRelayReward(address, relay.rewardXp);
    const passport = getPassport(address);
    passport.completedRelayIds = s.passport.completedRelayIds.includes(relayId)
      ? passport.completedRelayIds
      : [...passport.completedRelayIds, relayId];
    if (!passport.badgeLabels.includes(relay.rewardLabel)) {
      passport.badgeLabels = [...passport.badgeLabels, relay.rewardLabel];
    }
    s.passports[address] = passport;
    s.passport = passport;
  } else if (s.passport.address && s.passports[s.passport.address]) {
    s.passports[s.passport.address] = clone(s.passport);
  }

  return {
    detail: getRelayDetail(relayId),
    board: clone(s.board),
    passport: clone(s.passport),
    builder,
  };
}

export function getAttempts(): Record<string, RelayAttempt> {
  const s = state();
  const out: Record<string, RelayAttempt> = {};
  for (const relay of s.board.relays) {
    out[relay.id] = clone(attemptFor(relay.id));
  }
  return out;
}

/* ------------------------------------------------------------------ queue */

export function getQueue(): QueueEntry[] {
  return clone(state().queue);
}

export function joinQueue(input: { name: string; pledge: string }): QueueEntry[] {
  const s = state();
  const name = input.name.trim();
  const pledge = input.pledge.trim();

  if (!name || !pledge) throw new StoreError('Add your name and a promise to the next keeper.');
  if (name.length > 24 || pledge.length > 120) {
    throw new StoreError('Keep your pledge concise so the keeper can read it.');
  }
  if (s.queue.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
    throw new StoreError('That name is already in the handoff queue.', 409);
  }

  s.queue = [
    {
      id: `queue_${Date.now().toString(36)}`,
      name,
      pledge,
      joinedAt: new Date().toISOString(),
      endorsements: 0,
      status: 'waiting',
    },
    ...s.queue,
  ];
  return clone(s.queue);
}

export function endorseCandidate(entryId: string): QueueEntry[] {
  const s = state();
  if (!s.queue.some((entry) => entry.id === entryId)) {
    throw new StoreError('This candidate is no longer in the queue.', 404);
  }
  s.queue = s.queue.map((entry) =>
    entry.id === entryId
      ? { ...entry, endorsements: entry.endorsements + 1, status: 'endorsed' }
      : entry,
  );
  return clone(s.queue);
}

/* --------------------------------------------------------------- passport */

function emptyPassport(address: string, displayName: string, characterId: string | null): PassportProfile {
  return {
    address,
    displayName,
    characterId,
    relayStreak: 0,
    contributionXp: 0,
    completedRelayIds: [],
    artifactCount: 0,
    badgeLabels: ['Joined the relay'],
    keeperTurns: 0,
  };
}

export function getPassport(address?: string): PassportProfile {
  const s = state();
  if (!address) return clone(s.passport);

  const existing = s.passports[address];
  if (existing) {
    s.passport = existing;
    return clone(existing);
  }

  const builder = s.builders[address];
  if (builder) {
    const passport = emptyPassport(address, builder.displayName, builder.characterId);
    s.passports[address] = passport;
    s.passport = passport;
    return clone(passport);
  }

  return clone(s.passport);
}

export function setActivePassport(address: string): PassportProfile {
  return getPassport(address);
}

/* --------------------------------------------------------------- builders */

export function listBuilders(): BuilderProfile[] {
  const s = state();
  return clone(
    Object.values(s.builders)
      .filter((builder) => builder.onboarded)
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()),
  );
}

export function getBuilder(address: string): BuilderProfile | null {
  const builder = state().builders[address];
  return builder ? clone(builder) : null;
}

export function checkUsernameAvailable(usernameRaw: string, exceptAddress?: string): {
  username: string;
  available: boolean;
  reason: string | null;
} {
  const username = normalizeUsername(usernameRaw);
  const reason = validateUsername(username);
  if (reason) return { username, available: false, reason };

  const taken = Object.values(state().builders).find(
    (builder) =>
      builder.username === username &&
      (!exceptAddress || builder.address !== exceptAddress),
  );
  if (taken) {
    return { username, available: false, reason: 'That username is already taken.' };
  }
  return { username, available: true, reason: null };
}

export function upsertBuilder(input: UpsertBuilderInput): BuilderProfile {
  const s = state();
  const address = input.address.trim();
  const displayName = input.displayName.trim();
  const usernameCheck = checkUsernameAvailable(input.username, address);
  const characterId = input.characterId ?? null;
  const headline = (input.headline ?? '').trim();

  if (!address) throw new StoreError('Connect a wallet before creating a profile.');
  if (!usernameCheck.available) {
    throw new StoreError(usernameCheck.reason ?? 'Username unavailable.', 409);
  }
  if (!displayName) throw new StoreError('Pick a display name the crew can call you.');
  if (displayName.length > 24) throw new StoreError('Keep the name under 24 characters.');
  if (characterId && !CHARACTERS.some((character) => character.id === characterId)) {
    throw new StoreError('That character is not in the cast.');
  }

  const now = new Date().toISOString();
  const previous = s.builders[address];
  const builder: BuilderProfile = {
    address,
    username: usernameCheck.username,
    displayName,
    characterId,
    avatarSporeId:
      input.avatarSporeId !== undefined
        ? input.avatarSporeId
        : (previous?.avatarSporeId ?? null),
    headline: headline || 'A CKB builder keeping the chain alive.',
    joinedAt: previous?.joinedAt ?? now,
    lastSeenAt: now,
    onboarded: true,
    proofBalance: previous?.proofBalance ?? 0,
    claimedMilestones: previous?.claimedMilestones ?? [],
    claimedBadgeIds: previous?.claimedBadgeIds ?? [],
  };

  s.builders[address] = builder;

  const passport = s.passports[address] ?? emptyPassport(address, displayName, characterId);
  passport.displayName = displayName;
  passport.characterId = characterId;
  passport.address = address;
  if (!passport.badgeLabels.includes('Joined the relay')) {
    passport.badgeLabels = [...passport.badgeLabels, 'Joined the relay'];
  }
  s.passports[address] = passport;
  s.passport = passport;

  awardMilestone(address, 'username_claimed');
  if (builder.avatarSporeId) {
    awardMilestone(address, 'profile_completed');
  }

  return clone(s.builders[address]);
}

export function setBuilderAvatar(address: string, avatarSporeId: string | null): BuilderProfile {
  const s = state();
  const builder = s.builders[address];
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before setting an avatar.', 403);
  }
  builder.avatarSporeId = avatarSporeId;
  builder.lastSeenAt = new Date().toISOString();
  if (avatarSporeId) {
    awardMilestone(address, 'profile_completed');
  }
  return clone(builder);
}

export function clearBuilderAvatarIfMatches(address: string, sporeId: string): BuilderProfile | null {
  const s = state();
  const builder = s.builders[address];
  if (!builder || builder.avatarSporeId !== sporeId) return builder ? clone(builder) : null;
  builder.avatarSporeId = null;
  builder.lastSeenAt = new Date().toISOString();
  return clone(builder);
}

export function touchBuilder(address: string): BuilderProfile | null {
  const s = state();
  const builder = s.builders[address];
  if (!builder) return null;
  builder.lastSeenAt = new Date().toISOString();
  return clone(builder);
}

/* --------------------------------------------------------------- rewards */

function awardMilestone(address: string, milestone: RewardMilestone): BuilderProfile | null {
  const s = state();
  const builder = s.builders[address];
  if (!builder) return null;
  if (builder.claimedMilestones.includes(milestone)) return builder;

  if (milestone === 'profile_completed') {
    if (!builder.username || !builder.avatarSporeId || !builder.displayName) return builder;
  }

  builder.claimedMilestones = [...builder.claimedMilestones, milestone];
  builder.proofBalance += REWARD_POINTS[milestone];

  const passport = s.passports[address] ?? emptyPassport(address, builder.displayName, builder.characterId);
  passport.contributionXp = builder.proofBalance;
  const label = REWARD_LABELS[milestone];
  if (!passport.badgeLabels.includes(label)) {
    passport.badgeLabels = [...passport.badgeLabels, label];
  }
  s.passports[address] = passport;
  s.passport = passport;
  return builder;
}

export function awardRelayReward(address: string, xp: number): BuilderProfile {
  const s = state();
  const builder = s.builders[address];
  if (!builder?.onboarded) {
    throw new StoreError('Connect and onboard before claiming Relay rewards.', 403);
  }

  builder.proofBalance += xp;
  const passport = getPassport(address);
  passport.contributionXp = builder.proofBalance;
  passport.relayStreak += 1;
  s.passports[address] = passport;
  s.passport = passport;

  awardMilestone(address, 'first_relay');
  if (passport.relayStreak >= 3) {
    awardMilestone(address, 'relay_streak_3');
  }

  return clone(s.builders[address]);
}

export function unlockBadge(address: string, badgeId: string): BuilderProfile {
  const s = state();
  const builder = s.builders[address];
  if (!builder?.onboarded) {
    throw new StoreError('Onboard before unlocking badges.', 403);
  }

  const badge = KEEPER_BADGES.find((item) => item.id === badgeId);
  if (!badge) throw new StoreError('Unknown badge.', 404);
  if (builder.claimedBadgeIds.includes(badgeId)) {
    throw new StoreError('You already unlocked this badge.', 409);
  }
  if (builder.proofBalance < badge.requiredProof) {
    throw new StoreError(`Need ${badge.requiredProof} PROOF to unlock ${badge.name}.`, 409);
  }

  // Soft spend: badge unlocks at threshold without burning (Spore ID burns sUDT on-chain later).
  builder.claimedBadgeIds = [...builder.claimedBadgeIds, badgeId];
  const passport = getPassport(address);
  if (!passport.badgeLabels.includes(badge.name)) {
    passport.badgeLabels = [...passport.badgeLabels, badge.name];
  }
  s.passports[address] = passport;
  s.passport = passport;
  return clone(builder);
}

/**
 * Demo helper for the community loop: the connected builder takes the Cell
 * from whoever currently holds it, so they can exercise Keeper privileges.
 */
export function assumeKeeper(address: string): Chain {
  const builder = getBuilder(address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before taking the Keeper Pass.', 403);
  }
  reconcileExpiry();
  const chain = activeBundle().chain;
  if (chain.status === 'dead' || chain.status === 'returned') {
    throw new StoreError('This Cell is no longer in play.', 409);
  }
  const current = chain.owners[chain.owners.length - 1];
  if (current.name === builder.displayName) return clone(chain);

  // Demo take must not strand the Cell behind a missing contribution.
  if (!currentKeeperHasContributed()) {
    publishArtifact({
      body: `${current.name} sealed a handoff stamp so the demo could continue.`,
      kind: 'stamp',
      place: current.city,
    });
  }

  return passChain(builder.displayName, current.city);
}

export { DEMO_KEEPER, DEMO_ADDRESS };
