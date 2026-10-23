/**
 * Reads .env.local the way the app does and checks the Crowns config against the chain: the app
 * sees itself as configured, every cell dep is live, each type-id code hash matches its cell's type
 * script, and the game cell's data hash is the one the match cell will record. Read-only.
 *
 *   pnpm exec tsx scripts/crowns-testnet/check-config.ts
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

for (const line of readFileSync(join(__dirname, '../../.env.local'), 'utf8').split(/\r?\n/)) {
  const match = /^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) process.env[match[1]!] = match[2]!;
}

async function main() {
  const config = await import('@/lib/registry/config');
  const { getSuddenDeathCellDeps } = await import('@/lib/crown/scripts');
  const client = new ccc.ClientPublicTestnet({ url: config.rpcUrl });
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
    if (!ok) failures += 1;
  };

  check(config.network === 'testnet', `network is testnet (${config.rpcUrl})`);
  check(config.suddenDeathConfigured(), 'app sees Crowns as configured (not practice mode)');

  const named = [
    ['match-type', config.suddenDeathMatchType],
    ['bid-type', config.suddenDeathBidType],
    ['treasury-lock', config.suddenDeathTreasuryLock],
    ['proxy-lock', config.suddenDeathProxyLock],
    ['lane-runner', config.suddenDeathGame],
  ] as const;
  const deps = getSuddenDeathCellDeps();
  for (const [index, [name, script]] of named.entries()) {
    const cell = await client.getCellLive(deps[index]!.outPoint, true);
    if (!cell) {
      check(false, `${name}: cell dep is live`);
      continue;
    }
    const dataHash = ccc.hashCkb(cell.outputData);
    if (script.hashType === 'type') {
      check(cell.cellOutput.type?.hash() === script.codeHash, `${name}: live, type id ${script.codeHash.slice(0, 10)}… matches its cell`);
    } else {
      check(dataHash === script.codeHash, `${name}: live, data hash ${script.codeHash.slice(0, 10)}… matches its cell`);
    }
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nConfig is good.');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
