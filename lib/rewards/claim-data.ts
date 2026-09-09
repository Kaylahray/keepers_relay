import * as ccc from '@ckb-ccc/core';
import { decodeSudtAmount, encodeSudtAmount } from '@/lib/token/sudt-encoding';
import { REWARD_MILESTONES, type RewardMilestone } from './milestones';

export const CLAIM_DATA_LENGTH = 97;

export type DecodedRewardClaimPayload = {
  recipientLockHash: string;
  amount: bigint;
  eventIdHash: string;
  event?: RewardMilestone;
  nonce: string;
};

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(ccc.bytesFrom(hex));
}

function bytesToHex(bytes: Uint8Array): string {
  return ccc.hexFrom(bytes);
}

export function rewardEventHash(event: RewardMilestone): string {
  return ccc.hashCkb(new TextEncoder().encode(event));
}

function eventFromHash(hash: string): RewardMilestone | undefined {
  const h = hash.trim().toLowerCase();
  return REWARD_MILESTONES.find((e) => rewardEventHash(e).toLowerCase() === h);
}

export function encodeRewardClaimData(params: {
  recipientLockHash: string;
  amount: bigint;
  event: RewardMilestone;
  nonce: Uint8Array;
}): Uint8Array {
  if (params.nonce.length !== 16) {
    throw new Error('Reward claim nonce must be exactly 16 bytes.');
  }

  const recipient = hexToBytes(params.recipientLockHash);
  if (recipient.length !== 32) {
    throw new Error('Reward claim recipient lock hash must be 32 bytes.');
  }

  const eventHash = hexToBytes(rewardEventHash(params.event));
  const out = new Uint8Array(CLAIM_DATA_LENGTH);
  out[0] = 1;
  out.set(recipient, 1);
  out.set(encodeSudtAmount(params.amount), 33);
  out.set(eventHash, 49);
  out.set(params.nonce, 81);
  return out;
}

export function decodeRewardClaimData(
  data: Uint8Array,
): DecodedRewardClaimPayload {
  if (data.length !== CLAIM_DATA_LENGTH) {
    throw new Error('Invalid reward claim data length.');
  }
  if (data[0] !== 1) {
    throw new Error('Unsupported reward claim version.');
  }

  const recipientLockHash = bytesToHex(data.slice(1, 33));
  const amount = decodeSudtAmount(data.slice(33, 49));
  const eventIdHash = bytesToHex(data.slice(49, 81));
  const nonce = bytesToHex(data.slice(81, 97));

  return {
    recipientLockHash,
    amount,
    eventIdHash,
    event: eventFromHash(eventIdHash),
    nonce,
  };
}
