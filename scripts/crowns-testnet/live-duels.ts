/**
 * Lists every duel whose cell is still live on testnet, for the duel script .env.local names: its
 * moves so far and how long ago the last one landed. Read-only. Run it before upgrading the duel
 * scripts: a duel left live on the old ones may not be able to finish.
 *
 *   pnpm exec tsx scripts/crowns-testnet/live-duels.ts
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The app's config reads NEXT_PUBLIC_* from the environment; take them from .env.local.
for (const row of readFileSync(join(__dirname, '../../.env.local'), 'utf8').split(/\r?\n/)) {
  const match = /^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$/.exec(row);
  if (match) process.env[match[1]!] ??= match[2]!.trim();
}

async function main() {
  const { listDuels } = await import('@/lib/duel/chain');
  const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev' });
  const tip = await client.getTipHeader();
  const duels = await listDuels(client, 50);
  if (duels.length === 0) console.log('No live duels.');
  for (const duel of duels) {
    const ago = duel.landed ? Math.round((Number(tip.timestamp) - Number(duel.landed.landedMs)) / 1000) : null;
    const moves = duel.duel.shots.map((shot) => `${shot.angle}°/${shot.power}`).join(' ');
    console.log(
      `${duel.duelId}  ${duel.duel.status === 0 ? 'open' : 'live'}  ${duel.duel.shots.length} moves [${moves}]  last landed ${ago ?? '?'}s ago  at ${duel.point.txHash}`,
    );
  }
}

void main();
