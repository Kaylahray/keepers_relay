/**
 * Deploys the v2 Crowns scripts to a local OffCKB devnet and writes `.env.devnet`.
 *
 *   offckb node                                   # in another terminal
 *   pnpm exec tsx scripts/crowns-devnet/deploy.ts
 *
 * Code cells are referenced by data hash with hash type data2 (CKB-VM v2, which match-type needs
 * to spawn the game). Testnet uses type-id cells instead; the app reads whichever the env names.
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { devnetClient, ENV_FILE, HERE, RPC_URL, signerFor, waitCommitted } from './devnet';

const BUILD = join(HERE, '../sudden-death/build/release');
const PROXY_DATA1_HASH = '0x5123908965c711b0ffd8aec642f1ede329649bda1ebdca6bd24124d3796f768a';

const CELLS = [
  { key: 'MATCH', file: join(BUILD, 'match-type') },
  { key: 'BID', file: join(BUILD, 'bid-type') },
  { key: 'TREASURY', file: join(BUILD, 'treasury-lock') },
  { key: 'GAME', file: join(BUILD, 'lane-runner') },
  { key: 'PROXY', file: join(HERE, '../sudden-death/tests/bin/input-type-proxy-lock') },
] as const;

async function main() {
  const client = devnetClient();
  const signer = signerFor(client, 0);
  const lock = (await signer.getRecommendedAddressObj()).script;
  const env: string[] = [
    '# Written by scripts/crowns-devnet/deploy.ts. Local OffCKB devnet only.',
    'NEXT_PUBLIC_CKB_NETWORK=devnet',
    `NEXT_PUBLIC_CKB_RPC_URL=${RPC_URL}`,
  ];

  for (const cell of CELLS) {
    const binary = readFileSync(cell.file);
    const dataHash = ccc.hashCkb(binary);
    if (cell.key === 'PROXY' && dataHash !== PROXY_DATA1_HASH) {
      throw new Error(`Proxy lock binary hashes to ${dataHash}, not the ${PROXY_DATA1_HASH} the scripts expect.`);
    }
    const tx = ccc.Transaction.from({ outputs: [{ lock }], outputsData: [ccc.hexFrom(binary)] });
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);
    const txHash = await signer.sendTransaction(tx);
    await waitCommitted(client, txHash, `${cell.key} deploy`);
    console.log(`${cell.key.padEnd(8)} ${binary.length.toString().padStart(6)} B  data hash ${dataHash}  ${txHash}:0`);

    const prefix = `NEXT_PUBLIC_SD_${cell.key}`;
    env.push(`${prefix}_TX_HASH=${txHash}`, `${prefix}_INDEX=0x0`);
    if (cell.key !== 'PROXY') {
      env.push(`${prefix}_CODE_HASH=${dataHash}`);
      if (cell.key !== 'GAME') env.push(`${prefix}_HASH_TYPE=data2`, `${prefix}_DEP_TYPE=code`, `${prefix}_ARGS=0x`);
    }
  }

  writeFileSync(ENV_FILE, `${env.join('\n')}\n`);
  console.log(`\nWrote ${ENV_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
