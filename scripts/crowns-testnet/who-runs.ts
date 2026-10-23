/**
 * Before destroying a code cell: does any live cell still run it? Checks the cell's type hash
 * (hash type "type") and its data hash (data, data1, data2), as a lock and as a type. Read-only.
 *
 *   pnpm exec tsx scripts/crowns-testnet/who-runs.ts 0xTX:0 [0xTX:0 ...]
 */
import { ccc } from '@ckb-ccc/core';

async function main() {
  const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev' });
  for (const target of process.argv.slice(2)) {
    const [txHash, index] = target.split(':');
    const cell = await client.getCellLive({ txHash: txHash!, index: Number(index ?? 0) }, true);
    if (!cell) {
      console.log(`${target}  not live`);
      continue;
    }
    const refs: { codeHash: string; hashType: ccc.HashType }[] = [
      { codeHash: ccc.hashCkb(cell.outputData), hashType: 'data' },
      { codeHash: ccc.hashCkb(cell.outputData), hashType: 'data1' },
      { codeHash: ccc.hashCkb(cell.outputData), hashType: 'data2' },
    ];
    if (cell.cellOutput.type) refs.push({ codeHash: cell.cellOutput.type.hash(), hashType: 'type' });
    let total = 0n;
    for (const ref of refs) {
      for (const scriptType of ['lock', 'type'] as const) {
        total += await client.getCellsCapacity({
          script: { ...ref, args: '0x' },
          scriptType,
          scriptSearchMode: 'prefix',
        });
      }
    }
    console.log(`${target}  live cells running it: ${ccc.fixedPointToString(total)} CKB`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
