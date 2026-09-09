"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { REGISTRY_FEE_RATE } from "./config";
import { computeMinCellCapacity } from "./capacity";
import {
  getChainCellDeps,
  getChainCellTypeScriptFor,
  getKeeperLockScript,
} from "./scripts";
import { getUsernameOwnerLock, type Signer } from "./username";
import type { ChainMode } from "@/types/chain";
import {
  CHAIN_FLAG_STAKES,
  ChainModeCode,
  ChainStatusCode,
  bytesToHex,
  computeTypeId,
  decodeChainCellData,
  encodeChainCellData,
  genesisLineageRoot,
  hexToBytes,
  modeToCode,
  nextArtifactRoot,
  nextLineageRoot,
  nextWindowSeconds,
  sinceFromMs,
  type StakesOnChain,
} from "./chain-cell-layout";

export type { ChainCellData, StakesOnChain } from "./chain-cell-layout";
export {
  CHAIN_CELL_DATA_LEN,
  CHAIN_CELL_VERSION,
  CHAIN_FLAG_STAKES,
  ChainModeCode,
  ChainStatusCode,
  bytesToHex,
  decodeChainCellData,
  encodeChainCellData,
  hexToBytes,
  modeToCode,
  nextWindowSeconds,
} from "./chain-cell-layout";

export type ChainCellOutPoint = { txHash: string; index: string };

/**
 * How far behind the wall clock to anchor `since`. The chain compares `since`
 * against median block time, which trails real time, so anchoring at "now"
 * would leave transactions unmineable for a while.
 */
const SINCE_LAG_MS = 5 * 60 * 1000;

function toBytes32(hex: string): Uint8Array {
  return hexToBytes(hex);
}

async function getOwnerLock(signer: NonNullable<Signer>): Promise<ccc.Script> {
  return (await signer.getRecommendedAddressObj()).script;
}

/** The `since` value to anchor a transaction at, clamped to the deadline. */
function anchorSince(deadlineMs: bigint): bigint {
  const now = BigInt(Date.now() - SINCE_LAG_MS);
  const anchor = now < deadlineMs ? now : deadlineMs;
  return sinceFromMs(anchor);
}

export async function resolveRecipientLock(
  signer: NonNullable<Signer>,
  raw: string,
): Promise<{ lock: ccc.Script; address: string; label: string }> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Name the next Keeper with @handle or a CKB address.");

  const tryAddress = async (value: string) => {
    const parsed = await ccc.Address.fromString(value, signer.client);
    const address = parsed.toString();
    return { lock: parsed.script, address, label: address };
  };

  if (trimmed.startsWith("ckt") || trimmed.startsWith("ckb")) {
    return tryAddress(trimmed);
  }

  const handle = trimmed.replace(/^@/, "").toLowerCase();
  const lock = await getUsernameOwnerLock(handle);
  if (lock) {
    const address = ccc.Address.from({
      script: lock,
      prefix: signer.client.addressPrefix,
    }).toString();
    return { lock, address, label: `@${handle}` };
  }

  try {
    return await tryAddress(trimmed);
  } catch {
    throw new Error(
      "Could not resolve the next Keeper. Use a claimed @username or a ckt… address.",
    );
  }
}

/** Load a live Chain Cell and its decoded state, or explain why we cannot. */
async function loadLive(
  signer: NonNullable<Signer>,
  outPoint: ChainCellOutPoint,
) {
  const live = await signer.client.getCellLive(
    ccc.OutPoint.from({ txHash: outPoint.txHash, index: outPoint.index }),
  );
  if (!live) {
    throw new Error("Live Chain Cell not found — it may already have been spent.");
  }
  const data = decodeChainCellData(new Uint8Array(ccc.bytesFrom(live.outputData)));
  return { live, data };
}

// ——— Mint ————————————————————————————————————————————————————————————————

export async function mintChainCell(
  signer: NonNullable<Signer>,
  input: {
    mode: ChainMode;
    windowHours: number;
    stakes?: StakesOnChain | null;
    /** Seed pot, declared in the Cell so the schedule is public. */
    potAmount?: bigint;
  },
): Promise<{
  txHash: string;
  cellOutPoint: ChainCellOutPoint;
  chainId: string;
  expiresAt: string;
  windowSeconds: number;
}> {
  const windowSeconds = Math.max(60, Math.floor(input.windowHours * 3600));
  const ownerLock = await getOwnerLock(signer);
  const ownerLockHash = ownerLock.hash();

  // Reserve inputs first: the type-id is derived from the first one, so it
  // cannot be known until the transaction's inputs are fixed.
  const draft = ccc.Transaction.from({ outputs: [], outputsData: [] });
  await draft.completeInputsByCapacity(signer, 1);
  const firstInput = draft.inputs[0];
  if (!firstInput) throw new Error("No spendable cells to mint from.");

  const chainId = computeTypeId(firstInput, 0);
  const chainIdHex = bytesToHex(chainId);
  const type = getChainCellTypeScriptFor(chainIdHex);
  const lock = getKeeperLockScript(ownerLockHash, type.hash());

  const stakes = input.stakes ?? null;
  const expiresAtMs = BigInt(Date.now()) + BigInt(windowSeconds) * 1000n;
  const data = encodeChainCellData({
    status: ChainStatusCode.Alive,
    mode: modeToCode(input.mode),
    flags: stakes ? CHAIN_FLAG_STAKES : 0,
    ownerCount: 1,
    expiresAtMs,
    windowSeconds,
    chainId,
    lineageRoot: genesisLineageRoot(chainId, toBytes32(ownerLockHash)),
    creatorLockHash: toBytes32(ownerLockHash),
    entryCkb: stakes?.entryCkb ?? 0,
    escalationBp: stakes?.escalationBp ?? 0,
    decayBp: stakes?.decayBp ?? 0,
    floorSeconds: stakes?.floorSeconds ?? 0,
    potAmount: stakes ? (input.potAmount ?? 0n) : 0n,
  });

  const capacity = computeMinCellCapacity(lock, type, data);
  const tx = ccc.Transaction.from({
    inputs: draft.inputs,
    outputs: [{ lock, type, capacity }],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: getChainCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);

  return {
    txHash,
    cellOutPoint: { txHash, index: "0x0" },
    chainId: chainIdHex,
    expiresAt: new Date(Number(expiresAtMs)).toISOString(),
    windowSeconds,
  };
}

// ——— Seal ————————————————————————————————————————————————————————————————

/**
 * Seal a mark. The contract recomputes `artifact_root` from the previous root
 * and the mark hash carried in the witness, so a Keeper can add to the archive
 * but can never rewrite it.
 */
export async function commitArtifactRoot(
  signer: NonNullable<Signer>,
  input: {
    liveOutPoint: ChainCellOutPoint;
    /** Hash of the mark being sealed — the preimage of the new root. */
    markHash: Uint8Array;
  },
): Promise<{
  txHash: string;
  cellOutPoint: ChainCellOutPoint;
  artifactRootHex: string;
}> {
  if (input.markHash.length !== 32) {
    throw new Error("markHash must be 32 bytes.");
  }

  const { live, data: current } = await loadLive(signer, input.liveOutPoint);
  if (current.status !== ChainStatusCode.Alive) {
    throw new Error("This Cell is no longer alive.");
  }

  const ownerLock = await getOwnerLock(signer);
  const type = getChainCellTypeScriptFor(bytesToHex(current.chainId));
  const keeperLock = getKeeperLockScript(ownerLock.hash(), type.hash());
  if (live.cellOutput.lock.hash() !== keeperLock.hash()) {
    throw new Error("This wallet does not hold the live Chain Cell.");
  }

  const artifactRoot = nextArtifactRoot(current.artifactRoot, input.markHash);
  const data = encodeChainCellData({
    status: ChainStatusCode.Alive,
    mode: current.mode,
    flags: current.flags,
    ownerCount: current.ownerCount,
    expiresAtMs: current.expiresAtMs,
    windowSeconds: current.windowSeconds,
    chainId: current.chainId,
    lineageRoot: current.lineageRoot,
    artifactRoot,
    creatorLockHash: current.creatorLockHash,
    entryCkb: current.entryCkb,
    escalationBp: current.escalationBp,
    decayBp: current.decayBp,
    floorSeconds: current.floorSeconds,
    potAmount: current.potAmount,
  });

  const minCapacity = computeMinCellCapacity(keeperLock, type, data);
  const capacity =
    live.cellOutput.capacity > minCapacity ? live.cellOutput.capacity : minCapacity;

  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: live.outPoint, since: anchorSince(current.expiresAtMs) }],
    outputs: [{ lock: keeperLock, type, capacity }],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: getChainCellDeps(),
    witnesses: [
      ccc.hexFrom(
        ccc.WitnessArgs.from({ outputType: ccc.hexFrom(input.markHash) }).toBytes(),
      ),
    ],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);

  return {
    txHash,
    cellOutPoint: { txHash, index: "0x0" },
    artifactRootHex: bytesToHex(artifactRoot),
  };
}

// ——— Handoff —————————————————————————————————————————————————————————————

export async function handoffChainCell(
  signer: NonNullable<Signer>,
  input: {
    liveOutPoint: ChainCellOutPoint;
    recipient: string;
    /** Extra pot the incoming Keeper is paying in, for stakes Cells. */
    potDelta?: bigint;
  },
): Promise<{
  txHash: string;
  cellOutPoint: ChainCellOutPoint;
  recipientAddress: string;
  recipientLabel: string;
  expiresAt: string;
  returned: boolean;
  artifactRootHex: string;
}> {
  const next = await resolveRecipientLock(signer, input.recipient);
  const { live, data: current } = await loadLive(signer, input.liveOutPoint);
  if (current.status !== ChainStatusCode.Alive) {
    throw new Error("This Cell is no longer alive.");
  }
  if (Date.now() >= Number(current.expiresAtMs)) {
    throw new Error("The window closed — this Cell can only be reaped now.");
  }

  const ownerLock = await getOwnerLock(signer);
  const type = getChainCellTypeScriptFor(bytesToHex(current.chainId));
  const holderLock = getKeeperLockScript(ownerLock.hash(), type.hash());
  if (live.cellOutput.lock.hash() !== holderLock.hash()) {
    throw new Error("This wallet does not hold the live Chain Cell.");
  }

  const nextKeeperLock = getKeeperLockScript(next.lock.hash(), type.hash());
  const nextLockHash = nextKeeperLock.hash();
  if (nextLockHash === holderLock.hash()) {
    throw new Error("Pass it to someone else — you already hold it.");
  }

  // Coming home is the only ending the contract will accept, and only to the
  // creator recorded at mint.
  const returningHome =
    current.mode === ChainModeCode.ReturnHome &&
    nextLockHash === bytesToHex(current.creatorLockHash);
  const status = returningHome ? ChainStatusCode.Returned : ChainStatusCode.Alive;

  const since = anchorSince(current.expiresAtMs);
  const anchorMs = (since & 0x00ffffffffffffffn) * 1000n;
  const windowSeconds = nextWindowSeconds({
    flags: current.flags,
    windowSeconds: current.windowSeconds,
    decayBp: current.decayBp,
    floorSeconds: current.floorSeconds,
    ownerCount: current.ownerCount,
  });
  const expiresAtMs = anchorMs + BigInt(windowSeconds) * 1000n;

  const data = encodeChainCellData({
    status,
    mode: current.mode,
    flags: current.flags,
    ownerCount: current.ownerCount + 1,
    expiresAtMs,
    windowSeconds: current.windowSeconds,
    chainId: current.chainId,
    lineageRoot: nextLineageRoot(current.lineageRoot, toBytes32(nextLockHash)),
    artifactRoot: current.artifactRoot,
    creatorLockHash: current.creatorLockHash,
    entryCkb: current.entryCkb,
    escalationBp: current.escalationBp,
    decayBp: current.decayBp,
    floorSeconds: current.floorSeconds,
    potAmount: current.potAmount + (input.potDelta ?? 0n),
  });

  const minCapacity = computeMinCellCapacity(nextKeeperLock, type, data);
  const capacity =
    live.cellOutput.capacity > minCapacity ? live.cellOutput.capacity : minCapacity;

  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: live.outPoint, since }],
    outputs: [{ lock: nextKeeperLock, type, capacity }],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: getChainCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);

  return {
    txHash,
    cellOutPoint: { txHash, index: "0x0" },
    recipientAddress: next.address,
    recipientLabel: next.label,
    expiresAt: new Date(Number(expiresAtMs)).toISOString(),
    returned: returningHome,
    artifactRootHex: bytesToHex(current.artifactRoot),
  };
}

// ——— Reap ————————————————————————————————————————————————————————————————

/**
 * Record that a Cell died. Anyone can do this once the deadline has passed —
 * the Keeper who dropped it does not get to hide it, and cannot block it by
 * walking away. Death stops being an off-chain opinion and becomes a fact.
 */
export async function reapChainCell(
  signer: NonNullable<Signer>,
  input: { liveOutPoint: ChainCellOutPoint },
): Promise<{ txHash: string; cellOutPoint: ChainCellOutPoint; diedAt: string }> {
  const { live, data: current } = await loadLive(signer, input.liveOutPoint);
  if (current.status !== ChainStatusCode.Alive) {
    throw new Error("This Cell has already been settled.");
  }
  if (BigInt(Date.now()) < current.expiresAtMs) {
    throw new Error("This Cell still has time on the clock.");
  }

  const data = encodeChainCellData({
    status: ChainStatusCode.Dead,
    mode: current.mode,
    flags: current.flags,
    ownerCount: current.ownerCount,
    expiresAtMs: current.expiresAtMs,
    windowSeconds: current.windowSeconds,
    chainId: current.chainId,
    lineageRoot: current.lineageRoot,
    artifactRoot: current.artifactRoot,
    creatorLockHash: current.creatorLockHash,
    entryCkb: current.entryCkb,
    escalationBp: current.escalationBp,
    decayBp: current.decayBp,
    floorSeconds: current.floorSeconds,
    potAmount: current.potAmount,
  });

  const tx = ccc.Transaction.from({
    // The lock is unchanged: a reaper settles the run, they do not take it.
    inputs: [
      { previousOutput: live.outPoint, since: sinceFromMs(Number(current.expiresAtMs)) },
    ],
    outputs: [
      {
        lock: live.cellOutput.lock,
        type: live.cellOutput.type,
        capacity: live.cellOutput.capacity,
      },
    ],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: getChainCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);

  return {
    txHash,
    cellOutPoint: { txHash, index: "0x0" },
    diedAt: new Date(Number(current.expiresAtMs)).toISOString(),
  };
}
