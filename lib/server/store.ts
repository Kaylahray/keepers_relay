import type { Chain, JourneySummary, Owner, StakesConfig } from '@/types/chain';
import {
  normalizeStakes,
  stakesEntryAtHop,
  stakesPayoutShares,
  stakesWindowHoursAtHop,
} from '@/types/chain';
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
import type {
  HomeFeed,
  HomeNotice,
  HomeNoticeKind,
  HomeStreakCard,
  MarkDraft,
} from '@/types/retention';
import {
  CRITICAL_SAVE_POINTS,
  CRITICAL_WINDOW_MS,
  INVITE_CREDIT_POINTS,
  RESCUE_EXTEND_HOURS,
  RESCUE_POINTS,
} from '@/types/retention';
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
/** Pass windows offered on the launch page. Anything else falls back to 24h. */
const ALLOWED_WINDOW_HOURS = new Set([12, 24, 72, 168, 720, 1440]);
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
    rewardPoolCkb: 100,
    rewardPoolNote: 'CKB for keepers who help Window Relay come home.',
    nominatedNext: null,
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
    keeperPassStreak: 0,
    longestKeeperPassStreak: 0,
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
    pointsBalance: number;
  }> = [
    {
      address: 'ckt1qzdemo_nova_builder_01',
      username: 'ada_cells',
      displayName: 'Ada',
      characterId: 'nova',
      headline: 'New to CKB — learning Cells this week.',
      hoursAgo: 2,
      pointsBalance: 40,
    },
    {
      address: 'ckt1qzdemo_ember_builder_02',
      username: 'tolu_watch',
      displayName: 'Tolu',
      characterId: 'ember',
      headline: 'Holding the night watch for the builder group.',
      hoursAgo: 5,
      pointsBalance: 55,
    },
    {
      address: 'ckt1qzdemo_volt_builder_03',
      username: 'sora_scripts',
      displayName: 'Sora',
      characterId: 'volt',
      headline: 'Shipping scripts and answering newbie questions.',
      hoursAgo: 9,
      pointsBalance: 20,
    },
    {
      address: 'ckt1qzdemo_mira_builder_04',
      username: 'nia_archive',
      displayName: 'Nia',
      characterId: 'mira',
      headline: 'Documenting every handoff for the crew.',
      hoursAgo: 14,
      pointsBalance: 70,
    },
    {
      address: 'ckt1qzdemo_spark_builder_05',
      username: 'leo_onboard',
      displayName: 'Leo',
      characterId: 'spark',
      headline: 'Onboarding the next three builders into the group.',
      hoursAgo: 20,
      pointsBalance: 15,
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
      pointsBalance: seed.pointsBalance,
      claimedMilestones: ['username_claimed'],
      claimedBadgeIds: seed.pointsBalance >= 10 ? ['explorer'] : [],
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
  /** Soft in-app notices (critical / dead / home / pot). Not push yet. */
  notices: HomeNotice[];
  /** Draft marks keyed by `${address.toLowerCase()}:${journeyId}`. */
  draftMarks: Record<string, MarkDraft>;
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
    notices: [],
    draftMarks: {},
  };
}

function normalizePassport(p: PassportProfile): PassportProfile {
  return {
    ...p,
    keeperPassStreak: p.keeperPassStreak ?? 0,
    longestKeeperPassStreak: p.longestKeeperPassStreak ?? 0,
  };
}

function normalizeStore(next: StoreState): StoreState {
  const base = seedState();
  const journeys = next.journeys ?? base.journeys;
  for (const bundle of Object.values(journeys)) {
    if (bundle.chain.nominatedNext === undefined) {
      bundle.chain.nominatedNext = null;
    }
  }
  const passports: Record<string, PassportProfile> = {};
  for (const [key, passport] of Object.entries(next.passports ?? {})) {
    passports[key] = normalizePassport(passport);
  }
  return {
    ...base,
    ...next,
    /** Persisted snapshots may ship empty maps — keep seeded rooms/roster as defaults. */
    communities: { ...base.communities, ...(next.communities ?? {}) },
    builders: { ...base.builders, ...(next.builders ?? {}) },
    journeys,
    passports,
    passport: normalizePassport(next.passport ?? base.passport),
    notices: next.notices ?? [],
    draftMarks: next.draftMarks ?? {},
  };
}

// Communities + scoped streaks + handoff requests.
const globalStore = globalThis as typeof globalThis & {
  __keepersRelayStoreV8?: StoreState;
  __keepersRelayStoreV7?: StoreState;
};

function state(): StoreState {
  if (!globalStore.__keepersRelayStoreV8) {
    if (globalStore.__keepersRelayStoreV7) {
      globalStore.__keepersRelayStoreV8 = normalizeStore(globalStore.__keepersRelayStoreV7);
      delete globalStore.__keepersRelayStoreV7;
    } else {
      globalStore.__keepersRelayStoreV8 = seedState();
    }
  }
  return globalStore.__keepersRelayStoreV8;
}

/** Used by persistence layer — do not call from UI. */
export function exportStoreState(): StoreState {
  return clone(state());
}

/** Hydrate from Neon / local file on cold start. */
export function importStoreState(next: StoreState): void {
  globalStore.__keepersRelayStoreV8 = normalizeStore(next);
}

/** Overlay builders + communities from proper Neon tables (source of truth). */
export function applySocialState(social: {
  builders: Record<string, BuilderProfile>;
  communities: Record<string, Community>;
}): void {
  const s = state();
  if (Object.keys(social.builders).length > 0) {
    s.builders = { ...s.builders, ...social.builders };
  }
  for (const [id, incoming] of Object.entries(social.communities)) {
    const prev = s.communities[id];
    /** Never let an empty Neon member list erase an in-memory roster. */
    const memberAddresses =
      incoming.memberAddresses.length > 0
        ? incoming.memberAddresses
        : (prev?.memberAddresses ?? incoming.memberAddresses);
    s.communities[id] = {
      ...(prev ?? incoming),
      ...incoming,
      memberAddresses,
    };
  }
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
    chain.nominatedNext = null;
    onChainDied(chain);
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
    rewardPoolCkb: chain.rewardPoolCkb,
    expiresAt: chain.expiresAt,
    createdAt: chain.createdAt,
    coverImageUrl: resolveCover(chain.coverImageUrl, chain.creatureName),
    stakes: chain.stakes ?? null,
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
  initialCkb?: number;
  rewardPoolNote?: string;
  coverImageUrl?: string;
  cellOutPoint?: { txHash: string; index: string };
  onChainChainId?: string;
  genesisTxHash?: string;
  expiresAt?: string;
  stakes?: Partial<StakesConfig> | null;
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
  const windowHours = ALLOWED_WINDOW_HOURS.has(input.windowHours as number)
    ? (input.windowHours as number)
    : 24;
  const initialCkb = Math.max(0, Math.min(10_000, Math.floor(input.initialCkb ?? 0)));
  const stakes = input.stakes ? normalizeStakes(input.stakes) : undefined;

  if (initialCkb > 0 && builder.pointsBalance < initialCkb) {
    throw new StoreError(
      `Not enough balance to seed the pot (you have ${builder.pointsBalance}).`,
      409,
    );
  }
  if (stakes && initialCkb < 1) {
    throw new StoreError('A stakes streak needs a seed pot — stake at least 1 CKB.');
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
    rewardPoolCkb: initialCkb,
    rewardPoolNote:
      input.rewardPoolNote?.trim() ||
      (initialCkb > 0
        ? `Seeded by ${builder.displayName} for keepers who carry this Cell.`
        : undefined),
    nominatedNext: null,
    cellOutPoint: input.cellOutPoint,
    onChainChainId: input.onChainChainId,
    genesisTxHash: input.genesisTxHash,
    lastTxHash: input.genesisTxHash,
    stakes,
    stakeEntries: stakes
      ? [
          {
            address: builder.address,
            name: builder.displayName,
            hop: 0,
            paid: initialCkb,
            at: new Date(now).toISOString(),
            survived: false,
          },
        ]
      : undefined,
  };

  const artifact: LivingArtifact = {
    id: `relic_${id}`,
    title: `${creatureName} · living book`,
    prompt: seedPrompt,
    entries: [],
  };

  const s = state();
  if (initialCkb > 0) {
    builder.pointsBalance -= initialCkb;
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
  if (amount < 1) throw new StoreError('Add at least 1 CKB.');
  if (builder.pointsBalance < amount) {
    throw new StoreError(`Not enough balance (you have ${builder.pointsBalance}).`, 409);
  }

  const s = state();
  const journey = s.journeys[input.journeyId];
  if (!journey) throw new StoreError('Journey not found.', 404);
  if (journey.chain.status === 'dead') {
    throw new StoreError('Cannot fund a dead journey.', 409);
  }

  builder.pointsBalance -= amount;
  s.builders[builder.address] = builder;
  journey.chain.rewardPoolCkb += amount;
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
  const { listEventsForCommunity } = require('@/lib/server/events-store') as typeof import('@/lib/server/events-store');
  const communityEvents = listEventsForCommunity(community.id);
  const liveEventCount = communityEvents.filter(
    (e) => e.status === 'live' || e.status === 'ready' || e.status === 'registration',
  ).length;
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    blurb: community.blurb,
    coverImageUrl: resolveCover(community.coverImageUrl, community.name),
    featured: community.featured,
    memberCount: community.memberAddresses.length,
    liveEventCount,
    creatorName: community.creatorName,
    creatorAddress: community.creatorAddress,
    createdAt: community.createdAt,
    isMember: viewerAddress
      ? community.memberAddresses.some(
          (a) => a.toLowerCase() === viewerAddress.toLowerCase(),
        )
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
  events: import('@/types/event').EventSummary[];
  members: import('@/types/community').CommunityMember[];
} {
  const s = state();
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new StoreError('Community not found.', 404);

  const { listEventsForCommunity } = require('@/lib/server/events-store') as typeof import('@/lib/server/events-store');
  const events = listEventsForCommunity(community.id);

  const members = community.memberAddresses.map((address) => {
    const builder = s.builders[address];
    return {
      address,
      displayName: builder?.displayName ?? address.slice(0, 10),
      username: builder?.username ?? '',
      headline: builder?.headline,
      avatarUrl: null,
      characterId: builder?.characterId ?? null,
      role: (address === community.creatorAddress ? 'creator' : 'member') as
        | 'creator'
        | 'member',
      eventsPlayed: 0,
      wins: 0,
    };
  });

  return {
    community: toCommunitySummary(community, viewerAddress),
    events,
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

export function joinCommunity(
  slug: string,
  address: string,
  invitedByAddress?: string | null,
): CommunitySummary {
  const builder = getBuilder(address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before joining a community.', 403);
  }
  const s = state();
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new StoreError('Community not found.', 404);
  const already = community.memberAddresses.some(
    (a) => a.toLowerCase() === address.toLowerCase(),
  );
  if (!already) {
    community.memberAddresses.push(address);
  }
  const inviter = invitedByAddress?.trim();
  if (
    inviter &&
    inviter.toLowerCase() !== address.toLowerCase() &&
    !builder.invitedByAddress &&
    s.builders[inviter]
  ) {
    builder.invitedByAddress = inviter;
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
    artifactRoot: journey.chain.artifactRoot,
    artifactRootOnChain: Boolean(input.cellOutPoint),
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

/** Community creator can mint passport points to a member (app layer). */
export function grantCommunityPoints(input: {
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
    throw new StoreError('Only the community creator can grant points here.', 403);
  }

  const amount = Math.floor(input.amount);
  if (amount < 1 || amount > 10_000) {
    throw new StoreError('Grant between 1 and 10,000 points.');
  }

  const recipient = getBuilder(input.recipientAddress);
  if (!recipient?.onboarded) {
    throw new StoreError('Recipient must be an onboarded builder.', 404);
  }
  if (!community.memberAddresses.includes(recipient.address)) {
    throw new StoreError('Recipient must be a member of this community.', 403);
  }

  recipient.pointsBalance += amount;
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
  /** When provided, update the specific journey instead of relying on activeJourneyId. */
  journeyId?: string;
  /** Recover local state after reload if the snapshot missed this journey. */
  chainSnapshot?: Chain;
  artifactSnapshot?: LivingArtifact | null;
  recipientAddress?: string;
  cellOutPoint?: { txHash: string; index: string };
  txHash?: string;
  expiresAt?: string;
  artifactRoot?: string;
  artifactRootOnChain?: boolean;
};

export function passChain(recipient: string, city?: string, onChain?: PassChainOnChain): Chain {
  const s = state();
  if (onChain?.journeyId) {
    let journey = s.journeys[onChain.journeyId];
    if (!journey && onChain.chainSnapshot) {
      const relicId = `relic_${onChain.chainSnapshot.id}`;
      // The client artifact cache is global, so only trust it when it belongs here.
      const snapshotFits = onChain.artifactSnapshot?.id === relicId;
      journey = {
        chain: clone(onChain.chainSnapshot),
        artifact: snapshotFits
          ? clone(onChain.artifactSnapshot!)
          : {
              id: relicId,
              title: `${onChain.chainSnapshot.creatureName} · living book`,
              prompt: onChain.chainSnapshot.seedPrompt,
              entries: [],
            },
      };
      s.journeys[onChain.journeyId] = journey;
    }
    if (!journey) throw new StoreError('Streak not found.', 404);
    s.activeJourneyId = journey.chain.id;
    reconcileJourneyClock(journey.chain);
  } else {
    reconcileExpiry();
  }
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
  const msLeftBeforePass = new Date(chain.expiresAt).getTime() - now;
  const wasCritical = msLeftBeforePass > 0 && msLeftBeforePass <= CRITICAL_WINDOW_MS;

  // A txHash means the handoff already settled on CKB: the type script accepted
  // it and the Cell has moved. These guards must run before signing, not after —
  // throwing now would only leave the mirror behind the chain.
  const settledOnChain = Boolean(onChain?.txHash);

  // This runs after the handoff settles, so a resubmit can arrive carrying a
  // transaction already recorded. Appending again would list the same Keeper twice.
  if (settledOnChain && chain.lastTxHash === onChain!.txHash) {
    return clone(chain);
  }

  if (!settledOnChain && !currentKeeperHasContributed()) {
    throw new StoreError('Leave your mark first, then pass.', 409);
  }

  if (!settledOnChain && name.toLowerCase() === current.name.toLowerCase()) {
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

  if (!settledOnChain && chain.mode === 'return_home') {
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

  const recipientAddress = resolved?.address || onChain?.recipientAddress;
  const nextHop = chain.owners.length;

  // Stakes mode: the incoming Keeper buys their seat, and the outgoing Keeper
  // banks theirs by passing in time. Whoever is holding when the clock runs out
  // never gets marked, so their stake stays in the pot for everyone else.
  if (chain.stakes) {
    const cost = stakesEntryAtHop(chain.stakes, nextHop);
    let paid = 0;
    const recipientBuilder = recipientAddress ? getBuilder(recipientAddress) : null;
    if (recipientBuilder) {
      if (recipientBuilder.pointsBalance < cost) {
        throw new StoreError(
          `${recipientBuilder.displayName} needs ${cost} CKB to take this stake (they have ${recipientBuilder.pointsBalance}).`,
          409,
        );
      }
      creditBuilder(recipientBuilder.address, -cost);
      paid = cost;
      chain.rewardPoolCkb += cost;
      pushNotice(recipientBuilder.address, 'stake_entry', {
        journeyId: chain.id,
        title: `−${cost} CKB · Keeper #${nextHop + 1} on ${chain.creatureName}`,
        body: 'Pass it on before your window closes to keep your share of the pot.',
      });
    }
    chain.stakeEntries = [
      ...(chain.stakeEntries ?? []),
      {
        address: recipientAddress ?? '',
        name,
        hop: nextHop,
        paid,
        at: new Date(now).toISOString(),
        survived: false,
      },
    ];
    const outgoing = chain.stakeEntries.find((entry) => entry.hop === nextHop - 1);
    if (outgoing) outgoing.survived = true;
  }

  current.passedAt = new Date(now).toISOString();
  if (place && !current.city) current.city = place;

  chain.owners = [
    ...chain.owners,
    makeOwner(name, now, null, place || undefined, null, recipientAddress),
  ];
  const nextWindowHours = chain.stakes
    ? stakesWindowHoursAtHop(chain.stakes, chain.windowHours, nextHop)
    : chain.windowHours;
  chain.expiresAt =
    onChain?.expiresAt ?? new Date(now + hours(nextWindowHours)).toISOString();
  if (onChain?.cellOutPoint) chain.cellOutPoint = onChain.cellOutPoint;
  if (onChain?.txHash) chain.lastTxHash = onChain.txHash;
  if (onChain?.artifactRoot) {
    chain.artifactRoot = onChain.artifactRoot;
    chain.artifactRootOnChain = onChain.artifactRootOnChain ?? true;
  } else if (onChain?.cellOutPoint && chain.artifactRoot) {
    chain.artifactRootOnChain = true;
  }

  chain.nominatedNext = null;

  if (chain.mode === 'return_home' && isCreator) {
    chain.status = 'returned';
    chain.returnedAt = new Date(now).toISOString();
    chain.expiresAt = new Date(now + hours(24 * 365)).toISOString();
    distributeReturnHomePot(chain);
  }

  if (current.name === DEMO_KEEPER) {
    s.passport.keeperTurns += 1;
  }

  if (current.address) {
    bumpKeeperPassStreak(current.address);
    if (wasCritical) {
      awardCriticalSave(current.address, chain);
    }
  }

  if (recipientAddress) {
    pushNotice(recipientAddress, 'incoming', {
      journeyId: chain.id,
      title: `${chain.creatureName} is yours`,
      body: `You hold it now. Leave a mark before the window ends.`,
    });
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
  address?: string;
  journeyId?: string;
  imageUrl?: string;
  contentHash?: string;
  artifactRoot?: string;
  cellOutPoint?: { txHash: string; index: string };
  txHash?: string;
  artifactRootOnChain?: boolean;
}): LivingArtifact {
  const s = state();
  if (input.journeyId && s.journeys[input.journeyId]) {
    s.activeJourneyId = input.journeyId;
  }
  const journey = activeBundle();
  const imageUrl = input.imageUrl?.trim() || undefined;
  const body = input.body.trim() || (imageUrl ? 'Image sealed' : '');
  if (!body && !imageUrl) throw new StoreError('Write a note or add an image before sealing.');
  if (body.length > 180) throw new StoreError('Keep the entry under 180 characters.');
  if (imageUrl && imageUrl.length > 400_000) {
    throw new StoreError('Keep the image under ~300KB after compression.');
  }

  const builder = input.address ? getBuilder(input.address) : null;
  const keeper =
    builder?.displayName ||
    getCurrentKeeper() ||
    DEMO_KEEPER;
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
        imageUrl,
        contentHash: input.contentHash || input.artifactRoot,
      },
    ],
  };

  if (input.artifactRoot) {
    journey.chain.artifactRoot = input.artifactRoot;
    journey.chain.artifactRootOnChain = Boolean(input.artifactRootOnChain);
  }
  if (input.cellOutPoint) {
    journey.chain.cellOutPoint = input.cellOutPoint;
    journey.chain.lastTxHash = input.txHash ?? input.cellOutPoint.txHash;
    journey.chain.artifactRootOnChain = true;
  } else if (input.txHash) {
    journey.chain.lastTxHash = input.txHash;
  }

  const isCurrentHolder =
    Boolean(current) &&
    ((input.address &&
      current!.address &&
      current!.address.toLowerCase() === input.address.toLowerCase()) ||
      current!.name.toLowerCase() === keeper.toLowerCase());

  if (current && isCurrentHolder) {
    current.contributionId = entryId;
    if (input.address) current.address = input.address;
    if (place && !current.city) current.city = place;
  }

  if (input.address) {
    const passport = getPassport(input.address);
    const firstMark = passport.artifactCount === 0;
    passport.artifactCount += 1;
    passport.contributionXp += 100;
    if (!passport.badgeLabels.includes('Living archive')) {
      passport.badgeLabels = [...passport.badgeLabels, 'Living archive'];
    }
    s.passports[input.address] = passport;
    s.passport = passport;
    clearDraftMark(input.address, journey.chain.id);
    if (firstMark) {
      maybeAwardInviteCredit(input.address, journey.chain);
    }
  } else {
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
    keeperPassStreak: 0,
    longestKeeperPassStreak: 0,
  };
}

export function getPassport(address?: string): PassportProfile {
  const s = state();
  if (!address?.trim()) {
    return emptyPassport('', 'Guest', null);
  }

  const key = address.trim();
  const existing = s.passports[key];
  if (existing) {
    return clone(existing);
  }

  const builder = s.builders[key];
  if (builder) {
    const passport = emptyPassport(key, builder.displayName, builder.characterId);
    s.passports[key] = passport;
    return clone(passport);
  }

  return emptyPassport(key, key.slice(0, 12), null);
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
      builder.onboarded &&
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
    pointsBalance: previous?.pointsBalance ?? 0,
    claimedMilestones: previous?.claimedMilestones ?? [],
    claimedBadgeIds: previous?.claimedBadgeIds ?? [],
    invitedByAddress: previous?.invitedByAddress ?? null,
    lastRescueAt: previous?.lastRescueAt ?? null,
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

/** Drop roster claim after the username Cell is burned. */
export function releaseBuilderHandle(address: string): BuilderProfile | null {
  const s = state();
  const builder = s.builders[address];
  if (!builder) return null;
  builder.onboarded = false;
  builder.username = '';
  builder.lastSeenAt = new Date().toISOString();
  return clone(builder);
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
  builder.pointsBalance += REWARD_POINTS[milestone];

  const passport = s.passports[address] ?? emptyPassport(address, builder.displayName, builder.characterId);
  passport.contributionXp = builder.pointsBalance;
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

  builder.pointsBalance += xp;
  const passport = getPassport(address);
  passport.contributionXp = builder.pointsBalance;
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
  if (builder.pointsBalance < badge.requiredPoints) {
    throw new StoreError(`Need ${badge.requiredPoints} pts to unlock ${badge.name}.`, 409);
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

/**
 * Soft rescue: non-holder extends a critical Cell's clock once per day.
 * App-layer for now — later an ESO update path.
 */
export function rescueChain(input: {
  address: string;
  journeyId: string;
}): Chain {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before rescuing a Cell.', 403);
  }

  const s = state();
  const journey = s.journeys[input.journeyId];
  if (!journey) throw new StoreError('Streak not found.', 404);
  reconcileJourneyClock(journey.chain);
  const chain = journey.chain;

  if (chain.status !== 'alive') {
    throw new StoreError('Only a live Cell can be rescued.', 409);
  }

  const msLeft = new Date(chain.expiresAt).getTime() - Date.now();
  if (msLeft > CRITICAL_WINDOW_MS || msLeft <= 0) {
    throw new StoreError('Rescue only works when under two hours remain.', 409);
  }

  const current = chain.owners[chain.owners.length - 1];
  const isHolder =
    (current?.address &&
      current.address.toLowerCase() === builder.address.toLowerCase()) ||
    current?.name.toLowerCase() === builder.displayName.toLowerCase();
  if (isHolder) {
    throw new StoreError('You already hold it — leave a mark and pass.', 409);
  }

  const community = s.communities[chain.communityId];
  if (!community?.memberAddresses.includes(builder.address)) {
    throw new StoreError('Join the community before rescuing this Cell.', 403);
  }

  if (builder.lastRescueAt) {
    const since = Date.now() - new Date(builder.lastRescueAt).getTime();
    if (since < hours(24)) {
      throw new StoreError('You already used your rescue today. Come back tomorrow.', 409);
    }
  }

  const now = Date.now();
  chain.expiresAt = new Date(now + hours(RESCUE_EXTEND_HOURS)).toISOString();
  chain.rescueCount = (chain.rescueCount ?? 0) + 1;
  chain.lastRescuedAt = new Date(now).toISOString();
  chain.lastRescuedBy = builder.displayName;
  builder.lastRescueAt = new Date(now).toISOString();
  builder.pointsBalance += RESCUE_POINTS;

  pushNotice(builder.address, 'rescued', {
    journeyId: chain.id,
    title: `+${RESCUE_POINTS} pts · you saved ${chain.creatureName}`,
    body: `Clock extended by ${RESCUE_EXTEND_HOURS}h. Points for now — on-chain claim later.`,
  });

  for (const address of touchedAddresses(chain)) {
    if (address.toLowerCase() === builder.address.toLowerCase()) continue;
    pushNotice(address, 'rescued', {
      journeyId: chain.id,
      title: `${chain.creatureName} was rescued`,
      body: `${builder.displayName} pulled it back from under two hours. New window: ${RESCUE_EXTEND_HOURS}h.`,
    });
  }

  if (current?.address) {
    pushNotice(current.address, 'incoming', {
      journeyId: chain.id,
      title: `${chain.creatureName} got more time`,
      body: 'Someone rescued your hold. Leave a mark and pass before this window dies too.',
    });
  }

  s.activeJourneyId = chain.id;
  return clone(chain);
}

/* ------------------------------------------------------------- retention */

function draftKey(address: string, journeyId: string): string {
  return `${address.trim().toLowerCase()}:${journeyId}`;
}

function ensurePassportMutable(address: string): PassportProfile {
  const s = state();
  const key = address.trim();
  if (!s.passports[key]) {
    const builder = s.builders[key];
    s.passports[key] = emptyPassport(
      key,
      builder?.displayName ?? key.slice(0, 12),
      builder?.characterId ?? null,
    );
  }
  s.passports[key] = normalizePassport(s.passports[key]);
  return s.passports[key];
}

function pushNotice(
  address: string,
  kind: HomeNoticeKind,
  input: { journeyId?: string; title: string; body: string },
): void {
  if (!address.trim()) return;
  const s = state();
  const notice: HomeNotice = {
    id: `notice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    address: address.trim(),
    kind,
    journeyId: input.journeyId,
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
    read: false,
  };
  s.notices.unshift(notice);
  if (s.notices.length > 400) s.notices.length = 400;
}

/**
 * `getBuilder` hands back a clone, so a bare `builder.pointsBalance += n` is lost.
 * Every points award has to go through here.
 */
function creditBuilder(address: string, amount: number): BuilderProfile | null {
  if (!address.trim() || amount === 0) return null;
  const s = state();
  const builder = s.builders[address];
  if (!builder) return null;
  builder.pointsBalance = Math.max(0, builder.pointsBalance + amount);
  s.builders[address] = builder;
  return clone(builder);
}

function touchedAddresses(chain: Chain): string[] {
  const set = new Set<string>();
  if (chain.creatorAddress) set.add(chain.creatorAddress);
  for (const owner of chain.owners) {
    if (owner.address) set.add(owner.address);
  }
  return [...set];
}

function onChainDied(chain: Chain): void {
  if (chain.stakes) settleStakesOnDeath(chain);
  for (const address of touchedAddresses(chain)) {
    const passport = ensurePassportMutable(address);
    if (passport.keeperPassStreak > 0) {
      passport.keeperPassStreak = 0;
      pushNotice(address, 'streak_broken', {
        journeyId: chain.id,
        title: `${chain.creatureName} died`,
        body: 'Your unbroken pass streak reset. A Cell you touched ran out of time.',
      });
    } else {
      pushNotice(address, 'dead', {
        journeyId: chain.id,
        title: `${chain.creatureName} died`,
        body: 'A Cell on your watchlist is locked forever.',
      });
    }
  }
}

function bumpKeeperPassStreak(address: string): void {
  const passport = ensurePassportMutable(address);
  passport.keeperPassStreak += 1;
  passport.keeperTurns += 1;
  if (passport.keeperPassStreak > passport.longestKeeperPassStreak) {
    passport.longestKeeperPassStreak = passport.keeperPassStreak;
  }
  const s = state();
  if (s.passport.address === address) s.passport = passport;
}

function awardCriticalSave(address: string, chain: Chain): void {
  if (!creditBuilder(address, CRITICAL_SAVE_POINTS)) return;
  pushNotice(address, 'critical_save', {
    journeyId: chain.id,
    title: `+${CRITICAL_SAVE_POINTS} pts · critical save`,
    body: `You passed ${chain.creatureName} with under two hours left. Points for now — on-chain claim later.`,
  });
}

/**
 * Pay a stakes pot out to the Keepers who passed in time, weighted so the later
 * you survived the bigger your cut. Whoever is still holding gets nothing.
 */
function payOutStakesPot(chain: Chain, reason: 'returned' | 'dead'): void {
  const pot = Math.max(0, Math.floor(chain.rewardPoolCkb));
  const survivors = (chain.stakeEntries ?? []).filter(
    (entry) => entry.survived && entry.address.trim(),
  );
  chain.rewardPoolCkb = 0;
  if (pot <= 0 || survivors.length === 0) return;

  const headline =
    reason === 'returned'
      ? `${chain.creatureName} came home`
      : `${chain.creatureName} died`;
  for (const share of stakesPayoutShares(pot, survivors)) {
    if (share.amount <= 0) continue;
    if (!creditBuilder(share.address, share.amount)) continue;
    pushNotice(share.address, 'pot_share', {
      journeyId: chain.id,
      title: `+${share.amount} CKB · ${headline}`,
      body:
        reason === 'returned'
          ? 'Every paid seat shared the pot when the Cell made it home.'
          : 'You passed in time, so you kept your seat in the pot. Later survivors took the bigger cut.',
    });
  }
}

/** The Cell ran out of time: whoever was holding it forfeits their stake. */
function settleStakesOnDeath(chain: Chain): void {
  const holder = chain.owners[chain.owners.length - 1];
  const dropped = (chain.stakeEntries ?? []).find(
    (entry) => entry.hop === chain.owners.length - 1,
  );
  if (dropped) dropped.survived = false;
  if (dropped?.address && dropped.paid > 0) {
    pushNotice(dropped.address, 'stake_forfeit', {
      journeyId: chain.id,
      title: `−${dropped.paid} CKB · you dropped ${chain.creatureName}`,
      body: `The clock ran out while ${holder?.name ?? 'you'} held it. Your stake stayed in the pot for the Keepers who passed in time.`,
    });
  }
  payOutStakesPot(chain, 'dead');
}

function distributeReturnHomePot(chain: Chain): void {
  if (chain.stakes && chain.stakeEntries?.length) {
    // Completing beats dying: every paid seat counts as a survivor.
    for (const entry of chain.stakeEntries) entry.survived = true;
    payOutStakesPot(chain, 'returned');
    return;
  }

  const pot = Math.max(0, Math.floor(chain.rewardPoolCkb));
  if (pot <= 0) {
    for (const address of touchedAddresses(chain)) {
      pushNotice(address, 'returned', {
        journeyId: chain.id,
        title: `${chain.creatureName} came home`,
        body: 'The journey sealed. No CKB was in the pot.',
      });
    }
    return;
  }

  const recipients = [
    ...new Set(
      chain.owners
        .map((o) => o.address)
        .filter((a): a is string => Boolean(a)),
    ),
  ];
  if (recipients.length === 0) {
    chain.rewardPoolCkb = 0;
    return;
  }

  const share = Math.floor(pot / recipients.length);
  let remainder = pot - share * recipients.length;
  for (const address of recipients) {
    const builder = getBuilder(address);
    if (!builder) continue;
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    const gained = share + extra;
    creditBuilder(address, gained);
    pushNotice(address, 'pot_share', {
      journeyId: chain.id,
      title: `+${gained} CKB · ${chain.creatureName} home`,
      body: 'Split from the soft pot. Real sUDT claim comes when the treasury env is wired.',
    });
  }
  chain.rewardPoolCkb = 0;

  if (chain.creatorAddress && !recipients.includes(chain.creatorAddress)) {
    pushNotice(chain.creatorAddress, 'returned', {
      journeyId: chain.id,
      title: `${chain.creatureName} came home`,
      body: 'Your streak made it back. The pot went to the Keepers who carried it.',
    });
  }
}

function maybeAwardInviteCredit(newKeeperAddress: string, chain: Chain): void {
  const builder = getBuilder(newKeeperAddress);
  const inviter = builder?.invitedByAddress;
  if (!inviter || inviter.toLowerCase() === newKeeperAddress.toLowerCase()) return;
  if (!creditBuilder(inviter, INVITE_CREDIT_POINTS)) return;
  pushNotice(inviter, 'invite_credit', {
    journeyId: chain.id,
    title: `+${INVITE_CREDIT_POINTS} pts · invite credit`,
    body: `@${builder.username || builder.displayName} sealed their first mark. Points for bringing them in.`,
  });
}

function maybeEmitCriticalNotices(): void {
  const s = state();
  const now = Date.now();
  for (const journey of Object.values(s.journeys)) {
    const chain = journey.chain;
    reconcileJourneyClock(chain);
    if (chain.status !== 'alive') continue;
    const ms = new Date(chain.expiresAt).getTime() - now;
    if (ms <= 0 || ms > CRITICAL_WINDOW_MS) continue;
    for (const address of touchedAddresses(chain)) {
      const recent = s.notices.find(
        (n) =>
          n.address === address &&
          n.kind === 'critical' &&
          n.journeyId === chain.id &&
          now - new Date(n.createdAt).getTime() < CRITICAL_WINDOW_MS,
      );
      if (recent) continue;
      pushNotice(address, 'critical', {
        journeyId: chain.id,
        title: `${chain.creatureName} is critical`,
        body: 'Under two hours left. A Cell you touched needs a pass.',
      });
    }
  }
}

function toHomeCard(
  chain: Chain,
  tone: HomeStreakCard['tone'],
  extra?: Partial<HomeStreakCard>,
): HomeStreakCard {
  const msRemaining = new Date(chain.expiresAt).getTime() - Date.now();
  return {
    ...toSummary(chain),
    tone,
    msRemaining,
    critical: chain.status === 'alive' && msRemaining > 0 && msRemaining <= CRITICAL_WINDOW_MS,
    ...extra,
  };
}

function viewerHeldOrCreated(chain: Chain, address: string, displayName: string): boolean {
  const key = address.toLowerCase();
  if (chain.creatorAddress?.toLowerCase() === key) return true;
  return chain.owners.some(
    (o) =>
      o.address?.toLowerCase() === key ||
      o.name.toLowerCase() === displayName.toLowerCase(),
  );
}

export function getHomeFeed(address: string): HomeFeed {
  const builder = getBuilder(address);
  if (!builder) {
    throw new StoreError('Connect and claim an @handle first.', 403);
  }

  maybeEmitCriticalNotices();
  const s = state();
  const passport = ensurePassportMutable(address);
  const key = address.toLowerCase();
  const holding: HomeStreakCard[] = [];
  const incoming: HomeStreakCard[] = [];
  const created: HomeStreakCard[] = [];
  const watching: HomeStreakCard[] = [];
  const seen = new Set<string>();

  for (const journey of Object.values(s.journeys)) {
    reconcileJourneyClock(journey.chain);
    const chain = journey.chain;
    const current = chain.owners[chain.owners.length - 1];
    const isHolder =
      chain.status === 'alive' &&
      ((current?.address && current.address.toLowerCase() === key) ||
        current?.name.toLowerCase() === builder.displayName.toLowerCase());
    const isCreator = chain.creatorAddress?.toLowerCase() === key;
    const draft = s.draftMarks[draftKey(address, chain.id)];
    const needsMark = Boolean(isHolder && !current?.contributionId);
    const nominated =
      chain.status === 'alive' &&
      chain.nominatedNext?.address.toLowerCase() === key &&
      !isHolder;
    const pendingRequest = s.handoffRequests.some(
      (r) =>
        r.journeyId === chain.id &&
        r.requesterAddress.toLowerCase() === key &&
        r.status === 'pending',
    );

    if (isHolder) {
      holding.push(
        toHomeCard(chain, 'holding', {
          needsMark,
          hasDraft: Boolean(draft),
        }),
      );
      seen.add(chain.id);
      continue;
    }

    if (nominated || pendingRequest) {
      incoming.push(
        toHomeCard(chain, 'incoming', {
          nominated,
          pendingRequest,
          hasDraft: Boolean(draft),
        }),
      );
      seen.add(chain.id);
      continue;
    }

    if (isCreator) {
      created.push(toHomeCard(chain, 'created', { hasDraft: Boolean(draft) }));
      seen.add(chain.id);
      continue;
    }

    if (viewerHeldOrCreated(chain, address, builder.displayName)) {
      watching.push(toHomeCard(chain, 'watching', { hasDraft: Boolean(draft) }));
      seen.add(chain.id);
    }
  }

  const byUrgency = (a: HomeStreakCard, b: HomeStreakCard) => {
    if (a.status === 'alive' && b.status !== 'alive') return -1;
    if (b.status === 'alive' && a.status !== 'alive') return 1;
    return a.msRemaining - b.msRemaining;
  };

  holding.sort(byUrgency);
  incoming.sort(byUrgency);
  created.sort(byUrgency);
  watching.sort(byUrgency);

  const notices = s.notices
    .filter((n) => n.address.toLowerCase() === key)
    .slice(0, 20);

  void seen;

  return {
    address: builder.address,
    displayName: builder.displayName,
    username: builder.username,
    keeperPassStreak: passport.keeperPassStreak,
    longestKeeperPassStreak: passport.longestKeeperPassStreak,
    pointsBalance: builder.pointsBalance,
    holding,
    incoming,
    created,
    watching,
    notices: clone(notices),
    unreadNoticeCount: notices.filter((n) => !n.read).length,
  };
}

export function markHomeNoticesRead(address: string): HomeFeed {
  const s = state();
  const key = address.trim().toLowerCase();
  for (const notice of s.notices) {
    if (notice.address.toLowerCase() === key) notice.read = true;
  }
  return getHomeFeed(address);
}

export function saveDraftMark(input: {
  address: string;
  journeyId: string;
  body?: string;
  kind?: ArtifactKind;
  place?: string;
  imageUrl?: string;
}): MarkDraft {
  const builder = getBuilder(input.address);
  if (!builder?.onboarded) {
    throw new StoreError('Finish onboarding before drafting a mark.', 403);
  }
  const journey = state().journeys[input.journeyId];
  if (!journey) throw new StoreError('Streak not found.', 404);

  const draft: MarkDraft = {
    journeyId: input.journeyId,
    address: builder.address,
    body: (input.body ?? '').trim().slice(0, 180),
    kind: input.kind ?? 'message',
    place: input.place?.trim() || undefined,
    imageUrl: input.imageUrl?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  state().draftMarks[draftKey(builder.address, input.journeyId)] = draft;
  return clone(draft);
}

export function getDraftMark(address: string, journeyId: string): MarkDraft | null {
  const draft = state().draftMarks[draftKey(address, journeyId)];
  return draft ? clone(draft) : null;
}

export function clearDraftMark(address: string, journeyId: string): void {
  delete state().draftMarks[draftKey(address, journeyId)];
}

/** Current holder soft-promises the Cell to a community member. */
export function nominateNextKeeper(input: {
  address: string;
  journeyId: string;
  nomineeAddress: string;
}): Chain {
  const holder = getBuilder(input.address);
  const nominee = getBuilder(input.nomineeAddress);
  if (!holder?.onboarded) throw new StoreError('Finish onboarding first.', 403);
  if (!nominee?.onboarded) throw new StoreError('Nominee must be an onboarded Keeper.', 404);

  const s = state();
  const journey = s.journeys[input.journeyId];
  if (!journey) throw new StoreError('Streak not found.', 404);
  reconcileJourneyClock(journey.chain);
  if (journey.chain.status !== 'alive') {
    throw new StoreError('This streak is no longer open.', 409);
  }

  const community = s.communities[journey.chain.communityId];
  if (!community?.memberAddresses.includes(nominee.address)) {
    throw new StoreError('Nominee must be in this community.', 403);
  }

  const current = journey.chain.owners[journey.chain.owners.length - 1];
  const isHolder =
    (current?.address && current.address.toLowerCase() === holder.address.toLowerCase()) ||
    current?.name.toLowerCase() === holder.displayName.toLowerCase();
  if (!isHolder) {
    throw new StoreError('Only the current holder can nominate the next Keeper.', 403);
  }
  if (nominee.address.toLowerCase() === holder.address.toLowerCase()) {
    throw new StoreError('Nominate someone else — you already hold it.');
  }

  journey.chain.nominatedNext = {
    address: nominee.address,
    name: nominee.displayName,
    nominatedAt: new Date().toISOString(),
  };
  pushNotice(nominee.address, 'incoming', {
    journeyId: journey.chain.id,
    title: `${journey.chain.creatureName} is heading to you`,
    body: `${holder.displayName} nominated you. Draft your mark while you wait.`,
  });
  return clone(journey.chain);
}

export { DEMO_KEEPER, DEMO_ADDRESS };
