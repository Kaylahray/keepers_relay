/**
 * End to end on a local devnet, through the app's own chain code (`lib/crown/chain.ts`) and the
 * browser's wasm build of the game. Three devnet accounts: a host, player A, player B.
 *
 *   offckb node
 *   pnpm exec tsx scripts/crowns-devnet/deploy.ts
 *   pnpm exec tsx scripts/crowns-devnet/e2e.ts
 *
 * Checks, against the chain after each step: a crown opens with the game recorded; entries lock
 * with a session key; A seals a lap and takes it; B seals five laps, each seeded by the block the
 * previous seal landed in; B's inflated claim is refused; B's better run takes it; A replaying B's
 * winning run is refused on chain; an early refund is refused. B stole after the clock ran out, so
 * the close, sent by A with no signature, pays A: the last king whose steal landed in time.
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

  const LAP = 720;
  /**
   * The best of a few hundred tries at one lap, after the laps already sealed: a stand-in for a
   * player practising a lap until they're happy, then sealing it.
   */
  const bestLap = (seeds: bigint[], done: Uint8Array[], tries = 300) => {
    const lap = done.length;
    const score = (tape: Uint8Array) => game.replayLaps([...done, tape].map((t, i) => ({ seed: seeds[i]!, tape: t }))) ?? -1;
    let best = { tape: new Uint8Array(), score: score(new Uint8Array()) };
    let state = Number(seeds[lap]! & 0xffffn) + 1;
    const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < tries; t += 1) {
      const bytes: number[] = [];
      let tick = lap * LAP + Math.floor(rand() * 30);
      let lane = 1;
      while (tick < (lap + 1) * LAP) {
        const next = (lane + 1 + Math.floor(rand() * 2)) % 3;
        bytes.push(tick & 0xff, tick >> 8, next);
        lane = next;
        tick += 6 + Math.floor(rand() * 50);
      }
      const tape = Uint8Array.from(bytes);
      const got = score(tape);
      if (got > best.score) best = { tape, score: got };
    }
    return best;
  };

  /**
   * Plays and seals `count` laps on an entry, lap by lap: each lap's road only exists once the
   * previous seal has landed. Returns the run and where the entry now is.
   */
  const playLaps = async (
    lock: ccc.Script,
    session: string,
    entry: { txHash: string; index: string },
    count: number,
    label: string,
    tries = 300,
  ) => {
    const seeds: bigint[] = [];
    const tapes: Uint8Array[] = [];
    const laps: { block: Uint8Array; tape: Uint8Array }[] = [];
    let point = entry;
    let score = 0;
    for (let k = 0; k < count; k += 1) {
      const next = (await chain.entryLap(client, room.matchId!, lock.hash(), point))!;
      seeds.push(next.seed);
      const best = bestLap(seeds, tapes, tries);
      tapes.push(best.tape);
      laps.push({ block: codec.hexToBytes(next.block), tape: best.tape });
      score = best.score;
      point = await chain.sealLap(client, point, session as `0x${string}`, best.tape);
      await waitCommitted(client, point.txHash, `${label} lap ${k + 1} seal`);
    }
    return { run: { laps, score }, point, seeds };
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
  const sessionA = await chain.newSessionKey(client);
  const sessionB = await chain.newSessionKey(client);
  const roomA = await chain.lockBid(playerA, room, sessionA);
  await waitCommitted(client, roomA.bidOutPoint!.txHash, 'A entry');
  const roomB = await chain.lockBid(playerB, room, sessionB);
  await waitCommitted(client, roomB.bidOutPoint!.txHash, 'B entry');
  const refundAt = await chain.bidRefundAt(client, roomA.bidOutPoint!);
  check(refundAt === Number(cell.deadlineMs) + codec.REFUND_GRACE_MS, 'entry records its refund time: deadline + 1 hour');
  // Each entry carries proof of work for its own transaction, at the difficulty the crown asks for.
  const entryCell = (await client.getCellLive(roomA.bidOutPoint!, true))!;
  const entryTx = (await client.getTransaction(roomA.bidOutPoint!.txHash))!.transaction;
  const nonce = new DataView(codec.hexToBytes(entryCell.outputData).buffer).getBigUint64(9, true);
  const work = codec.powBits(
    codec.hexToBytes((await client.getCellLive(room.matchOutPoint!, false))!.cellOutput.type!.hash()),
    codec.hexToBytes(lockA.hash()),
    entryTx.inputs[0]!.previousOutput.toBytes(),
    nonce,
  );
  check(cell.powBits === codec.DEFAULT_POW_BITS && work >= cell.powBits, 'A’s entry carries proof of work', `${work} of ${cell.powBits} bits`);

  // Lap 1's road only appears once the entry has landed: the seed folds in that block.
  const lapA = (await chain.entryLap(client, room.matchId!, lockA.hash(), roomA.bidOutPoint!))!;
  const lapB = (await chain.entryLap(client, room.matchId!, lockB.hash(), roomB.bidOutPoint!))!;
  check(lapA.sealed === 0 && lapA.seed !== lapB.seed, 'A and B get different first laps, each from its own entry block');

  console.log('\nA plays one lap and takes the crown');
  // A tries their one lap only a few times, so B's practised five laps beat it.
  const playedA = await playLaps(lockA, sessionA.secret, roomA.bidOutPoint!, 1, 'A', 10);
  const sealedA = codec.decodeEntryRun(codec.hexToBytes((await client.getCellLive(playedA.point, true))!.outputData));
  check(sealedA.laps === 1, 'A’s entry holds one sealed lap, sealed through A’s key cell with no wallet');
  const runA = playedA.run;
  const stolenA = await chain.stealCrown(client, { ...roomA, bidOutPoint: playedA.point }, runA);
  await waitCommitted(client, stolenA.txHash, 'A steal');
  cell = await liveMatch(stolenA.room.matchOutPoint!);
  check(codec.bytesToHex(cell.king) === lockA.hash(), 'A is king');
  check(cell.kingScore === BigInt(runA.score), `king score is A's run`, `${runA.score}`);
  check(cell.round === 2 && cell.pot === fee, 'round 2, pot holds one fee');
  room = { ...room, matchOutPoint: stolenA.room.matchOutPoint, treasuryOutPoint: stolenA.room.treasuryOutPoint };
  // A's run is over, so A's key cell goes back to A, signed by the session key.
  const beforeKeyA = await client.getBalance([lockA]);
  const keyBack = await chain.returnKeyCell(client, sessionA.secret, lockA);
  await waitCommitted(client, keyBack!, 'A key cell return');
  const keyGain = (await client.getBalance([lockA])) - beforeKeyA;
  check(keyGain > 61n * 100_000_000n, 'A’s key cell came back to A after the run', `${ccc.fixedPointToString(keyGain)} CKB`);

  console.log('\nB plays five laps, each seeded by the block the last one was sealed in');
  const playedB = await playLaps(lockB, sessionB.secret, roomB.bidOutPoint!, 5, 'B');
  const runB = playedB.run;
  check(new Set(playedB.seeds.map(String)).size === 5, 'every lap had its own road');
  check(runB.score > runA.score, 'B’s five laps beat A', `${runB.score} > ${runA.score}`);
  const inflated = await rejectedWith(
    chain.stealCrown(client, { ...room, bidOutPoint: playedB.point }, { laps: runB.laps, score: runB.score + 7 }),
    'error code -12',
  );
  check(inflated === 'error code -12', 'chain refuses an inflated score (-12)', inflated);

  console.log('\nB takes the crown');
  const stolenB = await chain.stealCrown(client, { ...room, bidOutPoint: playedB.point }, runB);
  await waitCommitted(client, stolenB.txHash, 'B steal');
  cell = await liveMatch(stolenB.room.matchOutPoint!);
  check(codec.bytesToHex(cell.king) === lockB.hash(), 'B is king');
  check(cell.kingScore === BigInt(runB.score) && cell.round === 3 && cell.pot === fee * 2n, 'B score recorded, round 3, pot holds two fees');
  // A's steal cut the short devnet clock to zero, so B's steal was sent after time was up. It
  // lands, but its postmark can never beat its deadline: A's on-time steal is the one that counts.
  check(codec.bytesToHex(cell.certified) === lockA.hash(), 'A’s on-time steal is certified');
  check(Number(cell.landByMs) < Date.now(), 'B stole after the clock ran out, so B can never be certified');
  room = { ...room, matchOutPoint: stolenB.room.matchOutPoint, treasuryOutPoint: stolenB.room.treasuryOutPoint };

  console.log('\nA replays B’s winning run');
  const sessionA2 = await chain.newSessionKey(client);
  const roomA2 = await chain.lockBid(playerA, room, sessionA2);
  await waitCommitted(client, roomA2.bidOutPoint!.txHash, 'A second entry');
  // A seals B's first-lap moves into A's own entry: they play on A's road, not B's.
  const copiedLap = runB.laps[0]!.tape;
  const lapA2 = (await chain.entryLap(client, room.matchId!, lockA.hash(), roomA2.bidOutPoint!))!;
  const pointA2 = await chain.sealLap(client, roomA2.bidOutPoint!, sessionA2.secret, copiedLap);
  await waitCommitted(client, pointA2.txHash, 'A copied lap seal');
  const onACourse = game.replayLaps([{ seed: lapA2.seed, tape: copiedLap }]);
  const copied = await rejectedWith(
    chain.stealCrown(
      client,
      { ...roomA2, bidOutPoint: pointA2 },
      { laps: [{ block: codec.hexToBytes(lapA2.block), tape: copiedLap }], score: runB.score + 1 },
    ),
    'error code -12',
  );
  check(copied === 'error code -12', 'chain refuses a copied run (-12)', `on A's course it scores ${onACourse}`);

  console.log('\nEarly refund');
  const early = await rejectedWith(chain.expireBid(client, pointA2), 'Immature');
  check(early === 'Immature', 'an entry cannot be refunded before its refund time', early);

  console.log('\nClose');
  check(Number(cell.deadlineMs) <= Date.now(), 'two steals have cut the 4-minute clock to zero', `${cell.deadlineMs}`);
  const entryA = await client.getCellLive(pointA2, false);
  const beforeA = await client.getBalance([lockA]);
  const beforeB = await client.getBalance([lockB]);
  // Nobody signs the close. A sends it, so A's payout also carries the closer's reward.
  const closed = await chain.closeCrown(client, room, lockA.hash());
  await waitCommitted(client, closed.txHash, 'close');
  const gainA = (await client.getBalance([lockA])) - beforeA;
  const owedA = fee * 2n + codec.CLOSER_REWARD + BigInt(entryA?.cellOutput.capacity ?? 0);
  check(gainA === owedA, 'close pays A the pot, A’s spare entry and the closer’s reward', `${ccc.fixedPointToString(gainA)} CKB`);
  check((await client.getBalance([lockB])) === beforeB, 'the late king B gets nothing');
  check((await client.getCellLive(room.matchOutPoint!, false)) == null, 'match cell is gone');
  const leftover = await client.getCellLive(pointA2, false);
  check(leftover == null, 'A’s unused entry was refunded by the close');

  console.log('\nVerify');
  // The independent replay the /verify page runs: every lap of every steal, from the chain alone.
  const { replayMatch } = await import('@/lib/sudden-death/verify');
  const replay = await replayMatch(client, closed.txHash, game);
  check(replay.ok && replay.steals.length === 2, '/verify replays both steals lap by lap and every rule holds');
  check(replay.steals.at(0)?.onTime === true && replay.steals.at(1)?.onTime === false, '/verify shows A landed in time and B late');
  check(replay.winner?.toLowerCase() === lockA.hash().toLowerCase(), '/verify names A as the winner');

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
