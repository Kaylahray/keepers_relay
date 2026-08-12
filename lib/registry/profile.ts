"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { REGISTRY_FEE_RATE } from "./config";
import { computeMinCellCapacity } from "./capacity";
import { getClient } from "./client";
import { getProfileCellDeps, getProfileTypeScript } from "./scripts";
import { decodeProfile, encodeProfile, sanitizeProfile } from "./encoding";
import { getUsernameByName } from "./username";
import type { Profile, StoredProfile } from "./types";
import type { Signer } from "./username";

async function getOwnerLock(
  signer: NonNullable<Signer>,
): Promise<ccc.Script> {
  const addr = await signer.getRecommendedAddressObj();
  return addr.script;
}

async function findProfileCellByOwner(
  ownerLock: ccc.Script,
): Promise<{ cell: ccc.Cell; profile: Profile } | null> {
  const client = getClient();
  const type = getProfileTypeScript();
  let latest: { cell: ccc.Cell; profile: Profile } | null = null;
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
    const data = new Uint8Array(ccc.bytesFrom(cell.outputData));
    const decoded = decodeProfile(data);
    if (decoded) {
      latest = { cell, profile: decoded };
    }
  }
  return latest;
}

export async function getProfileCellByOwnerLock(
  ownerLock: ccc.Script,
): Promise<{ cell: ccc.Cell; profile: Profile } | null> {
  return findProfileCellByOwner(ownerLock);
}

async function findProfileCellByLockHash(
  ownerLockHash: string,
): Promise<{ cell: ccc.Cell; profile: Profile; lock: ccc.Script } | null> {
  const client = getClient();
  const type = getProfileTypeScript();
  let latest: {
    cell: ccc.Cell;
    profile: Profile;
    lock: ccc.Script;
  } | null = null;
  for await (const cell of client.findCells(
    {
      script: type,
      scriptType: "type",
      scriptSearchMode: "exact",
    },
    "asc",
    500,
  )) {
    if (cell.cellOutput.lock.hash() !== ownerLockHash) continue;
    const data = new Uint8Array(ccc.bytesFrom(cell.outputData));
    const decoded = decodeProfile(data);
    if (decoded) {
      latest = { cell, profile: decoded, lock: cell.cellOutput.lock };
    }
  }
  return latest;
}

export async function getProfileByOwner(
  signer: NonNullable<Signer>,
): Promise<StoredProfile | null> {
  const lock = await getOwnerLock(signer);
  const found = await findProfileCellByOwner(lock);
  if (!found) return null;

  return {
    ...found.profile,
    ownerLockHash: lock.hash(),
    cellOutpoint: {
      txHash: found.cell.outPoint.txHash,
      index: found.cell.outPoint.index.toString(),
    },
    createdAt: 0,
    updatedAt: 0,
  };
}

export async function getProfileByUsername(
  username: string,
): Promise<StoredProfile | null> {
  const usernameRecord = await getUsernameByName(username);
  if (!usernameRecord) return null;

  const found = await findProfileCellByLockHash(usernameRecord.ownerLockHash);
  if (!found) return null;

  return {
    ...found.profile,
    ownerLockHash: usernameRecord.ownerLockHash,
    username,
    cellOutpoint: {
      txHash: found.cell.outPoint.txHash,
      index: found.cell.outPoint.index.toString(),
    },
    createdAt: 0,
    updatedAt: 0,
  };
}

export async function createProfile(
  signer: NonNullable<Signer>,
  profile: Profile,
  username?: string,
): Promise<StoredProfile> {
  const cleaned = sanitizeProfile(profile);
  if (cleaned.name.length === 0) {
    throw new Error("Profile name is required.");
  }

  const now = Date.now();

  const ownerLock = await getOwnerLock(signer);

  const existing = await findProfileCellByOwner(ownerLock);
  if (existing) {
    throw new Error(
      "A profile cell already exists for this wallet. Update it instead.",
    );
  }

  const data = encodeProfile(cleaned);
  const type = getProfileTypeScript();
  const capacity = computeMinCellCapacity(ownerLock, type, data);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: ownerLock, type, capacity }],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: getProfileCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);

  return {
    ...cleaned,
    ownerLockHash: ownerLock.hash(),
    username,
    cellOutpoint: { txHash, index: "0x0" },
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateProfile(
  signer: NonNullable<Signer>,
  profile: Profile,
  username?: string,
): Promise<StoredProfile> {
  const cleaned = sanitizeProfile(profile);
  if (cleaned.name.length === 0) {
    throw new Error("Profile name is required.");
  }

  const ownerLock = await getOwnerLock(signer);
  const existing = await findProfileCellByOwner(ownerLock);
  if (!existing) {
    return await createProfile(signer, cleaned, username);
  }

  const data = encodeProfile(cleaned);
  const type = getProfileTypeScript();

  const minCapacity = computeMinCellCapacity(ownerLock, type, data);
  const capacity =
    existing.cell.cellOutput.capacity > minCapacity
      ? existing.cell.cellOutput.capacity
      : minCapacity;

  const tx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: existing.cell.outPoint,
        since: 0,
      },
    ],
    outputs: [{ lock: ownerLock, type, capacity }],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: getProfileCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);

  return {
    ...cleaned,
    ownerLockHash: ownerLock.hash(),
    username,
    cellOutpoint: { txHash, index: "0x0" },
    createdAt: 0,
    updatedAt: Date.now(),
  };
}

export async function appendProfileUpdateToTx(params: {
  tx: ccc.Transaction;
  signer: NonNullable<Signer>;
  profile: Profile;
}): Promise<{ sanitizedProfile: Profile }> {
  const cleaned = sanitizeProfile(params.profile);
  if (cleaned.name.length === 0) {
    throw new Error("Profile name is required.");
  }

  const ownerLock = await getOwnerLock(params.signer);
  const existing = await findProfileCellByOwner(ownerLock);
  if (!existing) {
    throw new Error("Profile cell not found for wallet.");
  }

  const data = encodeProfile(cleaned);
  const type = getProfileTypeScript();
  const minCapacity = computeMinCellCapacity(ownerLock, type, data);
  const capacity =
    existing.cell.cellOutput.capacity > minCapacity
      ? existing.cell.cellOutput.capacity
      : minCapacity;

  params.tx.inputs.push(
    ccc.CellInput.from({
      previousOutput: existing.cell.outPoint,
      since: 0,
    }),
  );
  params.tx.outputs.push(ccc.CellOutput.from({ lock: ownerLock, type, capacity }));
  params.tx.outputsData.push(ccc.hexFrom(data));
  params.tx.cellDeps.push(...getProfileCellDeps());

  return { sanitizedProfile: cleaned };
}

export async function burnProfile(
  signer: NonNullable<Signer>,
): Promise<void> {
  const ownerLock = await getOwnerLock(signer);
  const existing = await findProfileCellByOwner(ownerLock);
  if (!existing) return;

  const tx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: existing.cell.outPoint,
        since: 0,
      },
    ],
    cellDeps: getProfileCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);
}
