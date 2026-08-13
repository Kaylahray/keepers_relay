"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { REGISTRY_FEE_RATE } from "./config";
import { computeMinCellCapacity } from "./capacity";
import { getChainCellDeps, getChainCellTypeScript } from "./scripts";
import { getUsernameOwnerLock, type Signer } from "./username";
import type { ChainMode } from "@/types/chain";
import {
  ChainModeCode,
  ChainStatusCode,
  bytesToHex,
  decodeChainCellData,
  encodeChainCellData,
  modeToCode,
} from "./chain-cell-layout";

export type { ChainCellData } from "./chain-cell-layout";
export {
  CHAIN_CELL_DATA_LEN,
  CHAIN_CELL_VERSION,
  ChainModeCode,
  ChainStatusCode,
  bytesToHex,
  decodeChainCellData,
  encodeChainCellData,
  hexToBytes,
  modeToCode,
} from "./chain-cell-layout";

export type ChainCellOutPoint = { txHash: string; index: string };

async function getOwnerLock(signer: NonNullable<Signer>): Promise<ccc.Script> {
  const addr = await signer.getRecommendedAddressObj();
  return addr.script;
}

function randomChainId(): Uint8Array {
  const id = new Uint8Array(32);
  crypto.getRandomValues(id);
  return id;
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

export async function mintChainCell(
  signer: NonNullable<Signer>,
  input: {
    mode: ChainMode;
    windowHours: number;
  },
): Promise<{
  txHash: string;
  cellOutPoint: ChainCellOutPoint;
  chainId: string;
  expiresAt: string;
  windowSeconds: number;
}> {
  const windowHours = input.windowHours === 168 || input.windowHours === 720 ? input.windowHours : 24;
  const windowSeconds = windowHours * 3600;
  const ownerLock = await getOwnerLock(signer);
  const chainId = randomChainId();
  const expiresAtMs = BigInt(Date.now()) + BigInt(windowSeconds) * BigInt(1000);
  const data = encodeChainCellData({
    status: ChainStatusCode.Alive,
    mode: modeToCode(input.mode),
    ownerCount: 1,
    expiresAtMs,
    windowSeconds,
    chainId,
  });
  const type = getChainCellTypeScript();
  const capacity = computeMinCellCapacity(ownerLock, type, data);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: ownerLock, type, capacity }],
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
    chainId: bytesToHex(chainId),
    expiresAt: new Date(Number(expiresAtMs)).toISOString(),
    windowSeconds,
  };
}

/**
 * Seal path: same Keeper lock, same owner_count / expiry, updated artifact_root.
 * Requires Chain Cell type script that allows seal (redeploy after script update).
 */
export async function commitArtifactRoot(
  signer: NonNullable<Signer>,
  input: {
    liveOutPoint: ChainCellOutPoint;
    artifactRoot: Uint8Array;
  },
): Promise<{
  txHash: string;
  cellOutPoint: ChainCellOutPoint;
  artifactRootHex: string;
}> {
  if (input.artifactRoot.length !== 32) {
    throw new Error("artifact_root must be 32 bytes.");
  }

  const live = await signer.client.getCellLive(
    ccc.OutPoint.from({
      txHash: input.liveOutPoint.txHash,
      index: input.liveOutPoint.index,
    }),
  );
  if (!live) {
    throw new Error("Live Chain Cell not found — it may already have been spent.");
  }

  const holderLock = await getOwnerLock(signer);
  if (live.cellOutput.lock.hash() !== holderLock.hash()) {
    throw new Error("This wallet does not hold the live Chain Cell.");
  }

  const current = decodeChainCellData(new Uint8Array(ccc.bytesFrom(live.outputData)));
  if (current.status !== ChainStatusCode.Alive) {
    throw new Error("This Cell is no longer alive.");
  }

  const data = encodeChainCellData({
    status: ChainStatusCode.Alive,
    mode: current.mode,
    ownerCount: current.ownerCount,
    expiresAtMs: current.expiresAtMs,
    windowSeconds: current.windowSeconds,
    chainId: current.chainId,
    lineageRoot: current.lineageRoot,
    artifactRoot: input.artifactRoot,
  });

  const type = getChainCellTypeScript();
  const minCapacity = computeMinCellCapacity(holderLock, type, data);
  const capacity =
    live.cellOutput.capacity > minCapacity ? live.cellOutput.capacity : minCapacity;

  const tx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: live.outPoint,
        since: 0,
      },
    ],
    outputs: [{ lock: holderLock, type, capacity }],
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
    artifactRootHex: bytesToHex(input.artifactRoot),
  };
}

export async function handoffChainCell(
  signer: NonNullable<Signer>,
  input: {
    liveOutPoint: ChainCellOutPoint;
    recipient: string;
    creatorAddress?: string;
    mode: ChainMode;
    /** Pending mark commitment — written into the successor Cell. */
    artifactRoot?: Uint8Array;
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
  const live = await signer.client.getCellLive(
    ccc.OutPoint.from({
      txHash: input.liveOutPoint.txHash,
      index: input.liveOutPoint.index,
    }),
  );
  if (!live) {
    throw new Error("Live Chain Cell not found — it may already have been spent.");
  }

  const holderLock = await getOwnerLock(signer);
  if (live.cellOutput.lock.hash() !== holderLock.hash()) {
    throw new Error("This wallet does not hold the live Chain Cell.");
  }

  const current = decodeChainCellData(new Uint8Array(ccc.bytesFrom(live.outputData)));
  if (current.status !== ChainStatusCode.Alive) {
    throw new Error("This Cell is no longer alive.");
  }

  const creatorMatch =
    Boolean(input.creatorAddress) &&
    next.address.toLowerCase() === input.creatorAddress!.toLowerCase();
  const returningHome =
    current.mode === ChainModeCode.ReturnHome && creatorMatch;
  const status = returningHome ? ChainStatusCode.Returned : ChainStatusCode.Alive;

  if (status === ChainStatusCode.Alive && next.lock.hash() === holderLock.hash()) {
    throw new Error("Pass it to someone else — you already hold it.");
  }

  const nextArtifactRoot =
    input.artifactRoot && input.artifactRoot.length === 32
      ? input.artifactRoot
      : current.artifactRoot;

  const expiresAtMs = current.expiresAtMs + BigInt(current.windowSeconds) * BigInt(1000);
  const data = encodeChainCellData({
    status,
    mode: current.mode,
    ownerCount: current.ownerCount + 1,
    expiresAtMs,
    windowSeconds: current.windowSeconds,
    chainId: current.chainId,
    lineageRoot: current.lineageRoot,
    artifactRoot: nextArtifactRoot,
  });

  const type = getChainCellTypeScript();
  const minCapacity = computeMinCellCapacity(next.lock, type, data);
  const capacity =
    live.cellOutput.capacity > minCapacity ? live.cellOutput.capacity : minCapacity;

  const tx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: live.outPoint,
        since: 0,
      },
    ],
    outputs: [{ lock: next.lock, type, capacity }],
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
    artifactRootHex: bytesToHex(nextArtifactRoot),
  };
}
