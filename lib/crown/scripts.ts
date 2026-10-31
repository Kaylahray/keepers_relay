import { ccc } from '@ckb-ccc/core';
import {
  assertSuddenDeathConfigured,
  suddenDeathBidType,
  suddenDeathGame,
  suddenDeathMatchType,
  suddenDeathProxyLock,
  suddenDeathTreasuryLock,
  type ScriptConfig,
} from '@/lib/registry/config';

// Core-only on purpose: the chain code that uses these also runs outside a browser (the devnet end-to-end test), and the React connector cannot load there.

function toCellDep(s: ScriptConfig): ccc.CellDep {
  return ccc.CellDep.from({ outPoint: { txHash: s.outPoint.txHash, index: s.outPoint.index }, depType: s.depType });
}

/** Every code cell a Crowns transaction may run, the game script included. */
export function getSuddenDeathCellDeps(): ccc.CellDep[] {
  assertSuddenDeathConfigured();
  return [
    toCellDep(suddenDeathMatchType),
    toCellDep(suddenDeathBidType),
    toCellDep(suddenDeathTreasuryLock),
    toCellDep(suddenDeathProxyLock),
    toCellDep(suddenDeathGame),
  ];
}

/** Input Type Proxy Lock: unlocks for any transaction with an input whose type hash is `typeHashHex`. */
export function getSuddenDeathProxyLock(typeHashHex: string): ccc.Script {
  assertSuddenDeathConfigured();
  return ccc.Script.from({
    codeHash: suddenDeathProxyLock.codeHash,
    hashType: suddenDeathProxyLock.hashType,
    args: typeHashHex,
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

/** A bid locks to itself, so bid-type alone decides every spend, including after the match is gone. */
export function getSuddenDeathBidLock(bidScript: ccc.Script): ccc.Script {
  return getSuddenDeathProxyLock(bidScript.hash());
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

/** Data hash of the game script, as the match cell records it. */
export function suddenDeathGameHash(): Uint8Array {
  assertSuddenDeathConfigured();
  return ccc.bytesFrom(suddenDeathGame.codeHash);
}
