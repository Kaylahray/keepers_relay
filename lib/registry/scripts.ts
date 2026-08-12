"use client";

import { ccc } from "@ckb-ccc/connector-react";
import {
  assertChainCellConfigured,
  assertRewardClaimsConfigured,
  assertRegistryConfigured,
  assertSudtConfigured,
  chainCellType,
  ckbJsVm,
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

export function getChainCellDeps(): ccc.CellDep[] {
  assertChainCellConfigured();
  return [toCellDep(chainCellType)];
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
