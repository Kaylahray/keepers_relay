export type RewardMilestone =
  | 'username_claimed'
  | 'profile_completed'
  | 'first_relay'
  | 'relay_streak_3';

export const REWARD_POINTS: Record<RewardMilestone, number> = {
  username_claimed: 10,
  profile_completed: 30,
  first_relay: 40,
  relay_streak_3: 25,
};

export const REWARD_LABELS: Record<RewardMilestone, string> = {
  username_claimed: 'Username claimed',
  profile_completed: 'Profile completed (avatar Spore)',
  first_relay: 'First Relay claimed',
  relay_streak_3: '3-day Relay streak',
};

export const USERNAME_RULES = {
  min: 3,
  max: 24,
  pattern: /^[a-z0-9_]+$/,
};

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (username.length < USERNAME_RULES.min) {
    return `At least ${USERNAME_RULES.min} characters.`;
  }
  if (username.length > USERNAME_RULES.max) {
    return `Keep it under ${USERNAME_RULES.max} characters.`;
  }
  if (!USERNAME_RULES.pattern.test(username)) {
    return 'Use lowercase letters, numbers, and underscores only.';
  }
  return null;
}

export type ProofBadge = {
  id: string;
  name: string;
  requiredProof: number;
  accent: string;
};

export const KEEPER_BADGES: ProofBadge[] = [
  { id: 'explorer', name: 'Explorer', requiredProof: 10, accent: '#d6ff00' },
  { id: 'builder', name: 'Builder', requiredProof: 20, accent: '#ffe454' },
  { id: 'specialist', name: 'Specialist', requiredProof: 35, accent: '#224cff' },
  { id: 'pro', name: 'Pro', requiredProof: 50, accent: '#ff4cbd' },
  { id: 'elite', name: 'Elite', requiredProof: 75, accent: '#ff6b2d' },
  { id: 'legend', name: 'Legend', requiredProof: 100, accent: '#d6ff00' },
];

export function getUnlockableBadges(
  proofBalance: number,
  claimedBadgeIds: string[],
): ProofBadge[] {
  return KEEPER_BADGES.filter(
    (badge) =>
      !claimedBadgeIds.includes(badge.id) && proofBalance >= badge.requiredProof,
  );
}
