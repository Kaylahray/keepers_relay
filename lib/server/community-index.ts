/**
 * In-memory community id → {name, slug} for sync event summaries.
 * Refreshed from social-service after hydrate / social loads.
 */

type CommunityMeta = { name: string; slug: string };

let index: Record<string, CommunityMeta> = {};

export function setCommunityIndex(next: Record<string, CommunityMeta>): void {
  index = next;
}

export function refreshCommunityIndexFromMap(
  communities: Record<string, { name: string; slug: string }>,
): void {
  const next: Record<string, CommunityMeta> = {};
  for (const [id, c] of Object.entries(communities)) {
    next[id] = { name: c.name, slug: c.slug };
  }
  index = next;
}

export function resolveCommunityName(communityId?: string | null): string | null {
  if (!communityId) return null;
  return index[communityId]?.name ?? null;
}

export function resolveCommunitySlug(communityId?: string | null): string | null {
  if (!communityId) return null;
  return index[communityId]?.slug ?? null;
}
