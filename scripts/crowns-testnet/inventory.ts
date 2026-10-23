/**
 * Lists the deployer's non-plain cells on testnet (code cells and anything with data or a type),
 * and marks the ones .env.local still points at. Read-only.
 *
 *   DEPLOYER_ADDRESS=ckt1... pnpm exec tsx scripts/crowns-testnet/inventory.ts
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev' });
  const address = await ccc.Address.fromString(process.env.DEPLOYER_ADDRESS ?? '', client);
  const env = readFileSync(join(__dirname, '../../.env.local'), 'utf8');
  const used = new Map<string, string>();
  for (const line of env.split(/\r?\n/)) {
    const match = /^(NEXT_PUBLIC_[A-Z0-9_]+_TX_HASH)=(0x[0-9a-fA-F]{64})/.exec(line.trim());
    if (match) used.set(match[2]!.toLowerCase(), match[1]!.replace(/^NEXT_PUBLIC_|_TX_HASH$/g, ''));
  }
  let plain = 0n;
  let locked = 0n;
  const rows: string[] = [];
  for await (const cell of client.findCellsByLock(address.script, null, true)) {
    const cap = cell.cellOutput.capacity;
    if (!cell.cellOutput.type && cell.outputData === '0x') {
      plain += cap;
      continue;
    }
    locked += cap;
    const tx = cell.outPoint.txHash.toLowerCase();
    const size = (cell.outputData.length - 2) / 2;
    rows.push(
      `${ccc.fixedPointToString(cap).padStart(12)} CKB  ${String(size).padStart(6)} B  ${cell.cellOutput.type ? 'typed' : 'data '}  ${tx}:${Number(cell.outPoint.index)}  ${used.get(tx) ?? '— not in .env.local'}`,
    );
  }
  console.log(rows.join('\n'));
  console.log(`\nplain (spendable) ${ccc.fixedPointToString(plain)} CKB · in other cells ${ccc.fixedPointToString(locked)} CKB`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
