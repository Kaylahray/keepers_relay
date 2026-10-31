/**
 * Writes artillery.json: duels played by the browser's rules (lib/duel/artillery.ts), every shot's
 * outcome and the final board. The Rust conformance test (tests/src/artillery.rs) replays the same
 * duels with crowns-artillery-core and must match all of it.
 *
 *   pnpm exec tsx scripts/sudden-death/tests/fixtures/make-artillery.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fire, newDuel, PASS, type ShotRecord } from '@/lib/duel/artillery';

/** A fixed source of "random" shots, so the fixtures never change unless the rules do. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function checksum(heights: number[]): string {
  let a = 1;
  let b = 0;
  for (const h of heights) {
    a = (a + h) % 65521;
    b = (b + a) % 65521;
  }
  return ((b * 65536 + a) >>> 0).toString(16);
}

const duels = [];
const next = lcg(0xc0ffee);
for (let d = 0; d < 40; d += 1) {
  const seed = d < 3 ? [0, 1, 0xffffffff][d]! : next();
  let state = newDuel(seed);
  const shots: (ShotRecord & { impact: [number, number] | null; damage: [number, number]; direct: boolean; hp: [number, number] })[] = [];
  while (state.winner === null) {
    const side = state.turn % 2;
    // Aim roughly at the other tank, with spread, so duels see hits, misses, self-hits and craters.
    // About one turn in eight is skipped (its time ran out): a pass, with no power and no wind.
    const skipped = next() % 8 === 0;
    const angle = skipped ? PASS : side === 0 ? 15 + (next() % 70) : 95 + (next() % 70);
    const power = skipped ? 0 : 30 + (next() % 71);
    const wind = skipped ? 0 : (next() % 21) - 10;
    const result = fire(state, { angle, power }, wind);
    state = result.next;
    shots.push({
      angle,
      power,
      wind,
      impact: result.impact ? [result.impact.x, result.impact.y] : null,
      damage: result.damage,
      direct: result.direct,
      hp: [state.tanks[0].hp, state.tanks[1].hp],
    });
  }
  duels.push({
    seed,
    tanks: [newDuel(seed).tanks[0].x, newDuel(seed).tanks[1].x],
    start: checksum(newDuel(seed).heights),
    shots,
    winner: state.winner,
    end: checksum(state.heights),
  });
}

const out = join(process.cwd(), 'scripts/sudden-death/tests/fixtures/artillery.json');
writeFileSync(out, JSON.stringify(duels));
console.log(`wrote ${duels.length} duels, ${duels.reduce((n, d) => n + d.shots.length, 0)} shots to ${out}`);
