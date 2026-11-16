/**
 * After `ckb-cli deploy apply-txs`, prints the NEXT_PUBLIC_SD_* block for .env.local and Vercel from
 * the newest migration in scripts/sudden-death/deployment/testnet/rally/migrations. Read-only.
 *
 *   pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../sudden-death/deployment/testnet/rally/migrations');
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
  throw new Error(`${newest} has no ${name}`);
};

const live = cell('live-match');
if (!live.type_id) throw new Error('live-match was deployed without a type id');
const rally = cell('rally');
console.log(
  [
    `# Crown Rally on Pudge testnet, from ${newest}`,
    'NEXT_PUBLIC_CKB_NETWORK=testnet',
    `NEXT_PUBLIC_SD_LIVE_CODE_HASH=${live.type_id}`,
    'NEXT_PUBLIC_SD_LIVE_HASH_TYPE=type',
    'NEXT_PUBLIC_SD_LIVE_ARGS=0x',
    `NEXT_PUBLIC_SD_LIVE_TX_HASH=${live.tx_hash}`,
    `NEXT_PUBLIC_SD_LIVE_INDEX=0x${live.index.toString(16)}`,
    'NEXT_PUBLIC_SD_LIVE_DEP_TYPE=code',
    `NEXT_PUBLIC_SD_RALLY_CODE_HASH=${rally.data_hash}`,
    `NEXT_PUBLIC_SD_RALLY_TX_HASH=${rally.tx_hash}`,
    `NEXT_PUBLIC_SD_RALLY_INDEX=0x${rally.index.toString(16)}`,
    `NEXT_PUBLIC_SD_PROXY_TX_HASH=${PROXY}`,
    'NEXT_PUBLIC_SD_PROXY_INDEX=0x0',
    '# From `pnpm relay --whoami`, and where the relay is hosted:',
    'NEXT_PUBLIC_RALLY_RELAY_LOCK_HASH=',
    'NEXT_PUBLIC_RALLY_RELAY_URL=',
  ].join('\n'),
);
