"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { REGISTRY_FEE_RATE } from "./config";
import { computeMinCellCapacity } from "./capacity";
import { getClient } from "./client";
import { getUsernameCellDeps, getUsernameTypeScript } from "./scripts";
import {
  encodeUsername,
  decodeUsername,
  isValidUsername,
  normalizeUsername,
} from "./encoding";
import type { Username, UsernameAvailability } from "./types";

export type Signer = ReturnType<typeof ccc.useSigner>;

async function getOwnerLock(
  signer: NonNullable<Signer>,
): Promise<ccc.Script> {
  const addr = await signer.getRecommendedAddressObj();
  return addr.script;
}

async function findUsernameCellByOwner(
  ownerLock: ccc.Script,
): Promise<{ cell: ccc.Cell; username: string } | null> {
  const client = getClient();
  const type = getUsernameTypeScript();
  for await (const cell of client.findCells(
    {
      script: type,
      scriptType: "type",
      scriptSearchMode: "exact",
      filter: { script: ownerLock },
    },
    "asc",
    20,
  )) {
    try {
      const username = decodeUsername(
        new Uint8Array(ccc.bytesFrom(cell.outputData)),
      );
      if (isValidUsername(username)) {
        return { cell, username };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function findUsernameCellByName(
  username: string,
): Promise<{ cell: ccc.Cell; ownerLock: ccc.Script } | null> {
  const client = getClient();
  const type = getUsernameTypeScript();
  const target = encodeUsername(username);
  for await (const cell of client.findCells(
    {
      script: type,
      scriptType: "type",
      scriptSearchMode: "exact",
    },
    "asc",
    200,
  )) {
    try {
      const data = new Uint8Array(ccc.bytesFrom(cell.outputData));
      if (data.length !== target.length) continue;
      let same = true;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== target[i]) {
          same = false;
          break;
        }
      }
      if (same) {
        return { cell, ownerLock: cell.cellOutput.lock };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function checkUsernameAvailability(
  username: string,
  signer: Signer | null,
): Promise<UsernameAvailability> {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) {
    return { ok: false, reason: "format" };
  }

  const found = await findUsernameCellByName(normalized);
  if (!found) return { ok: true };
  if (signer) {
    const myLock = await getOwnerLock(signer);
    if (found.ownerLock.hash() === myLock.hash()) return { ok: true };
  }
  return { ok: false, reason: "taken" };
}

export async function getUsernameByOwner(
  signer: NonNullable<Signer>,
): Promise<Username | null> {
  const lock = await getOwnerLock(signer);
  const found = await findUsernameCellByOwner(lock);
  if (!found) return null;

  return {
    username: found.username,
    ownerLockHash: lock.hash(),
    cellOutpoint: {
      txHash: found.cell.outPoint.txHash,
      index: found.cell.outPoint.index.toString(),
    },
    createdAt: 0,
  };
}

export async function getUsernameByName(
  username: string,
): Promise<Username | null> {
  const normalized = normalizeUsername(username);
  const found = await findUsernameCellByName(normalized);
  if (!found) return null;
  return {
    username: normalized,
    ownerLockHash: found.ownerLock.hash(),
    cellOutpoint: {
      txHash: found.cell.outPoint.txHash,
      index: found.cell.outPoint.index.toString(),
    },
    createdAt: 0,
  };
}

/** Resolve the live lock script that owns a claimed handle. */
export async function getUsernameOwnerLock(
  username: string,
): Promise<ccc.Script | null> {
  const found = await findUsernameCellByName(normalizeUsername(username));
  return found?.ownerLock ?? null;
}

export async function claimUsername(
  signer: NonNullable<Signer>,
  rawUsername: string,
): Promise<Username> {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) {
    throw new Error(
      "Username must be 3–32 chars, lowercase letters/numbers/underscore.",
    );
  }

  const ownerLock = await getOwnerLock(signer);

  const existing = await findUsernameCellByOwner(ownerLock);
  if (existing && existing.username !== username) {
    throw new Error(
      `This wallet already owns @${existing.username}. Burn it first to claim a new one.`,
    );
  }
  const conflict = await findUsernameCellByName(username);
  if (conflict && conflict.ownerLock.hash() !== ownerLock.hash()) {
    throw new Error(`@${username} is already taken.`);
  }

  const data = encodeUsername(username);
  const type = getUsernameTypeScript();
  const capacity = computeMinCellCapacity(ownerLock, type, data);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: ownerLock, type, capacity }],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: getUsernameCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);

  return {
    username,
    ownerLockHash: ownerLock.hash(),
    cellOutpoint: { txHash, index: "0x0" },
    createdAt: Date.now(),
  };
}

export async function releaseUsername(
  signer: NonNullable<Signer>,
): Promise<void> {
  const ownerLock = await getOwnerLock(signer);
  const existing = await findUsernameCellByOwner(ownerLock);
  if (!existing) return;

  const tx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: existing.cell.outPoint,
        since: 0,
      },
    ],
    cellDeps: getUsernameCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);
}
