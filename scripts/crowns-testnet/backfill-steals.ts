/**
 * Fills keepers_crown_steals from the chain for every crown played so far. The first profile view
 * does the same on its own; this is for running it once by hand after deploying. Safe to repeat:
 * it only reads the chain and skips steals it already has.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/crowns-testnet/backfill-steals.ts
 */
import { syncStealHistory } from '@/lib/server/crown-history';

syncStealHistory()
  .then(({ scanned, added }) => console.log(`Read ${scanned} crowns from chain, added ${added} steals.`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
