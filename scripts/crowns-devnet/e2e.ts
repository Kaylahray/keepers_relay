/**
 * End to end on a local devnet, through the app's own chain code (`lib/crown/chain.ts`) and the
 * browser's wasm build of the game. Three devnet accounts: a host, player A, player B.
 *
 *   offckb node
 *   pnpm exec tsx scripts/crowns-devnet/deploy.ts
 *   pnpm exec tsx scripts/crowns-devnet/e2e.ts
 *
 * Checks, against the chain after each step: a crown opens with the game recorded; entries lock;
 * A's run takes it; B's inflated claim is refused; B's better run takes it; A replaying B's
 * winning run is refused on chain; an early refund is refused; the close pays B the pot.
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devnetClient, HERE, loadDevnetEnv, signerFor, waitCommitted } from './devnet';

loadDevnetEnv();

type Chain = typeof import('@/lib/crown/chain');
type Codec = typeof import('@/lib/sudden-death/codec');
type Rooms = typeof import('@/lib/crown/rooms');

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function rejectedWith(task: Promise<unknown>, code: string): Promise<string> {
  try {
    await task;
    return 'accepted';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(code) ? code : message.slice(0, 160);
  }
}

async function main() {
  const chain: Chain = await import('@/lib/crown/chain');
  const codec: Codec = await import('@/lib/sudden-death/codec');
  const rooms: Rooms = await import('@/lib/crown/rooms');
  const { loadLaneRunner } = await import('@/lib/game/lane-runner');
  const game = await loadLaneRunner(readFileSync(join(HERE, '../../public/games/lane-runner.wasm')));

  const client = devnetClient();
  const host = signerFor(client, 0);
  const playerA = signerFor(client, 1);
  const playerB = signerFor(client, 2);
  const lockA = (await playerA.getRecommendedAddressObj()).script;
  const lockB = (await playerB.getRecommendedAddressObj()).script;
  const fee = 100n * 100_000_000n;

  const liveMatch = async (point: { txHash: string; index: string }) => {
    const cell = await client.getCellLive(point, true);
    if (!cell) throw new Error('match cell is not live');
    return codec.decodeMatchCell(codec.hexToBytes(cell.outputData));
  };

  /** Best of a few hundred tapes on this course: a stand-in for a player trying until they win. */
  const bestRun = (seed: bigint, tries = 400) => {
    let best = { tape: new Uint8Array(), score: game.replay(seed, new Uint8Array()) ?? 0 };
    let state = Number(seed & 0xffffn) + 1;
    const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < tries; t += 1) {
      const bytes: number[] = [];
      let tick = 5 + Math.floor(rand() * 40);
      let lane = 1;
      while (tick < 3600 && bytes.length < 600) {
        const next = (lane + 1 + Math.floor(rand() * 2)) % 3;
        bytes.push(tick & 0xff, tick >> 8, next);
        lane = next;
        tick += 6 + Math.floor(rand() * 60);
      }
      const tape = Uint8Array.from(bytes);
      const score = game.replay(seed, tape) ?? -1;
      if (score > best.score) best = { tape, score };
    }
    return best;
  };

  console.log('\nOpen');
  let room: import('@/lib/crown/rooms').CrownRoom = {
    ...rooms.FLOOR_CROWN,
    id: 'crown-devnet',
    feeShannons: fee,
    durationMs: 60_000,
    status: 'lobby',
    round: 0,
    potShannons: 0n,
    king: null,
    kingScore: 0,
    openedAt: null,
    deadlineAt: null,
    feed: [],
    seals: [],
    matchId: null,
    hostLockHash: null,
    hostLock: null,
    matchOutPoint: null,
    treasuryOutPoint: null,
    bidOutPoint: null,
    kingLock: null,
    hostAddress: null,
  };
  room = await chain.openMatch(host, room);
  await waitCommitted(client, room.matchOutPoint!.txHash, 'open');
  let cell = await liveMatch(room.matchOutPoint!);
  check(cell.round === 1 && cell.kingScore === 0n, 'match cell opens at round 1 with no score to beat');
  check(codec.bytesToHex(cell.game) === process.env.NEXT_PUBLIC_SD_GAME_CODE_HASH, 'match cell records the lane-runner game');

  console.log('\nEntries');
  const roomA = await chain.lockBid(playerA, room);
  await waitCommitted(client, roomA.bidOutPoint!.txHash, 'A entry');
  const roomB = await chain.lockBid(playerB, room);
  await waitCommitted(client, roomB.bidOutPoint!.txHash, 'B entry');
  const refundAt = await chain.bidRefundAt(client, roomA.bidOutPoint!);
  check(refundAt === Number(cell.deadlineMs) + codec.REFUND_GRACE_MS, 'entry records its refund time: deadline + 1 hour');

  console.log('\nA takes the crown');
  const seedA = codec.runSeed(room.matchId!, lockA.hash());
  const runA = { tape: new Uint8Array(), score: game.replay(seedA, new Uint8Array())! };
  const stolenA = await chain.stealCrown(client, roomA, runA);
  await waitCommitted(client, stolenA.txHash, 'A steal');
  cell = await liveMatch(stolenA.room.matchOutPoint!);
  check(codec.bytesToHex(cell.king) === lockA.hash(), 'A is king');
  check(cell.kingScore === BigInt(runA.score), `king score is A's run`, `${runA.score}`);
  check(cell.round === 2 && cell.pot === fee, 'round 2, pot holds one fee');
  room = { ...room, matchOutPoint: stolenA.room.matchOutPoint, treasuryOutPoint: stolenA.room.treasuryOutPoint };

  console.log('\nB claims more than B scored');
  const seedB = codec.runSeed(room.matchId!, lockB.hash());
  const runB = bestRun(seedB);
  check(runB.score > runA.score, 'B found a run that beats A', `${runB.score} > ${runA.score}`);
  const inflated = await rejectedWith(
    chain.stealCrown(client, { ...room, bidOutPoint: roomB.bidOutPoint }, { tape: runB.tape, score: runB.score + 7 }),
    'error code -12',
  );
  check(inflated === 'error code -12', 'chain refuses an inflated score (-12)', inflated);

  console.log('\nB takes the crown');
  const stolenB = await chain.stealCrown(client, { ...room, bidOutPoint: roomB.bidOutPoint }, runB);
  await waitCommitted(client, stolenB.txHash, 'B steal');
  cell = await liveMatch(stolenB.room.matchOutPoint!);
  check(codec.bytesToHex(cell.king) === lockB.hash(), 'B is king');
  check(cell.kingScore === BigInt(runB.score) && cell.round === 3 && cell.pot === fee * 2n, 'B score recorded, round 3, pot holds two fees');
  room = { ...room, matchOutPoint: stolenB.room.matchOutPoint, treasuryOutPoint: stolenB.room.treasuryOutPoint };

  console.log('\nA replays B’s winning run');
  const roomA2 = await chain.lockBid(playerA, room);
  await waitCommitted(client, roomA2.bidOutPoint!.txHash, 'A second entry');
  const onACourse = game.replay(seedA, runB.tape);
  const copied = await rejectedWith(
    chain.stealCrown(client, roomA2, { tape: runB.tape, score: runB.score + 1 }),
    'error code -12',
  );
  check(copied === 'error code -12', 'chain refuses a copied run (-12)', `on A's course it scores ${onACourse}`);

  console.log('\nEarly refund');
  const early = await rejectedWith(chain.expireBid(client, roomA2.bidOutPoint!), 'Immature');
  check(early === 'Immature', 'an entry cannot be refunded before its refund time', early);

  console.log('\nClose');
  check(Number(cell.deadlineMs) <= Date.now(), 'two steals have cut the 4-minute clock to zero', `${cell.deadlineMs}`);
  const before = await client.getBalance([lockB]);
  const closed = await chain.closeCrown(host, room);
  await waitCommitted(client, closed.txHash, 'close');
  const after = await client.getBalance([lockB]);
  check(after - before === fee * 2n, 'close pays B the pot', `${ccc.fixedPointToString(after - before)} CKB`);
  check((await client.getCellLive(room.matchOutPoint!, false)) == null, 'match cell is gone');
  const leftover = await client.getCellLive(roomA2.bidOutPoint!, false);
  check(leftover == null, 'A’s unused entry was refunded by the close');

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
