/**
 * After `ckb-cli deploy apply-txs`, prints the NEXT_PUBLIC_SD_* block for .env.local and Vercel from
 * the newest migration in scripts/sudden-death/deployment/testnet-v5/crowns/migrations (or the
 * version named as the first argument). Read-only.
 *
 *   pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts        # v5, with Duels
 *   pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts v4
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = process.argv[2] ?? 'v5';
const dirFor = (version: string) => join(__dirname, `../sudden-death/deployment/testnet-${version}/crowns/migrations`);
const DIR = dirFor(VERSION);
const PROXY = '0xa5ef4970ba0a4446b9cd8abb3b650cdfb68bcdf5052966e41384900a8a5ad274';

type Recipe = { name: string; tx_hash: string; index: number; data_hash: string; type_id: string | null };

function newestRecipes(dir: string): { file: string; recipes: Recipe[] } {
  const files = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const file = files.at(-1);
  if (!file) {
    console.error(`No migration in ${dir}. Run ckb-cli deploy apply-txs first.`);
    process.exit(1);
  }
  return { file, recipes: (JSON.parse(readFileSync(join(dir, file), 'utf8')) as { cell_recipes: Recipe[] }).cell_recipes };
}

const { file: newest, recipes } = newestRecipes(DIR);
const cell = (name: string) => {
  const found = recipes.find((recipe) => recipe.name === name);
  if (found) return found;
  // A version that did not redeploy the game uses the last one that did: games are referenced by data
  // hash. v5's lane runner is v4's cell (v2's code cells are retired).
  if (name === 'lane-runner' && VERSION !== 'v2') {
    const earlier = newestRecipes(dirFor(VERSION === 'v4' ? 'v2' : 'v4')).recipes.find((recipe) => recipe.name === name);
    if (earlier) return earlier;
  }
  throw new Error(`${newest} has no ${name}`);
};

const lines = [`# Crowns ${VERSION} on Pudge testnet, from ${newest}`, 'NEXT_PUBLIC_CKB_NETWORK=testnet'];
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
// Duels arrived in v5: the escrow script by type id, the artillery game by data hash.
if (recipes.some((recipe) => recipe.name === 'duel-type')) {
  const duel = cell('duel-type');
  if (!duel.type_id) throw new Error('duel-type was deployed without a type id');
  const artillery = cell('artillery');
  lines.push(
    `NEXT_PUBLIC_SD_DUEL_CODE_HASH=${duel.type_id}`,
    'NEXT_PUBLIC_SD_DUEL_HASH_TYPE=type',
    'NEXT_PUBLIC_SD_DUEL_ARGS=0x',
    `NEXT_PUBLIC_SD_DUEL_TX_HASH=${duel.tx_hash}`,
    `NEXT_PUBLIC_SD_DUEL_INDEX=0x${duel.index.toString(16)}`,
    'NEXT_PUBLIC_SD_DUEL_DEP_TYPE=code',
    `NEXT_PUBLIC_SD_ARTILLERY_CODE_HASH=${artillery.data_hash}`,
    `NEXT_PUBLIC_SD_ARTILLERY_TX_HASH=${artillery.tx_hash}`,
    `NEXT_PUBLIC_SD_ARTILLERY_INDEX=0x${artillery.index.toString(16)}`,
  );
}
console.log(lines.join('\n'));
