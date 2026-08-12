import { ccc } from '@ckb-ccc/core';
import { getServerCkbClient } from './server-client';
import {
  bytesToHex,
  decodeChainCellData,
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
};

function chainCellTypeFromEnv(): ccc.Script | null {
  const codeHash = process.env.NEXT_PUBLIC_CHAIN_CELL_CODE_HASH?.trim();
  if (!codeHash || codeHash.length < 4) return null;
  const hashType = process.env.NEXT_PUBLIC_CHAIN_CELL_HASH_TYPE?.trim();
  return ccc.Script.from({
    codeHash,
    hashType:
      hashType === 'data' || hashType === 'data1' || hashType === 'data2'
        ? hashType
        : 'type',
    args: process.env.NEXT_PUBLIC_CHAIN_CELL_ARGS?.trim() || '0x',
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
  };
}

/** Live Chain Cells from the CKB indexer (type script = our Chain Cell). */
export async function loadLiveChainCells(): Promise<IndexedChainCell[]> {
  const type = chainCellTypeFromEnv();
  if (!type) return [];

  const client = getServerCkbClient();
  const found: IndexedChainCell[] = [];
  for await (const cell of client.findCellsByType(type, true, 'desc', 200)) {
    try {
      const decoded = decodeChainCellData(new Uint8Array(ccc.bytesFrom(cell.outputData)));
      found.push(toIndexed(cell, decoded, client.addressPrefix));
    } catch {
      continue;
    }
  }
  return found;
}
