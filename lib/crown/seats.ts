export type CrownSeat = {
  address: string;
  displayName: string;
  joinedAt: number;
  lastSeenAt: number;
  bidOutPoint: { txHash: string; index: string } | null;
};
