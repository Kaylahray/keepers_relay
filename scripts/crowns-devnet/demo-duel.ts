/**
 * Leaves a live artillery duel on the devnet for looking at the duel page: opened, accepted, and a
 * couple of shots in. Prints its link.
 *
 *   pnpm exec tsx scripts/crowns-devnet/demo-duel.ts
 */
import { devnetClient, loadDevnetEnv, signerFor, waitCommitted } from './devnet';

loadDevnetEnv();

async function main() {
  const duels = await import('@/lib/duel/chain');
  const codec = await import('@/lib/duel/codec');
  const crown = await import('@/lib/crown/chain');
  const client = devnetClient();
  const challenger = signerFor(client, 0);
  const opponent = signerFor(client, 1);
  const lockO = (await opponent.getRecommendedAddressObj()).script;
  const keyC = await crown.newSessionKey(client);
  const keyO = await crown.newSessionKey(client);
  const opened = await duels.openDuel(challenger, {
    kind: codec.KIND_ARTILLERY,
    stake: 25n * 100_000_000n,
    timerMs: 24n * 60n * 60n * 1000n,
    opponentLockHash: lockO.hash(),
    session: keyC,
  });
  await waitCommitted(client, opened.point.txHash, 'open');
  let point = await duels.acceptDuel(opponent, opened.point, keyO);
  await waitCommitted(client, point.txHash, 'accept');
  point = await duels.fireShot(client, point, keyC.secret, { angle: 50, power: 72 });
  await waitCommitted(client, point.txHash, 'shot 1');
  point = await duels.fireShot(client, point, keyO.secret, { angle: 128, power: 66 });
  await waitCommitted(client, point.txHash, 'shot 2');
  console.log(`DUEL ${opened.duelId}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
