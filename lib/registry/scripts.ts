"use client";

import { ccc } from "@ckb-ccc/connector-react";
import {
  assertRegistryConfigured,
  ckbJsVm,
  profileType,
  type ScriptConfig,
  usernameType,
} from "./config";

// Crowns scripts live in `lib/crown/scripts.ts`, which is core-only so the chain code can run outside a browser.

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
