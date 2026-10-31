/**
 * Lists every crown whose match cell is still live on testnet, for the match script .env.local
 * names (or the code hash passed as the first argument). Read-only. Run it before switching
 * versions: a crown left open on the old scripts can only be closed by the old app.
 *
 *   pnpm exec tsx scripts/crowns-testnet/open-crowns.ts
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, decodeMatchCell, hexToBytes } from '@/lib/sudden-death/codec';

function envValue(name: string): string {
  const env = readFileSync(join(__dirname, '../../.env.local'), 'utf8');
  const line = env.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

async function main() {
  const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev' });
  const codeHash = process.argv[2] ?? envValue('NEXT_PUBLIC_SD_MATCH_CODE_HASH');
  const hashType = (envValue('NEXT_PUBLIC_SD_MATCH_HASH_TYPE') || 'type') as ccc.HashType;
  const script = ccc.Script.from({ codeHash, hashType, args: '0x' });
  const now = Date.now();
  let count = 0;
  for await (const cell of client.findCells({ script, scriptType: 'type', scriptSearchMode: 'prefix', withData: true })) {
    count += 1;
    const args = ccc.bytesFrom(cell.cellOutput.type!.args);
    try {
      const match = decodeMatchCell(hexToBytes(cell.outputData));
      const deadline = Number(match.deadlineMs);
      const king = match.king.every((byte) => byte === 0) ? 'nobody' : bytesToHex(match.king).slice(0, 12);
      console.log(
        `v${match.version}  match ${bytesToHex(args.slice(0, 32)).slice(0, 12)}…  round ${match.round}  ` +
          `pot ${ccc.fixedPointToString(match.pot)} CKB  king ${king}  ` +
          `${deadline <= now ? 'clock ran out' : 'still running'} (${new Date(deadline).toISOString()})  ` +
          `${cell.outPoint.txHash}:${Number(cell.outPoint.index)}`,
      );
    } catch {
      console.log(`unreadable match cell ${cell.outPoint.txHash}:${Number(cell.outPoint.index)}`);
    }
  }
  console.log(count ? `\n${count} open crown(s).` : 'No open crowns.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
