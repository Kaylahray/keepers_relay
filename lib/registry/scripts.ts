"use client";

import { ccc } from "@ckb-ccc/connector-react";
import {
  assertChainCellConfigured,
  assertEventEngineConfigured,
  assertRewardClaimsConfigured,
  assertRegistryConfigured,
  assertSudtConfigured,
  chainCellType,
  ckbJsVm,
  eventCellType,
  eventRewardClaimType,
  eventTreasuryLock,
  keeperLock,
  participantType,
  profileType,
  rewardClaimType,
  rewardTreasuryLock,
  sudtType,
  type ScriptConfig,
  usernameType,
} from "./config";

function toScript(s: ScriptConfig): ccc.Script {
  return ccc.Script.from({
    codeHash: s.codeHash,
    hashType: s.hashType,
    args: s.args,
  });
}

function toCellDep(s: ScriptConfig): ccc.CellDep {
  return ccc.CellDep.from({
    outPoint: {
      txHash: s.outPoint.txHash,
      index: s.outPoint.index,
    },
    depType: s.depType,
  });
}

export function getChainCellTypeScript(): ccc.Script {
  assertChainCellConfigured();
  return toScript(chainCellType);
}

/**
 * The Chain Cell type script for one specific Cell. `chainId` is the type-id,
 * so each Cell gets its own script — that is what makes it unforgeable.
 */
export function getChainCellTypeScriptFor(chainIdHex: string): ccc.Script {
  assertChainCellConfigured();
  return ccc.Script.from({
    codeHash: chainCellType.codeHash,
    hashType: chainCellType.hashType,
    args: chainIdHex,
  });
}

/**
 * The lock worn by a live Chain Cell: the Keeper can spend it, and once the
 * clock runs out anybody can spend it to record that it died.
 */
export function getKeeperLockScript(
  keeperLockHash: string,
  chainTypeHash: string,
): ccc.Script {
  assertChainCellConfigured();
  const args = `0x${keeperLockHash.replace(/^0x/, '')}${chainTypeHash.replace(/^0x/, '')}`;
  return ccc.Script.from({
    codeHash: keeperLock.codeHash,
    hashType: keeperLock.hashType,
    args,
  });
}

export function getChainCellDeps(): ccc.CellDep[] {
  assertChainCellConfigured();
  return [toCellDep(chainCellType), toCellDep(keeperLock)];
}

export function getUsernameTypeScript(): ccc.Script {
  assertRegistryConfigured();
  return toScript(usernameType);
}

export function getProfileTypeScript(): ccc.Script {
  assertRegistryConfigured();
  return toScript(profileType);
}

export function getUsernameCellDeps(): ccc.CellDep[] {
  assertRegistryConfigured();
  return [toCellDep(ckbJsVm), toCellDep(usernameType)];
}

export function getProfileCellDeps(): ccc.CellDep[] {
  assertRegistryConfigured();
  return [toCellDep(ckbJsVm), toCellDep(profileType)];
}

export function getSudtTypeScript(): ccc.Script {
  assertSudtConfigured();
  return toScript(sudtType);
}

export function getSudtCellDeps(): ccc.CellDep[] {
  assertSudtConfigured();
  return [toCellDep(sudtType)];
}

export function getRewardClaimTypeScript(): ccc.Script {
  assertRewardClaimsConfigured();
  return toScript(rewardClaimType);
}

export function getRewardTreasuryLockScript(): ccc.Script {
  assertRewardClaimsConfigured();
  return toScript(rewardTreasuryLock);
}

export function getRewardClaimCellDeps(): ccc.CellDep[] {
  assertRewardClaimsConfigured();
  return [toCellDep(rewardClaimType)];
}

export function getRewardTreasuryCellDeps(): ccc.CellDep[] {
  assertRewardClaimsConfigured();
  return [toCellDep(rewardTreasuryLock)];
}

export function getEventCellTypeScript(): ccc.Script {
  assertEventEngineConfigured();
  return toScript(eventCellType);
}

/** Event Cell type for one event — args = type-id (eventId). */
export function getEventCellTypeScriptFor(eventIdHex: string): ccc.Script {
  assertEventEngineConfigured();
  return ccc.Script.from({
    codeHash: eventCellType.codeHash,
    hashType: eventCellType.hashType,
    args: eventIdHex,
  });
}

export function getEventCellDeps(): ccc.CellDep[] {
  assertEventEngineConfigured();
  return [toCellDep(eventCellType)];
}

/** Treasury lock for one event — args = event_type_hash || event_id (64 bytes). */
export function getEventTreasuryLockScript(argsHex: string): ccc.Script {
  assertEventEngineConfigured();
  return ccc.Script.from({
    codeHash: eventTreasuryLock.codeHash,
    hashType: eventTreasuryLock.hashType,
    args: argsHex,
  });
}

export function getEventTreasuryDeps(): ccc.CellDep[] {
  assertEventEngineConfigured();
  return [toCellDep(eventTreasuryLock)];
}

/** Participant type — args = event_type_hash || event_id || player_lock_hash (96 bytes). */
export function getParticipantTypeScriptFor(argsHex: string): ccc.Script {
  assertEventEngineConfigured();
  return ccc.Script.from({
    codeHash: participantType.codeHash,
    hashType: participantType.hashType,
    args: argsHex,
  });
}

export function getParticipantDeps(): ccc.CellDep[] {
  assertEventEngineConfigured();
  return [toCellDep(participantType)];
}

/** Event reward claim type — args = event_type_hash || event_id (64 bytes). */
export function getEventRewardClaimTypeScriptFor(argsHex: string): ccc.Script {
  assertEventEngineConfigured();
  return ccc.Script.from({
    codeHash: eventRewardClaimType.codeHash,
    hashType: eventRewardClaimType.hashType,
    args: argsHex,
  });
}

export function getEventRewardClaimDeps(): ccc.CellDep[] {
  assertEventEngineConfigured();
  return [toCellDep(eventRewardClaimType)];
}

export function getEventEngineCellDeps(): ccc.CellDep[] {
  assertEventEngineConfigured();
  return [
    toCellDep(eventCellType),
    toCellDep(participantType),
    toCellDep(eventTreasuryLock),
    toCellDep(eventRewardClaimType),
  ];
}
