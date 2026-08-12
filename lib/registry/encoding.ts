import { USERNAME_RULES } from "./config";
import type { Profile } from "./types";

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  if (value.length < USERNAME_RULES.minLength) return false;
  if (value.length > USERNAME_RULES.maxLength) return false;
  return USERNAME_RULES.pattern.test(value);
}

export function encodeUsername(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function decodeUsername(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function sanitizeProfile(profile: Profile): Profile {
  const cleaned: Profile = {
    name: profile.name.trim(),
  };

  if (profile.headline) cleaned.headline = profile.headline.trim();
  if (profile?.bio) cleaned.bio = profile.bio.trim();
  if (profile.avatarSporeId) cleaned.avatarSporeId = profile.avatarSporeId;
  if (profile.skills && profile.skills.length > 0) {
    cleaned.skills = profile.skills
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (profile.links) {
    const links: NonNullable<Profile["links"]> = {};
    if (profile.links.github) links.github = profile.links.github.trim();
    if (profile.links.x) links.x = profile.links.x.trim();
    if (profile.links.website) links.website = profile.links.website.trim();
    if (Object.keys(links).length > 0) cleaned.links = links;
  }
  if (profile.badgeSporeIds && profile.badgeSporeIds.length > 0) {
    cleaned.badgeSporeIds = [...profile.badgeSporeIds];
  }
  if (profile.proofBadgeSporeIds) {
    const entries = Object.entries(profile.proofBadgeSporeIds).filter(
      ([k, v]) => k.trim().length > 0 && v.trim().length > 0,
    );
    if (entries.length > 0) {
      cleaned.proofBadgeSporeIds = Object.fromEntries(entries);
    }
  }
  if (profile.projectSporeIds && profile.projectSporeIds.length > 0) {
    cleaned.projectSporeIds = [...profile.projectSporeIds];
  }
  if (profile.claimedProofBadges && profile.claimedProofBadges.length > 0) {
    cleaned.claimedProofBadges = profile.claimedProofBadges
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  }
  if (profile.verifiedProofBuilder) {
    cleaned.verifiedProofBuilder = true;
  }

  return cleaned;
}

export function encodeProfile(profile: Profile): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(sanitizeProfile(profile)));
}

export function decodeProfile(bytes: Uint8Array): Profile | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const parsed = JSON.parse(text) as Partial<Profile>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.name !== "string" || parsed.name.length === 0) {
      return null;
    }
    return sanitizeProfile(parsed as Profile);
  } catch {
    return null;
  }
}
