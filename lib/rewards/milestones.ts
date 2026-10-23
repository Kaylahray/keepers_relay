export type RewardMilestone =
  | 'username_claimed'
  | 'profile_completed'
  | 'first_relay'
  | 'relay_streak_3';

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}
