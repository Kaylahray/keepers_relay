import { ccc } from '@ckb-ccc/core';
import { getServerCkbClient } from './server-client';
import {
  bytesToHex,
  decodeChainCellData,
  CHAIN_FLAG_STAKES,
  type ChainCellData,
} from '@/lib/registry/chain-cell-layout';

export type IndexedChainCell = {
  chainId: string;
  status: number;
  mode: number;
  ownerCount: number;
  expiresAtMs: number;
  windowSeconds: number;
  holderAddress: string;
  outPoint: { txHash: string; index: string };
  /** True when this Cell carries a live stakes schedule. */
  stakes: boolean;
  lineageRoot: string;
  artifactRoot: string;
  creatorLockHash: string;
  potAmount: string;
};

/**
 * The Chain Cell code, with empty args. Every v2 Cell puts its own type-id in
 * `args`, so this is only ever useful as a search prefix — never as an exact
 * script.
 */
function chainCellCodeFromEnv(): ccc.Script | null {
  const codeHash = process.env.NEXT_PUBLIC_CHAIN_CELL_CODE_HASH?.trim();
  if (!codeHash || codeHash.length < 4) return null;
  const hashType = process.env.NEXT_PUBLIC_CHAIN_CELL_HASH_TYPE?.trim();
  return ccc.Script.from({
    codeHash,
    hashType:
      hashType === 'data' || hashType === 'data1' || hashType === 'data2'
        ? hashType
        : 'type',
    args: '0x',
  });
}

function toIndexed(
  cell: ccc.Cell,
  decoded: ChainCellData,
  prefix: string,
): IndexedChainCell {
  const holderAddress = ccc.Address.from({
    script: cell.cellOutput.lock,
    prefix,
  }).toString();
  return {
    chainId: bytesToHex(decoded.chainId),
    status: decoded.status,
    mode: decoded.mode,
    ownerCount: decoded.ownerCount,
    expiresAtMs: Number(decoded.expiresAtMs),
    windowSeconds: decoded.windowSeconds,
    holderAddress,
    outPoint: {
      txHash: cell.outPoint.txHash,
      index:
        typeof cell.outPoint.index === 'bigint'
          ? `0x${cell.outPoint.index.toString(16)}`
          : String(cell.outPoint.index),
    },
    stakes: (decoded.flags & CHAIN_FLAG_STAKES) !== 0,
    lineageRoot: bytesToHex(decoded.lineageRoot),
    artifactRoot: bytesToHex(decoded.artifactRoot),
    creatorLockHash: bytesToHex(decoded.creatorLockHash),
    potAmount: decoded.potAmount.toString(),
  };
}

/**
 * Every Chain Cell the node knows about, read straight from chain state.
 *
 * Matching is a prefix search on the code hash, because each Cell's `args` hold
 * its own type-id. Anything that fails to decode as v2 is skipped rather than
 * throwing — a stray cell wearing the same code must not blind the whole read.
 */
export async function loadLiveChainCells(): Promise<IndexedChainCell[]> {
  const script = chainCellCodeFromEnv();
  if (!script) return [];

  const client = getServerCkbClient();
  const found: IndexedChainCell[] = [];
  for await (const cell of client.findCells(
    { script, scriptType: 'type', scriptSearchMode: 'prefix', withData: true },
    'desc',
    200,
  )) {
    try {
      const decoded = decodeChainCellData(new Uint8Array(ccc.bytesFrom(cell.outputData)));
      found.push(toIndexed(cell, decoded, client.addressPrefix));
    } catch {
      continue;
    }
  }
  return found;
}
