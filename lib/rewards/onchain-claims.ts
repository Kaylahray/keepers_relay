'use client';

import { ccc } from '@ckb-ccc/connector-react';
import {
  REGISTRY_FEE_RATE,
  rewardClaimsConfigured,
} from '@/lib/registry/config';
import { computeMinCellCapacity } from '@/lib/registry/capacity';
import {
  getRewardClaimCellDeps,
  getRewardClaimTypeScript,
  getRewardTreasuryCellDeps,
  getRewardTreasuryLockScript,
  getSudtCellDeps,
  getSudtTypeScript,
} from '@/lib/registry/scripts';
import { getClient } from '@/lib/registry/client';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import { encodeSudtAmount, getSudtCellsByLock } from '@/lib/token/sudt';
import { decodeRewardClaimData } from '@/lib/rewards/claim-data';
import { REWARD_LABELS, type RewardMilestone } from '@/lib/rewards/milestones';

export type RewardClaimCell = {
  cell: ccc.Cell;
  recipientLockHash: string;
  amount: bigint;
  eventIdHash: string;
  event?: RewardMilestone;
  nonce: string;
};

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(ccc.bytesFrom(hex));
}

export async function getRewardClaimsByRecipientLockHash(
  recipientLockHash: string,
): Promise<RewardClaimCell[]> {
  if (!rewardClaimsConfigured()) return [];

  const client = getClient();
  const claimType = getRewardClaimTypeScript();
  const claims: RewardClaimCell[] = [];

  for await (const cell of client.findCells(
    {
      script: claimType,
      scriptType: 'type',
      scriptSearchMode: 'exact',
    },
    'asc',
    200,
  )) {
    try {
      const decoded = decodeRewardClaimData(hexToBytes(cell.outputData));
      if (decoded.recipientLockHash === recipientLockHash) {
        claims.push({ cell, ...decoded });
      }
    } catch {
      continue;
    }
  }

  return claims;
}

export async function getRewardClaimsBySigner(
  signer: NonNullable<ReturnType<typeof ccc.useSigner>>,
): Promise<RewardClaimCell[]> {
  const addr = await signer.getRecommendedAddressObj();
  return getRewardClaimsByRecipientLockHash(addr.script.hash());
}

export async function claimRewardFromTreasury(params: {
  signer: NonNullable<ReturnType<typeof ccc.useSigner>>;
  claim: RewardClaimCell;
}): Promise<string> {
  const { signer, claim } = params;
  if (!rewardClaimsConfigured()) {
    throw new Error('Reward claim contracts are not configured.');
  }

  const owner = await signer.getRecommendedAddressObj();
  if (owner.script.hash() !== claim.recipientLockHash) {
    throw new Error('This claim ticket belongs to another wallet.');
  }

  const sudtType = getSudtTypeScript();
  const treasuryLock = getRewardTreasuryLockScript();
  const treasuryCells = await getSudtCellsByLock(treasuryLock);

  let pickedAmount = BigInt(0);
  const pickedTreasury = [];
  for (const item of treasuryCells) {
    pickedTreasury.push(item);
    pickedAmount += item.amount;
    if (pickedAmount >= claim.amount) break;
  }
  if (pickedAmount < claim.amount) {
    throw new Error('Reward treasury does not have enough balance.');
  }

  const payoutData = encodeSudtAmount(claim.amount);
  const payoutCapacity = computeMinCellCapacity(
    owner.script,
    sudtType,
    payoutData,
  );

  const outputs: ccc.CellOutput[] = [
    ccc.CellOutput.from({
      lock: owner.script,
      type: sudtType,
      capacity: payoutCapacity,
    }),
  ];
  const outputsData = [ccc.hexFrom(payoutData)];

  const treasuryChange = pickedAmount - claim.amount;
  if (treasuryChange > BigInt(0)) {
    const data = encodeSudtAmount(treasuryChange);
    outputs.push(
      ccc.CellOutput.from({
        lock: treasuryLock,
        type: sudtType,
        capacity: computeMinCellCapacity(treasuryLock, sudtType, data),
      }),
    );
    outputsData.push(ccc.hexFrom(data));
  }

  const tx = ccc.Transaction.from({
    inputs: [
      ccc.CellInput.from({
        previousOutput: claim.cell.outPoint,
        since: 0,
      }),
      ...pickedTreasury.map(({ cell }) =>
        ccc.CellInput.from({
          previousOutput: cell.outPoint,
          since: 0,
        }),
      ),
    ],
    outputs,
    outputsData,
    cellDeps: dedupeCellDeps([
      ...getRewardClaimCellDeps(),
      ...getRewardTreasuryCellDeps(),
      ...getSudtCellDeps(),
    ]),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await waitTxBestEffort(signer.client, txHash);
  requestWalletRefresh();
  return txHash;
}

export const rewardClaimKeys = {
  all: ['rewardClaims'] as const,
  forSigner: (connected: boolean) => [...rewardClaimKeys.all, connected ? 'on' : 'off'] as const,
};

export function rewardClaimQueryKeyForSigner(signer: unknown) {
  return rewardClaimKeys.forSigner(Boolean(signer));
}

function dedupeCellDeps(cellDeps: ccc.CellDep[]): ccc.CellDep[] {
  const seen = new Set<string>();
  const out: ccc.CellDep[] = [];
  for (const dep of cellDeps) {
    const key = `${dep.outPoint.txHash}:${dep.outPoint.index}:${dep.depType}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(dep);
    }
  }
  return out;
}

async function waitTxBestEffort(
  client: ReturnType<typeof getClient>,
  txHash: string,
): Promise<void> {
  const backoffMs = [500, 1500, 3500];
  let lastError: unknown;
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      await client.waitTransaction(txHash);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < backoffMs.length) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
    }
  }
  console.warn(
    '[onchain-claims] waitTransaction failed after retries; tx may already be confirmed:',
    txHash,
    lastError,
  );
}

export function describeRewardClaim(claim: RewardClaimCell): string {
  return claim.event
    ? `${REWARD_LABELS[claim.event]} (+${claim.amount.toString()})`
    : `Reward (+${claim.amount.toString()})`;
}
