"use client";

import { ccc } from "@ckb-ccc/connector-react";
import {
  assertRewardClaimsConfigured,
  assertRegistryConfigured,
  assertSuddenDeathConfigured,
  assertSudtConfigured,
  ckbJsVm,
  profileType,
  rewardClaimType,
  rewardTreasuryLock,
  suddenDeathBidType,
  suddenDeathMatchType,
  suddenDeathProxyLock,
  suddenDeathTreasuryLock,
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

export function getSuddenDeathCellDeps(): ccc.CellDep[] {
  assertSuddenDeathConfigured();
  return [
    toCellDep(suddenDeathMatchType),
    toCellDep(suddenDeathBidType),
    toCellDep(suddenDeathTreasuryLock),
    toCellDep(suddenDeathProxyLock),
  ];
}

/** Proxy lock. Args are exactly the 32-byte match type hash. Hash type is data1. */
export function getSuddenDeathProxyLock(matchTypeHashHex: string): ccc.Script {
  assertSuddenDeathConfigured();
  return ccc.Script.from({
    codeHash: suddenDeathProxyLock.codeHash,
    hashType: suddenDeathProxyLock.hashType,
    args: matchTypeHashHex,
  });
}

/** Match type for one room. Args are 64 bytes: type id, then the host lock hash. */
export function getSuddenDeathMatchScript(matchArgsHex: string): ccc.Script {
  assertSuddenDeathConfigured();
  return ccc.Script.from({
    codeHash: suddenDeathMatchType.codeHash,
    hashType: suddenDeathMatchType.hashType,
    args: matchArgsHex,
  });
}

/** Bid type. Args are 64 bytes: match type hash, then the owner lock hash. */
export function getSuddenDeathBidScript(matchTypeHashHex: string, ownerLockHashHex: string): ccc.Script {
  assertSuddenDeathConfigured();
  const args = new Uint8Array(64);
  args.set(ccc.bytesFrom(matchTypeHashHex), 0);
  args.set(ccc.bytesFrom(ownerLockHashHex), 32);
  return ccc.Script.from({
    codeHash: suddenDeathBidType.codeHash,
    hashType: suddenDeathBidType.hashType,
    args: ccc.hexFrom(args),
  });
}

/** Treasury lock. Args are the match type hash. */
export function getSuddenDeathTreasuryScript(matchTypeHashHex: string): ccc.Script {
  assertSuddenDeathConfigured();
  return ccc.Script.from({
    codeHash: suddenDeathTreasuryLock.codeHash,
    hashType: suddenDeathTreasuryLock.hashType,
    args: matchTypeHashHex,
  });
}
