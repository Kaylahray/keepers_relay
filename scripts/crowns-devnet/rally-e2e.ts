/**
 * Crown Rally end to end on a local devnet: the app's chain code, the real relay, and phones driven
 * by bots. Devnet account 0 hosts, account 1 and a fresh account funded by account 0 join, and
 * account 2 is the relay.
 *
 *   offckb node
 *   pnpm exec tsx scripts/crowns-devnet/deploy.ts
 *   pnpm exec tsx scripts/crowns-devnet/rally-e2e.ts
 *
 * Every phone signs its own moves as it drives and does nothing once the race ends: the relay sends
 * every finish alone.
 *
 * Race 1: three cars race, picking up and firing items and bumping each other, and the winner takes
 *         every entry: the chain replays the items, health and wrecks the phones saw.
 * Race 2: two cars sit on the line and the third drives but never signs its moves. On the phones it
 *         wins, but the relay can't be paid out on unsigned moves: it settles on the car never
 *         having moved, so nobody finished and every entry goes back.
 * Race 3: both cars sit on the line, so nobody finishes; every entry goes back.
 * Race 4: nobody joins; the host asks the relay to close the lobby and gets their entry back.
 * Race 5: two of four seats, started by the clock.
 * Race 6: a sponsored race the host only watches: two drivers join free, the winner takes the
 *         prize, and everyone gets their seat's storage back.
 * Race 7: a sponsored race open only to players with a name, which the host races too. A player
 *         without one is refused. Devnet has no username script, so a Nervos DAO deposit stands in
 *         for the name cell: any one type every name cell shares does.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { ccc } from '@ckb-ccc/core';
import { DEVNET_KEYS, devnetClient, HERE, loadDevnetEnv, signerFor, waitCommitted } from './devnet';

loadDevnetEnv();
const RELAY_PORT = 8788;
process.env.NEXT_PUBLIC_RALLY_RELAY_URL = `http://127.0.0.1:${RELAY_PORT}`;

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

const CKB = 100_000_000n;
const ENTRY = 100n * CKB;
const PRIZE = 250n * CKB;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether `test` comes true within a few seconds: the indexer can lag a block behind a commit. */
async function soon(test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 10; tries += 1) {
    if (await test()) return true;
    await sleep(1_000);
  }
  return false;
}

type Message = import('@/lib/rally/protocol').RelayMessage;

/** Reads the relay's event stream, calling `onMessage` for each message, until `stop` is called. */
function listen(url: string, onMessage: (message: Message) => void): () => void {
  const controller = new AbortController();
  void (async () => {
    const response = await fetch(url, { signal: controller.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        for (const line of block.split('\n')) if (line.startsWith('data: ')) onMessage(JSON.parse(line.slice(6)) as Message);
      }
    }
  })().catch(() => undefined);
  return () => controller.abort();
}

async function main() {
  const chain = await import('@/lib/rally/chain');
  const moves = await import('@/lib/rally/moves');
  const rules = await import('@/lib/rally/rules');
  const protocol = await import('@/lib/rally/protocol');
  const session = await import('@/lib/chain/session');
  const { readFileSync } = await import('node:fs');

  const client = devnetClient();
  const host = signerFor(client, 0);
  const guest = signerFor(client, 1);
  const relaySigner = signerFor(client, 2);
  const relayLock = (await relaySigner.getRecommendedAddressObj()).script;
  process.env.NEXT_PUBLIC_RALLY_RELAY_LOCK_HASH = relayLock.hash();
  const config = await import('@/lib/registry/config');
  config.rallyRelay.url = process.env.NEXT_PUBLIC_RALLY_RELAY_URL!;
  config.rallyRelay.lockHash = relayLock.hash();
  const wasm = readFileSync(join(HERE, '../../public/games/rally.wasm'));
  const relayUrl = process.env.NEXT_PUBLIC_RALLY_RELAY_URL!;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${relayUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok && response.status !== 204) throw new Error(`${path}: ${((await response.json()) as { error?: string }).error}`);
    return response.status === 204 ? null : response.json();
  };

  // A third player: a fresh key, funded by account 0.
  const third = new ccc.SignerCkbPrivateKey(client, ccc.hexFrom(crypto.getRandomValues(new Uint8Array(32))));
  {
    const fund = ccc.Transaction.from({ outputs: [{ lock: (await third.getRecommendedAddressObj()).script, capacity: 2_000n * CKB }] });
    await fund.completeInputsByCapacity(host);
    await fund.completeFeeBy(host, 1000);
    await waitCommitted(client, await host.sendTransaction(fund), 'fund the third player');
  }

  console.log('Starting the relay');
  const relay: ChildProcess = spawn('pnpm', ['exec', 'tsx', 'rally-relay/server.mts'], {
    cwd: join(HERE, '../..'),
    env: { ...process.env, PORT: String(RELAY_PORT), RALLY_RELAY_KEY: DEVNET_KEYS[2], RALLY_DEVNET_SCRIPTS: join(HERE, 'devnet-scripts.json') },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stdout!.on('data', (chunk) => process.stdout.write(`  [relay] ${chunk}`));
  relay.stderr!.on('data', (chunk) => process.stdout.write(`  [relay] ${chunk}`));
  for (let tries = 0; tries < 60; tries += 1) {
    if (await fetch(`${relayUrl}/health`).then((r) => r.ok).catch(() => false)) break;
    await sleep(1_000);
  }

  /** How a phone races: drives with the bot and signs, holds the brake and signs, or drives and never signs. */
  type Mode = 'drive' | 'park' | 'unsigned';

  /** One phone: joins with its session key, drives its car, and signs its moves as the relay passes them back. */
  async function phone(matchId: string, secret: ccc.Hex, mode: Mode) {
    const runner = await rules.loadRally(wasm);
    const snapshot = (await chain.findMatch(client, matchId))!;
    let cars: string[] = [];
    let tapes: import('@/lib/rally/rules').RallyEvent[][] = [];
    let held: number[] = [];
    let next: number[] = [];
    let startAt: number | null = null;
    let offset = 0;
    let token = '';
    let sent = -1;
    let seq = 0;
    let ready = false;
    let turnedDown = 0;
    let play: WebSocket | null = null;
    const say = (message: import('@/lib/rally/protocol').PlayMessage) => play?.send(JSON.stringify(message));
    let done: { phase: string; txHash?: string; note?: string } | null = null;
    // The lobby's clock as the relay last told it, and when the relay started the countdown.
    let lobbyEnds: number | null = null;
    let countdownAt: number | null = null;
    const own = new moves.OwnMoves(matchId, secret);
    const me = (await new ccc.SignerCkbPrivateKey(client, secret).getRecommendedAddressObj()).script.hash().toLowerCase();

    const stop = listen(`${relayUrl}/stream?match=${matchId}`, (message) => {
      if (message.type === 'state') {
        startAt = message.startAt;
        offset = message.now - Date.now();
        if (message.cars.length > 0 && cars.length === 0) {
          cars = message.cars;
          runner.start(0, snapshot.match.map, cars.length);
          tapes = cars.map(() => []);
          held = cars.map(() => 0);
          next = cars.map(() => 0);
        }
        if (message.phase === 'done' || message.phase === 'failed') done = { phase: message.phase, txHash: message.txHash, note: message.note };
        if (message.phase === 'lobby') lobbyEnds = message.lobbyEndsAt;
        if (message.phase === 'countdown' && countdownAt == null) countdownAt = message.now;
      } else if (message.type === 'tick') {
        const mine = cars.indexOf(me);
        for (const [car, tick, bits] of message.ev) {
          const events = tapes[car]!;
          const last = events.at(-1);
          if (last && last.tick === tick) last.bits = bits;
          else events.push({ tick, bits });
        }
        if (cars.length > 0) rules.playTo(runner, 0, tapes, message.t, held, next);
        // As a phone does: only moves on ticks already played, which the relay can no longer change.
        const played = mine >= 0 ? tapes[mine]!.filter((event) => event.tick < message.t) : [];
        const signed = mine >= 0 && mode !== 'unsigned' && ready ? own.sign(played) : null;
        if (signed) say({ type: 'moves', ...signed });
      }
    });

    const nonce = Date.now();
    const signature = await new ccc.SignerCkbPrivateKey(client, secret).signMessage(protocol.joinMessage(matchId, nonce));
    token = ((await post('/join', { matchId, nonce, signature })) as { token: string }).token;

    // Inputs and signatures go over the phone's own WebSocket, in order, as the app sends them.
    const socket = new WebSocket(`${relayUrl.replace(/^http/, 'ws')}${protocol.PLAY_PATH}`);
    play = socket;
    socket.onmessage = (event) => {
      const reply = JSON.parse(String(event.data)) as import('@/lib/rally/protocol').PlayReply;
      if (reply.type === 'ready') ready = true;
      else if (reply.type === 'moves' && !reply.ok) {
        turnedDown += 1;
        console.log(`  moves not taken: ${reply.error}`);
      }
    };
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('The relay’s WebSocket did not open.'));
    });
    say({ type: 'hello', matchId, token });

    // Drive: steer by the race as the relay has confirmed it, and send each change a few ticks ahead.
    const drive = setInterval(() => {
      const car = cars.indexOf(me);
      if (startAt == null || car < 0 || runner.over(0)) return;
      const estimated = Math.floor((Date.now() + offset - startAt) / rules.RALLY.TICK_MS);
      if (estimated < 0) return;
      const bits = mode === 'park' ? rules.BRAKE : runner.bot(0, car);
      if (bits !== sent) {
        sent = bits;
        const tick = estimated + protocol.INPUT_DELAY_TICKS;
        own.press(tick, bits);
        seq += 1;
        say({ type: 'input', seq, tick, bits });
      }
    }, rules.RALLY.TICK_MS);

    return {
      finished: async () => {
        for (let waited = 0; !done && waited < 600; waited += 1) await sleep(1_000);
        clearInterval(drive);
        stop();
        play?.close();
        const views = cars.map((_, i) => runner.car(0, i));
        return {
          done,
          lobbyEnds,
          countdownAt,
          results: cars.length > 0 ? rules.resultsOf(runner, 0) : [],
          cars,
          car: cars.indexOf(me),
          shards: views.reduce((sum, view) => sum + view.shards, 0),
          fired: tapes.filter((events) => events.some((event) => (event.bits & rules.USE) !== 0)).length,
          hurt: views.filter((view) => view.hp < rules.RALLY.MAX_HP).length,
          turnedDown,
        };
      },
    };
  }

  type Entrant = { signer: ccc.SignerCkbPrivateKey; key: import('@/lib/chain/session').SessionKey; lock: ccc.Script };

  /** Opens a match for `seats` with the first entrant as host, and seats the rest. */
  async function lobby(seats: number, map: number, signers: ccc.SignerCkbPrivateKey[], wait = 5 * 60) {
    const entrants: Entrant[] = [];
    for (const signer of signers) entrants.push({ signer, key: await session.newSessionKey(client), lock: (await signer.getRecommendedAddressObj()).script });
    const opened = await chain.openMatch(entrants[0]!.signer, { entry: ENTRY, seats, map, session: entrants[0]!.key, wait });
    await waitCommitted(client, opened.point.txHash, 'open');
    // The indexer can lag the commit by a moment.
    let snapshot = null as Awaited<ReturnType<typeof chain.findMatch>>;
    await soon(async () => (snapshot = await chain.findMatch(client, opened.matchId)) != null);
    check(snapshot != null && snapshot.match.seats === seats && snapshot.match.map === map && snapshot.match.wait === wait, `a ${seats}-seat match opens on ${rules.mapName(map)}, waiting ${wait / 60} min`);
    // Every seat names the match in its cell deps, so they all join at once.
    const joins = await Promise.all(entrants.slice(1).map((entrant) => chain.joinMatch(entrant.signer, snapshot!, entrant.key)));
    for (const joined of joins) await waitCommitted(client, joined.txHash, 'join');
    snapshot = await chain.findMatch(client, opened.matchId);
    check(snapshot != null && chain.racingSeats(snapshot).length === entrants.length - 1, `${entrants.length - 1} player(s) join side by side`);
    return { matchId: opened.matchId, entrants };
  }

  /** What each wallet put into a finish: its match or seat cells. */
  async function putInBy(txHash: string): Promise<Map<string, bigint>> {
    const tx = (await client.getTransaction(txHash))!.transaction;
    const put = new Map<string, bigint>();
    for (const input of tx.inputs) {
      const cell = await client.getCell(input.previousOutput);
      if (!cell?.cellOutput.type) continue;
      const data = ccc.bytesFrom(cell.outputData);
      const owner = (chain.decodeSeat(data)?.owner ?? chain.decodeMatch(data)?.host)?.toLowerCase();
      if (owner) put.set(owner, (put.get(owner) ?? 0n) + cell.cellOutput.capacity);
    }
    return put;
  }

  /** What a finish paid each lock. */
  async function paidBy(txHash: string): Promise<Map<string, bigint>> {
    const tx = (await client.getTransaction(txHash))!.transaction;
    const paid = new Map<string, bigint>();
    for (const output of tx.outputs) paid.set(output.lock.hash(), (paid.get(output.lock.hash()) ?? 0n) + output.capacity);
    return paid;
  }

  async function race(label: string, seats: number, map: number, signers: ccc.SignerCkbPrivateKey[], modes: Mode[]) {
    console.log(`\n${label}`);
    // Two minutes: the shortest wait no join cuts, so the clock is the host's wait.
    const { matchId, entrants } = await lobby(seats, map, signers, 2 * 60);
    const phones = await Promise.all(entrants.map((entrant, i) => phone(matchId, entrant.key.secret, modes[i]!)));
    console.log('  waiting for the lobby clock, then racing…');
    const ends = await Promise.all(phones.map((p) => p.finished()));
    const first = ends[0]!;
    // Full or not, only the clock starts the race.
    check(
      first.lobbyEnds != null && first.countdownAt != null && first.countdownAt >= first.lobbyEnds,
      'the race started when the lobby clock ran out, not before',
      first.lobbyEnds != null && first.countdownAt != null ? `${Math.round((first.countdownAt - first.lobbyEnds) / 1000)} s after` : 'no clock seen',
    );
    check(first.done?.phase === 'done', 'the relay sent the finish', first.done?.note ?? first.done?.txHash ?? 'no result');
    check(ends.every((end) => JSON.stringify(end.results) === JSON.stringify(first.results)), 'every phone saw the same race', `results ${first.results.map((r) => r.toString(16)).join(',')}`);
    check(ends.every((end) => end.turnedDown === 0), 'the relay took every signature', ends.map((end) => end.turnedDown).join(' / '));
    if (first.done?.txHash) {
      await waitCommitted(client, first.done.txHash, 'finish');
      const paid = await paidBy(first.done.txHash);
      const winners = rules.winnersOf(first.results);
      const pot = ENTRY * BigInt(entrants.length);
      const paidTo = (entrant: Entrant) => paid.get(entrant.lock.hash()) ?? 0n;
      if (modes.every((mode) => mode === 'park')) {
        check(winners.length === 0, 'nobody finished');
        check(entrants.every((entrant) => paidTo(entrant) >= ENTRY), 'every entry went back', [...paid.values()].map((v) => ccc.fixedPointToString(v)).join(' / '));
      } else if (modes.includes('unsigned')) {
        const silent = modes.indexOf('unsigned');
        check(winners.includes(ends[silent]!.car), 'on the phones, the car that never signed won');
        const put = await putInBy(first.done.txHash);
        const back = (entrant: Entrant) => put.get(entrant.lock.hash().toLowerCase()) ?? 0n;
        check(
          paidTo(entrants[silent]!) <= back(entrants[silent]!) && entrants.every((entrant) => paidTo(entrant) >= back(entrant) - chain.FEE),
          'it is paid nothing on unsigned moves: every entry went back',
          entrants.map((entrant) => `${ccc.fixedPointToString(paidTo(entrant))} of ${ccc.fixedPointToString(back(entrant))}`).join(' / '),
        );
      } else {
        check(winners.length > 0, 'someone finished');
        check(first.shards > 0 && first.fired > 0, 'cars picked up items and fired them', `${first.shards} shards, ${first.fired} car(s) fired`);
        check(ends.every((end) => end.shards === first.shards), 'every phone counted the same shards');
        console.log(`  ${first.hurt} car(s) ended the race hurt`);
        // Cars are numbered in the order the seats landed, which need not be the order they joined.
        const winner = entrants[ends.findIndex((end) => end.car === winners[0])]!;
        check(paidTo(winner) >= pot, `the winner (car ${winners[0]}) takes every entry`, `paid ${ccc.fixedPointToString(paidTo(winner))} CKB`);
      }
      check(await soon(async () => (await chain.findMatch(client, matchId)) == null), 'the match cell is gone');
      check(await soon(async () => (await chain.findSeats(client, matchId as ccc.Hex)).length === 0), 'every seat that raced is spent');
    }
  }

  async function emptyLobby() {
    console.log('\nRace 4: nobody joins');
    const { matchId, entrants } = await lobby(2, 2, [host]);
    const closed = (await post('/close', { matchId })) as { txHash: string | null };
    check(closed.txHash != null, 'the relay closes the lobby');
    if (closed.txHash) {
      await waitCommitted(client, closed.txHash, 'close');
      const paid = await paidBy(closed.txHash);
      check((paid.get(entrants[0]!.lock.hash()) ?? 0n) >= ENTRY, 'the host’s entry went home');
      check(await soon(async () => (await chain.findMatch(client, matchId)) == null), 'the match cell is gone');
    }
  }

  /** A cell of the stand-in name type for `signer`: a Nervos DAO deposit. */
  async function giveName(signer: ccc.SignerCkbPrivateKey) {
    const lock = (await signer.getRecommendedAddressObj()).script;
    const tx = ccc.Transaction.from({ outputs: [{ lock, type: nameType, capacity: 102n * CKB }], outputsData: ['0x0000000000000000'] });
    await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.NervosDao);
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);
    await waitCommitted(client, await signer.sendTransaction(tx), 'a name cell');
  }

  /**
   * A sponsored race: the host puts up the prize and the seats join free. `drivers` take seats; the
   * host races too if `hostRaces`. Every car drives.
   */
  async function sponsoredRace(label: string, map: number, drivers: ccc.SignerCkbPrivateKey[], options: { hostRaces: boolean; namesOnly: boolean; refused?: ccc.SignerCkbPrivateKey }) {
    console.log(`\n${label}`);
    const hostKey = options.hostRaces ? await session.newSessionKey(client) : null;
    const seats = drivers.length + (options.hostRaces ? 1 : 0);
    const opened = await chain.openMatch(host, { entry: 0n, prize: PRIZE, seats, map, session: hostKey, wait: 2 * 60, namesOnly: options.namesOnly });
    await waitCommitted(client, opened.point.txHash, 'open');
    let snapshot = null as Awaited<ReturnType<typeof chain.findMatch>>;
    await soon(async () => (snapshot = await chain.findMatch(client, opened.matchId)) != null);
    check(
      snapshot != null && chain.isSponsored(snapshot.match) && snapshot.match.prize === PRIZE && snapshot.match.hostRaces === options.hostRaces && chain.needsPass(snapshot.match) === options.namesOnly,
      `a sponsored ${seats}-seat race opens with a ${ccc.fixedPointToString(PRIZE)} CKB prize${options.hostRaces ? ', the host racing' : ', the host only watching'}`,
    );
    if (options.refused) {
      const refused = await chain.joinMatch(options.refused, snapshot!, await session.newSessionKey(client)).then(() => false, () => true);
      check(refused, 'a player without a name is refused');
    }
    const keys = await Promise.all(drivers.map(() => session.newSessionKey(client)));
    const joins = await Promise.all(drivers.map((signer, i) => chain.joinMatch(signer, snapshot!, keys[i]!)));
    for (const joined of joins) await waitCommitted(client, joined.txHash, 'join');
    snapshot = await chain.findMatch(client, opened.matchId);
    check(snapshot != null && chain.playersOf(snapshot).length === seats, `${drivers.length} driver(s) join free`);
    const seatCapacity = (await client.getTransaction(joins[0]!.txHash))!.transaction.outputs[0]!.capacity;
    check(seatCapacity === chain.seatDeposit(opened.matchId), 'a seat locks only its storage', `${ccc.fixedPointToString(seatCapacity)} CKB`);
    const hostCell = snapshot!.cell.cellOutput.capacity;

    const secrets = [...(hostKey ? [hostKey.secret] : []), ...keys.map((key) => key.secret)];
    const phones = await Promise.all(secrets.map((secret) => phone(opened.matchId, secret, 'drive')));
    console.log('  waiting for the lobby clock, then racing…');
    const ends = await Promise.all(phones.map((p) => p.finished()));
    const first = ends[0]!;
    check(first.done?.phase === 'done', 'the relay sent the finish', first.done?.note ?? first.done?.txHash ?? 'no result');
    if (!first.done?.txHash) return;
    await waitCommitted(client, first.done.txHash, 'finish');
    const paid = await paidBy(first.done.txHash);
    const winners = rules.winnersOf(first.results);
    check(winners.length > 0, 'someone finished');
    const racers = [...(options.hostRaces ? [host] : []), ...drivers];
    const lockOf = async (signer: ccc.SignerCkbPrivateKey) => (await signer.getRecommendedAddressObj()).script.hash();
    const winner = racers[ends.findIndex((end) => end.car === winners[0])]!;
    const winnerLock = await lockOf(winner);
    const hostLock = await lockOf(host);
    if (winner === host) {
      check((paid.get(hostLock) ?? 0n) === hostCell - chain.FEE, 'the host won their own prize back', `paid ${ccc.fixedPointToString(paid.get(hostLock) ?? 0n)} CKB`);
    } else {
      check((paid.get(winnerLock) ?? 0n) === seatCapacity + PRIZE, 'the winner takes the prize and their storage', `paid ${ccc.fixedPointToString(paid.get(winnerLock) ?? 0n)} CKB`);
      check((paid.get(hostLock) ?? 0n) === hostCell - PRIZE - chain.FEE, 'the sponsor gets their cell back less the prize and the fee');
    }
    const losers = drivers.filter((driver) => driver !== winner);
    const back = await Promise.all(losers.map(async (driver) => paid.get(await lockOf(driver)) ?? 0n));
    check(back.every((amount) => amount === seatCapacity), 'every other driver gets all their storage back', back.map((v) => ccc.fixedPointToString(v)).join(' / '));
    check(await soon(async () => (await chain.findMatch(client, opened.matchId)) == null), 'the match cell is gone');
  }

  // The stand-in name type; the app reads names by the username script's settings.
  const nameType = await ccc.Script.fromKnownScript(client, ccc.KnownScript.NervosDao, '0x');
  Object.assign(config.usernameType, { codeHash: nameType.codeHash, hashType: nameType.hashType, args: nameType.args });

  try {
    await race('Race 1: three cars', 3, 0, [host, guest, third], ['drive', 'drive', 'drive']);
    await race('Race 2: the only car that finishes never signs its moves', 3, 2, [host, guest, third], ['park', 'park', 'unsigned']);
    await race('Race 3: nobody leaves the line', 2, 1, [host, guest], ['park', 'park']);
    await emptyLobby();
    await race('Race 5: two of four seats, started by the clock', 4, 1, [host, guest], ['drive', 'drive']);
    await sponsoredRace('Race 6: sponsored, the host only watches', 0, [guest, third], { hostRaces: false, namesOnly: false });
    await giveName(guest);
    await sponsoredRace('Race 7: sponsored, names only, the host races too', 2, [guest], { hostRaces: true, namesOnly: true, refused: third });
  } finally {
    // The relay runs under a shell; on Windows only a tree kill stops it.
    if (process.platform === 'win32' && relay.pid) spawnSync('taskkill', ['/pid', String(relay.pid), '/T', '/F']);
    else relay.kill();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
