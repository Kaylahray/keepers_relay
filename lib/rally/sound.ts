import { RALLY, type CarView } from '@/lib/rally/rules';

/**
 * The race's sound, made in the browser (no audio files): an engine note that climbs with your car's
 * speed and roars on a boost, a crunch when you're hit, a chime for each shard and a horn at the
 * finish. Browsers only allow sound after a tap or a key, so it starts on the first one.
 */

const MUTE_KEY = 'crowns-rally-muted';

export function savedMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Not remembered; it still mutes for this race.
  }
}

/** Top speed without a boost, for scaling the engine note. */
const TOP_SPEED = RALLY.MAX_SPEED;

export class RallySound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { low: OscillatorNode; high: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private last: { hp: number; shards: number; finished: boolean; item: number } | null = null;
  private muted: boolean;
  private readonly wake = () => this.start();

  constructor(muted: boolean) {
    this.muted = muted;
    window.addEventListener('keydown', this.wake);
    window.addEventListener('pointerdown', this.wake);
  }

  private start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(master);
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    const high = ctx.createOscillator();
    high.type = 'square';
    const highGain = ctx.createGain();
    highGain.gain.value = 0.12;
    low.connect(filter);
    high.connect(highGain).connect(filter);
    low.start();
    high.start();
    this.ctx = ctx;
    this.master = master;
    this.engine = { low, high, filter, gain };
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  /** Called every frame with the car this browser drives (or none while watching). */
  update(car: CarView | undefined) {
    const { ctx, engine } = this;
    if (!ctx || !engine) return;
    const now = ctx.currentTime;
    if (!car || car.finished != null || car.wrecked) {
      engine.gain.gain.setTargetAtTime(car && !car.wrecked ? 0.01 : 0, now, 0.2);
    } else {
      const pace = Math.min(Math.abs(car.speed) / TOP_SPEED, 1.4);
      const base = 48 + pace * 110 + (car.boosting ? 40 : 0);
      engine.low.frequency.setTargetAtTime(base, now, 0.06);
      engine.high.frequency.setTargetAtTime(base * 2.01, now, 0.06);
      engine.filter.frequency.setTargetAtTime(320 + pace * 650 + (car.boosting ? 380 : 0), now, 0.08);
      // A low hum under the race, not a buzz over it.
      engine.gain.gain.setTargetAtTime(0.022 + pace * 0.028 + (car.boosting ? 0.018 : 0), now, 0.1);
    }

    const last = this.last;
    if (car && last) {
      if (car.hp < last.hp - 2) this.crunch(Math.min((last.hp - car.hp) / 30, 1));
      if (car.shards > last.shards) this.chime();
      if (car.item === 0 && last.item !== 0) this.whoosh();
      if (car.finished != null && !last.finished) this.horn();
    }
    this.last = car ? { hp: car.hp, shards: car.shards, finished: car.finished != null, item: car.item } : null;
  }

  private tone(type: OscillatorType, from: number, to: number, length: number, volume: number, delay = 0) {
    const ctx = this.ctx!;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), at + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }

  private crunch(strength: number) {
    const ctx = this.ctx!;
    const length = 0.25;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.25 + strength * 0.35;
    noise.connect(filter).connect(gain).connect(this.master!);
    noise.start();
    this.tone('triangle', 120, 40, 0.2, 0.2 * (0.5 + strength));
  }

  private chime() {
    this.tone('sine', 1320, 1320, 0.12, 0.12);
    this.tone('sine', 1760, 1760, 0.18, 0.1, 0.07);
  }

  private whoosh() {
    this.tone('sawtooth', 300, 1200, 0.25, 0.06);
  }

  private horn() {
    [523, 659, 784].forEach((note, i) => this.tone('square', note, note, 0.35, 0.08, i * 0.12));
  }

  dispose() {
    window.removeEventListener('keydown', this.wake);
    window.removeEventListener('pointerdown', this.wake);
    void this.ctx?.close();
    this.ctx = null;
    this.engine = null;
  }
}
