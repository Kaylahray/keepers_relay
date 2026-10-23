/**
 * After `ckb-cli deploy apply-txs`, prints the NEXT_PUBLIC_SD_* block for .env.local and Vercel from
 * the newest migration in scripts/sudden-death/deployment/testnet-v2/crowns/migrations. Read-only.
 *
 *   pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../sudden-death/deployment/testnet-v2/crowns/migrations');
const PROXY = '0xa5ef4970ba0a4446b9cd8abb3b650cdfb68bcdf5052966e41384900a8a5ad274';

type Recipe = { name: string; tx_hash: string; index: number; data_hash: string; type_id: string | null };

const files = readdirSync(DIR).filter((name) => name.endsWith('.json')).sort();
const newest = files.at(-1);
if (!newest) {
  console.error(`No migration in ${DIR}. Run ckb-cli deploy apply-txs first.`);
  process.exit(1);
}
const { cell_recipes: recipes } = JSON.parse(readFileSync(join(DIR, newest), 'utf8')) as { cell_recipes: Recipe[] };
const cell = (name: string) => {
  const found = recipes.find((recipe) => recipe.name === name);
  if (!found) throw new Error(`${newest} has no ${name}`);
  return found;
};

const lines = [`# Crowns v2 on Pudge testnet, from ${newest}`, 'NEXT_PUBLIC_CKB_NETWORK=testnet'];
for (const [key, name] of [['MATCH', 'match-type'], ['BID', 'bid-type'], ['TREASURY', 'treasury-lock']] as const) {
  const recipe = cell(name);
  if (!recipe.type_id) throw new Error(`${name} was deployed without a type id`);
  lines.push(
    `NEXT_PUBLIC_SD_${key}_CODE_HASH=${recipe.type_id}`,
    `NEXT_PUBLIC_SD_${key}_HASH_TYPE=type`,
    `NEXT_PUBLIC_SD_${key}_ARGS=0x`,
    `NEXT_PUBLIC_SD_${key}_TX_HASH=${recipe.tx_hash}`,
    `NEXT_PUBLIC_SD_${key}_INDEX=0x${recipe.index.toString(16)}`,
    `NEXT_PUBLIC_SD_${key}_DEP_TYPE=code`,
  );
}
const game = cell('lane-runner');
lines.push(
  `NEXT_PUBLIC_SD_GAME_CODE_HASH=${game.data_hash}`,
  `NEXT_PUBLIC_SD_GAME_TX_HASH=${game.tx_hash}`,
  `NEXT_PUBLIC_SD_GAME_INDEX=0x${game.index.toString(16)}`,
  `NEXT_PUBLIC_SD_PROXY_TX_HASH=${PROXY}`,
  'NEXT_PUBLIC_SD_PROXY_INDEX=0x0',
);
console.log(lines.join('\n'));
