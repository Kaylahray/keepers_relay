export type Username = {
  username: string;
  ownerLockHash: string;
  cellOutpoint?: { txHash: string; index: string };
  createdAt: number;
};

export type ProfileLinks = {
  github?: string;
  x?: string;
  website?: string;
};

export type Profile = {
  name: string;
  headline?: string;
  bio?: string;
  skills?: string[];
  avatarSporeId?: string;
  links?: ProfileLinks;
  badgeSporeIds?: string[];
  proofBadgeSporeIds?: Record<string, string>;
  projectSporeIds?: string[];
  claimedProofBadges?: string[];
  verifiedProofBuilder?: boolean;
};

export type StoredProfile = Profile & {
  ownerLockHash: string;
  username?: string;
  cellOutpoint?: { txHash: string; index: string };
  createdAt: number;
  updatedAt: number;
};

export type UsernameAvailability =
  | { ok: true }
  | { ok: false; reason: "format" | "taken" | "wallet-required" };
