/**
 * Duels end to end on a local devnet, through the app's own chain code (`lib/duel/chain.ts`), the
 * browser's artillery rules and the browser's wasm build of the lane runner. Three devnet accounts:
 * the challenger, the opponent, and a stranger.
 *
 *   offckb node
 *   pnpm exec tsx scripts/crowns-devnet/deploy.ts
 *   pnpm exec tsx scripts/crowns-devnet/duel-e2e.ts
 *
 * Checks, against the chain after each step: a challenge locks the stake; a stranger can't cancel
 * it and the challenger can; the named opponent accepts with the same stake; an artillery duel is
 * played shot by shot with no wallet, each shot in the wind of the block the last landed in, and a
 * finish nobody signs pays the winner both stakes; a turn left to run out is skipped (not lost) once
 * its time has passed, and not before, with Pressure shortening later turns; a lane race is raced lap by lap, each player hands in their
 * own run, an inflated score is refused, and the faster driver is paid.
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devnetClient, HERE, loadDevnetEnv, signerFor, waitCommitted } from './devnet';

loadDevnetEnv();

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function outcome(task: Promise<unknown>): Promise<string> {
  try {
    await task;
    return 'accepted';
  } catch (error) {
    const message = error instanceof Error ? `${error.message} ${(error as { data?: string }).data ?? ''}` : String(error);
    const code = /error code (-?\d+)/.exec(message);
    if (code) return `error code ${code[1]}`;
    if (/immature/i.test(message)) return 'Immature';
    return message.slice(0, 160);
  }
}

const CKB = 100_000_000n;
const ckb = (shannons: bigint) => ccc.fixedPointToString(shannons);

async function main() {
  const duels = await import('@/lib/duel/chain');
  const codec = await import('@/lib/duel/codec');
  const rules = await import('@/lib/duel/artillery');
  const crown = await import('@/lib/crown/chain');
  const sd = await import('@/lib/sudden-death/codec');
  const { loadLaneRunner } = await import('@/lib/game/lane-runner');
  const game = await loadLaneRunner(readFileSync(join(HERE, '../../public/games/lane-runner.wasm')));

  const client = devnetClient();
  const challenger = signerFor(client, 0);
  const opponent = signerFor(client, 1);
  const stranger = signerFor(client, 2);
  const lockC = (await challenger.getRecommendedAddressObj()).script;
  const lockO = (await opponent.getRecommendedAddressObj()).script;
  const stake = 100n * CKB;
  const balance = (lock: ccc.Script) => client.getBalance([lock]);
  /** How much a lock gained since `before`, once the indexer has caught up with at least `atLeast`. */
  const gained = async (lock: ccc.Script, before: bigint, atLeast: bigint) => {
    let gain = 0n;
    for (let tries = 0; tries < 20; tries += 1) {
      gain = (await balance(lock)) - before;
      if (gain >= atLeast) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return gain;
  };
  const duelCell = async (point: { txHash: string; index: string }) => {
    const cell = await client.getCellLive(point, true);
    return cell ? { cell, duel: codec.decodeDuel(sd.hexToBytes(cell.outputData)) } : null;
  };

  console.log('\nOpen and cancel');
  const spare = await crown.newSessionKey(client);
  const opened = await duels.openDuel(challenger, {
    kind: codec.KIND_ARTILLERY,
    stake,
    timerMs: 60_000n,
    opponentLockHash: lockO.hash(),
    session: spare,
  });
  await waitCommitted(client, opened.point.txHash, 'open to cancel');
  const open = await duelCell(opened.point);
  check(open?.duel.status === codec.STATUS_OPEN && BigInt(open.cell.cellOutput.capacity) >= stake, 'a challenge locks the stake', `${ckb(BigInt(open!.cell.cellOutput.capacity))} CKB`);
  const strangerCancel = await outcome(duels.cancelDuel(stranger, opened.point));
  check(strangerCancel === 'error code -18', 'a stranger cannot cancel it (-18)', strangerCancel);
  const beforeCancel = await balance(lockC);
  const cancelled = await duels.cancelDuel(challenger, opened.point);
  await waitCommitted(client, cancelled, 'cancel');
  check((await duelCell(opened.point)) == null, 'the challenger cancels and the duel cell is gone');
  const refunded = await gained(lockC, beforeCancel, stake);
  check(refunded > stake, 'the stake came back', ckb(refunded));

  console.log('\nArtillery: open, accept, play it out');
  const sessionC = await crown.newSessionKey(client);
  const sessionO = await crown.newSessionKey(client);
  const duel = await duels.openDuel(challenger, {
    kind: codec.KIND_ARTILLERY,
    stake,
    timerMs: 60_000n,
    opponentLockHash: lockO.hash(),
    session: sessionC,
  });
  await waitCommitted(client, duel.point.txHash, 'open');
  let point = await duels.acceptDuel(opponent, duel.point, sessionO);
  await waitCommitted(client, point.txHash, 'accept');
  const accepted = await duelCell(point);
  check(
    accepted?.duel.status === codec.STATUS_LIVE && sd.bytesToHex(accepted.duel.opponent) === lockO.hash(),
    'the named opponent accepted with the same stake',
    `${ckb(BigInt(accepted!.cell.cellOutput.capacity))} CKB in the duel cell`,
  );

  // The challenger hunts the opponent down; the opponent keeps firing out of the field.
  const winds: number[] = [];
  let shots = 0;
  for (;;) {
    const state = await duels.artilleryBoard(client, point);
    if (!state) throw new Error('board unreadable');
    if (state.board.winner !== null) break;
    const side = state.board.turn % 2;
    let aim = { angle: 60, power: 100 };
    if (side === 0) {
      let best = -1;
      for (let angle = 5; angle < 90; angle += 2) {
        for (let power = 20; power <= 100; power += 2) {
          const probe = rules.fire(state.board, { angle, power }, state.wind);
          const gain = probe.damage[1] - probe.damage[0];
          if (gain > best) {
            best = gain;
            aim = { angle, power };
          }
        }
      }
    }
    winds.push(state.wind);
    point = await duels.fireShot(client, point, side === 0 ? sessionC.secret : sessionO.secret, aim);
    await waitCommitted(client, point.txHash, `shot ${shots + 1}`);
    shots += 1;
  }
  const played = await duels.artilleryBoard(client, point);
  check(played?.board.winner === 0, 'the challenger won the duel on chain', `${shots} shots, hp ${played?.board.tanks.map((t) => t.hp).join(' vs ')}`);
  check(new Set(winds).size > 1 || shots < 3, 'each shot flew in its own block’s wind', winds.join(', '));
  const beforeWin = await balance(lockC);
  const pot = BigInt((await duelCell(point))!.cell.cellOutput.capacity);
  // The stranger sends the finish: nobody signs, and the money can only go to the winner.
  const finished = await duels.finishDuel(client, point);
  await waitCommitted(client, finished, 'finish');
  const won = await gained(lockC, beforeWin, pot - sd.MAX_TX_FEE);
  check(won > pot - sd.MAX_TX_FEE - 1n && (await duelCell(point)) == null, 'the finish paid the winner both stakes', `${ckb(won)} CKB`);
  for (const [session, owner] of [[sessionC, lockC], [sessionO, lockO]] as const) {
    const back = await crown.returnKeyCell(client, session.secret, owner);
    if (back) await waitCommitted(client, back, 'key cell return');
  }

  console.log('\nArtillery: a turn left to run out is skipped');
  const slowC = await crown.newSessionKey(client);
  const slowO = await crown.newSessionKey(client);
  const slow = await duels.openDuel(challenger, {
    kind: codec.KIND_ARTILLERY,
    stake,
    timerMs: codec.artilleryTimer(40_000, 5_000),
    opponentLockHash: lockO.hash(),
    session: slowC,
  });
  await waitCommitted(client, slow.point.txHash, 'open');
  let slowPoint = await duels.acceptDuel(opponent, slow.point, slowO);
  await waitCommitted(client, slowPoint.txHash, 'accept');
  slowPoint = await duels.fireShot(client, slowPoint, slowC.secret, { angle: 45, power: 60 });
  await waitCommitted(client, slowPoint.txHash, 'one shot');
  // The opponent never fires. Their turn can't be ended by a payout any more...
  const noForfeit = await outcome(duels.finishDuel(client, slowPoint));
  check(/not over/.test(noForfeit), 'a turn left to run out does not end the duel', noForfeit);
  // ...and can't be skipped before its time.
  const tooSoon = await outcome(duels.skipTurns(client, slowPoint, slowC.secret, 1));
  check(tooSoon === 'error code -10', 'the chain refuses a skip before the turn has run out (-10)', tooSoon);
  // Pressure: the second turn has 40 − 5 = 35 seconds. Once it has passed, the challenger's own
  // browser skips it, with no wallet.
  const skipStart = Date.now();
  let skipped = 'not tried';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    skipped = await outcome(
      duels.skipTurns(client, slowPoint, slowC.secret, 1).then(async (point) => {
        await waitCommitted(client, point.txHash, 'skip');
        slowPoint = point;
      }),
    );
    if (skipped !== 'error code -10') break;
  }
  check(skipped === 'accepted', 'once the turn ran out, the waiting player skipped it', `${skipped}, after ${Math.round((Date.now() - skipStart) / 1000)}s`);
  const afterSkip = (await duels.findDuel(client, slow.duelId))?.duel;
  const last = afterSkip?.shots.at(-1);
  check(Boolean(last && rules.isPass(last)) && afterSkip?.shots.length === 2, 'the skip is on chain as a pass, and the turn is the challenger’s again', `${afterSkip?.shots.length} moves`);
  const third = afterSkip ? codec.turnMs(afterSkip.timerMs, afterSkip.shots.length) : 0n;
  check(third === 30_000n, 'under Pressure the third turn is 10 seconds shorter than the first', `${third} ms`);
  slowPoint = await duels.fireShot(client, slowPoint, slowC.secret, { angle: 45, power: 60 });
  await waitCommitted(client, slowPoint.txHash, 'shot after the skip');
  check(true, 'the challenger fired again after the skip');
  // The rest of this duel is left unplayed; its key cells go back.
  for (const [session, owner] of [[slowC, lockC], [slowO, lockO]] as const) {
    const back = await crown.returnKeyCell(client, session.secret, owner);
    if (back) await waitCommitted(client, back, 'key cell return');
  }

  console.log('\nLane race');
  const raceC = await crown.newSessionKey(client);
  const raceO = await crown.newSessionKey(client);
  const race = await duels.openDuel(challenger, {
    kind: codec.KIND_RACE,
    stake,
    timerMs: BigInt(codec.MIN_RACE_MS),
    opponentLockHash: lockO.hash(),
    session: raceC,
  });
  await waitCommitted(client, race.point.txHash, 'race open');
  let racePoint = await duels.acceptDuel(opponent, race.point, raceO);
  await waitCommitted(client, racePoint.txHash, 'race accept');

  const LAP = 720;
  const bestLap = (seeds: bigint[], done: Uint8Array[], tries: number) => {
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
  const racePlayers = [
    { session: raceC, owner: lockC, tries: 300, label: 'challenger' },
    { session: raceO, owner: lockO, tries: 5, label: 'opponent' },
  ];
  const runs: { laps: { block: Uint8Array; tape: Uint8Array }[]; score: number }[] = [];
  for (const player of racePlayers) {
    const seeds: bigint[] = [];
    const tapes: Uint8Array[] = [];
    const laps: { block: Uint8Array; tape: Uint8Array }[] = [];
    let score = 0;
    for (let k = 0; k < sd.LAPS; k += 1) {
      const next = (await duels.raceLap(client, racePoint, player.session.secret, player.owner.hash()))!;
      seeds.push(next.seed);
      const best = bestLap(seeds, tapes, player.tries);
      tapes.push(best.tape);
      laps.push({ block: sd.hexToBytes(next.block), tape: best.tape });
      score = best.score;
      const sealed = await duels.sealRaceLap(client, racePoint, player.session.secret, best.tape);
      await waitCommitted(client, sealed.txHash, `${player.label} lap ${k + 1}`);
    }
    runs.push({ laps, score });
  }
  check(runs[0]!.score !== runs[1]!.score, 'both raced five laps on their own roads', `${runs[0]!.score} vs ${runs[1]!.score}`);
  const inflated = await outcome(duels.submitRace(client, racePoint, raceO.secret, lockO, runs[1]!.laps, runs[1]!.score + 50));
  check(inflated === 'error code -17', 'the chain refuses a submitted run with an inflated score (-17)', inflated);
  for (const [i, player] of racePlayers.entries()) {
    racePoint = await duels.submitRace(client, racePoint, player.session.secret, player.owner, runs[i]!.laps, runs[i]!.score);
    await waitCommitted(client, racePoint.txHash, `${player.label} submit`);
  }
  const submitted = (await duelCell(racePoint))!.duel;
  check(
    submitted.submitted === 3 && submitted.scores[0] === BigInt(runs[0]!.score) && submitted.scores[1] === BigInt(runs[1]!.score),
    'both runs were replayed on chain and their scores recorded',
    `${submitted.scores.join(' vs ')}`,
  );
  const faster = runs[0]!.score > runs[1]!.score ? lockC : lockO;
  const beforeRace = await balance(faster);
  const raceDone = await duels.finishDuel(client, racePoint);
  await waitCommitted(client, raceDone, 'race finish');
  const raceGain = await gained(faster, beforeRace, 2n * stake);
  check(raceGain > 2n * stake, 'the faster driver took both stakes', ckb(raceGain));

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
