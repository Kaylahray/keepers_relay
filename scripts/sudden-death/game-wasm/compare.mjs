// Replays every fixture the Rust tests wrote through the wasm build and checks each score matches
// what CKB-VM accepted. Usage: node compare.mjs <path to .wasm>
import { readFileSync } from 'node:fs';

const wasm = readFileSync(process.argv[2]);
const { instance } = await WebAssembly.instantiate(wasm, {});
const api = instance.exports;
const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));

let failed = 0;
for (const f of fixtures) {
  const seed = BigInt(f.seed);
  const hi = Number(seed >> 32n);
  const lo = Number(seed & 0xffffffffn);
  const bytes = Buffer.from(f.tape, 'hex');
  // tape_ptr may grow memory on first use, which detaches any earlier view of the buffer.
  const ptr = api.tape_ptr();
  new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes);
  const replayed = api.replay(hi, lo, bytes.length);

  // Also play it live, tick by tick, the way the browser will.
  api.run_new(hi, lo);
  let cursor = 0;
  while (!api.run_over()) {
    let lane = 255;
    if (cursor < bytes.length && (bytes[cursor] | (bytes[cursor + 1] << 8)) === api.run_tick()) {
      lane = bytes[cursor + 2];
      cursor += 3;
    }
    api.run_step(lane);
  }
  const live = api.run_score();
  const ok = String(replayed) === f.score && String(live) === f.score;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} seed ${f.seed.padEnd(20)} chain ${f.score.padStart(6)}  wasm replay ${String(replayed).padStart(6)}  wasm live ${String(live).padStart(6)}`);
}
console.log(`${wasm.length} byte wasm, ${fixtures.length} fixtures, ${failed} mismatches`);
process.exit(failed ? 1 : 0);
