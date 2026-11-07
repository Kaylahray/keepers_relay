/** Draws a Crown Depths floor on a 2D canvas, top down, lit by the player's torch. Reads the live run; changes nothing. */

import { ARMOR, BAT, BOOTS, CHEST, DEPTHS, DOOR, GOLD, GREED, KEY, KNIGHT, LANTERN, SHRINE, SLIME, STAIRS, SWORD, WALL, type Depths, type Monster } from '@/lib/game/depths';

const MAP = DEPTHS.MAP;

export type Spot = { x: number; y: number };

/** Where things were on the tick before, so a frame can slide them toward where they are now. */
export type Before = { player: Spot; monsters: Map<string, Spot> };

/** A short flash on the board: a hit landing, a monster falling, a pickup. */
export type Flash = { x: number; y: number; until: number; color: string; ring?: boolean };

export function snapshot(run: Depths): Before {
  const monsters = new Map<string, Spot>();
  for (let room = 0; room < 9; room += 1) {
    run.monsters(room).forEach((m, slot) => monsters.set(`${room}:${slot}`, { x: m.x, y: m.y }));
  }
  return { player: { x: run.x(), y: run.y() }, monsters };
}

function roomOf(x: number, y: number) {
  const rx = Math.min(DEPTHS.ROOMS - 1, Math.floor((x - 1) / DEPTHS.CELL));
  const ry = Math.min(DEPTHS.ROOMS - 1, Math.floor((y - 1) / DEPTHS.CELL));
  return ry * DEPTHS.ROOMS + rx;
}

/** A fixed pseudo-random number per tile, for stone speckles that don't shimmer. */
function grain(x: number, y: number) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function slide(from: Spot | undefined, to: Spot, t: number): Spot {
  if (!from || Math.abs(from.x - to.x) + Math.abs(from.y - to.y) > 1) return to;
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

export type DrawOptions = {
  /** How far the current tick has gone, 0 to 1, for sliding. */
  t: number;
  now: number;
  before: Before | null;
  flashes: Flash[];
  /** The player took a hit this recently, in ms, or null. */
  hurtAgo: number | null;
};

export function drawDepths(ctx: CanvasRenderingContext2D, size: number, run: Depths, options: DrawOptions) {
  const cs = size / MAP;
  const { t, now, before } = options;
  const seen = run.seen();
  const here = roomOf(run.x(), run.y());
  const visible = (x: number, y: number) => (seen & (1 << roomOf(x, y))) !== 0;
  const nearSeen = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        if (run.tile(nx, ny) !== WALL && visible(nx, ny)) return true;
      }
    }
    return false;
  };

  ctx.fillStyle = '#09080c';
  ctx.fillRect(0, 0, size, size);

  // Stone, walls, doors and stairs.
  for (let y = 0; y < MAP; y += 1) {
    for (let x = 0; x < MAP; x += 1) {
      const tile = run.tile(x, y);
      const px = x * cs;
      const py = y * cs;
      if (tile === WALL) {
        if (!nearSeen(x, y)) continue;
        ctx.fillStyle = '#2a2531';
        ctx.fillRect(px, py, cs, cs);
        ctx.strokeStyle = '#1a1620';
        ctx.lineWidth = Math.max(1, cs * 0.06);
        ctx.beginPath();
        ctx.moveTo(px, py + cs / 2);
        ctx.lineTo(px + cs, py + cs / 2);
        const off = (y % 2) * cs * 0.5;
        ctx.moveTo(px + cs * 0.25 + off, py);
        ctx.lineTo(px + cs * 0.25 + off, py + cs / 2);
        ctx.moveTo(px + cs * 0.75 - off, py + cs / 2);
        ctx.lineTo(px + cs * 0.75 - off, py + cs);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(px, py, cs, cs * 0.12);
        continue;
      }
      if (!visible(x, y) && tile !== DOOR) continue;
      if (tile === DOOR && !nearSeen(x, y)) continue;
      const g = grain(x, y);
      ctx.fillStyle = (x + y) % 2 === 0 ? '#3b3544' : '#37313f';
      ctx.fillRect(px, py, cs, cs);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(px + ((g % 7) / 7) * cs * 0.7, py + (((g >> 3) % 7) / 7) * cs * 0.7, cs * 0.12, cs * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
      if (tile === DOOR) {
        const across = run.tile(x - 1, y) === WALL;
        ctx.fillStyle = '#6b4423';
        if (across) {
          ctx.fillRect(px, py, cs * 0.18, cs);
          ctx.fillRect(px + cs * 0.82, py, cs * 0.18, cs);
        } else {
          ctx.fillRect(px, py, cs, cs * 0.18);
          ctx.fillRect(px, py + cs * 0.82, cs, cs * 0.18);
        }
      }
      if (tile === STAIRS) {
        ctx.fillStyle = '#0d0b10';
        ctx.fillRect(px + cs * 0.1, py + cs * 0.1, cs * 0.8, cs * 0.8);
        ctx.strokeStyle = '#8a7a52';
        ctx.lineWidth = Math.max(1, cs * 0.07);
        for (let k = 0; k < 4; k += 1) {
          const inset = cs * (0.14 + k * 0.09);
          ctx.strokeRect(px + inset, py + inset, cs - inset * 2, cs - inset * 2);
        }
        const pulse = 0.35 + 0.25 * Math.sin(now / 300);
        ctx.fillStyle = `rgba(225,191,71,${pulse})`;
        ctx.fillRect(px + cs * 0.42, py + cs * 0.42, cs * 0.16, cs * 0.16);
      }
    }
  }

  // Treasure.
  for (let y = 0; y < MAP; y += 1) {
    for (let x = 0; x < MAP; x += 1) {
      if (!visible(x, y)) continue;
      const item = run.item(x, y);
      if (!item) continue;
      const cx = (x + 0.5) * cs;
      const cy = (y + 0.5) * cs + Math.sin(now / 280 + x + y) * cs * 0.04;
      if (item === GOLD) drawCoin(ctx, cx, cy, cs * 0.24);
      else if (item === KEY) drawKey(ctx, cx, cy, cs);
      else if (item === CHEST) drawChest(ctx, cx, cy, cs, run.hasKey());
      else if (item === SHRINE) drawShrine(ctx, cx, cy, cs, now);
    }
  }

  // Monsters, sliding from where they stood last tick.
  for (let room = 0; room < 9; room += 1) {
    if (!(seen & (1 << room))) continue;
    run.monsters(room).forEach((m, slot) => {
      if (!m.placed || m.hp <= 0) return;
      const at = slide(before?.monsters.get(`${room}:${slot}`), m, t);
      drawMonster(ctx, (at.x + 0.5) * cs, (at.y + 0.5) * cs, cs, m, now, room === here);
    });
  }

  // The player.
  const me = slide(before?.player, { x: run.x(), y: run.y() }, t);
  const blink = run.guarded() && Math.floor(now / 90) % 2 === 0;
  if (!blink) drawPlayer(ctx, (me.x + 0.5) * cs, (me.y + 0.5) * cs, cs, now, run.fallen(), run.owned());

  for (const flash of options.flashes) {
    const left = flash.until - now;
    if (left <= 0) continue;
    const k = left / 350;
    ctx.globalAlpha = Math.min(1, k);
    if (flash.ring) {
      ctx.strokeStyle = flash.color;
      ctx.lineWidth = cs * 0.1;
      ctx.beginPath();
      ctx.arc((flash.x + 0.5) * cs, (flash.y + 0.5) * cs, cs * (0.9 - k * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = flash.color;
      ctx.fillRect(flash.x * cs, flash.y * cs, cs, cs);
    }
    ctx.globalAlpha = 1;
  }

  // The torch: light around the player shrinks as it burns down.
  const left = Math.max(0, run.torch() - run.tick()) / DEPTHS.FLOOR_TICKS;
  const flicker = Math.sin(now / 97) * 0.12 + Math.sin(now / 53) * 0.08;
  const reach = cs * (3.2 + Math.min(1, left) * 4 + flicker);
  const lx = (me.x + 0.5) * cs;
  const ly = (me.y + 0.5) * cs;
  const dark = ctx.createRadialGradient(lx, ly, reach * 0.35, lx, ly, reach * 1.6);
  dark.addColorStop(0, 'rgba(6,5,9,0)');
  dark.addColorStop(0.55, 'rgba(6,5,9,0.55)');
  dark.addColorStop(1, 'rgba(6,5,9,0.9)');
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, size, size);
  const warm = ctx.createRadialGradient(lx, ly, 0, lx, ly, reach);
  warm.addColorStop(0, 'rgba(255,170,60,0.16)');
  warm.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, size, size);

  // Rooms not walked into yet stay dark.
  for (let room = 0; room < 9; room += 1) {
    if (seen & (1 << room)) continue;
    const rx = (room % DEPTHS.ROOMS) * DEPTHS.CELL + 1;
    const ry = Math.floor(room / DEPTHS.ROOMS) * DEPTHS.CELL + 1;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.font = `bold ${cs * 1.4}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', (rx + DEPTHS.ROOM / 2) * cs, (ry + DEPTHS.ROOM / 2) * cs);
  }

  if (options.hurtAgo != null && options.hurtAgo < 300) {
    const k = 1 - options.hurtAgo / 300;
    const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.75);
    edge.addColorStop(0, 'rgba(255,40,40,0)');
    edge.addColorStop(1, `rgba(255,40,40,${0.45 * k})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
  }
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#e1bf47';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8d7116';
  ctx.lineWidth = r * 0.2;
  ctx.stroke();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function drawKey(ctx: CanvasRenderingContext2D, x: number, y: number, cs: number) {
  ctx.strokeStyle = '#e1bf47';
  ctx.fillStyle = '#e1bf47';
  ctx.lineWidth = cs * 0.09;
  ctx.beginPath();
  ctx.arc(x - cs * 0.15, y, cs * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(x - cs * 0.02, y - cs * 0.04, cs * 0.3, cs * 0.08);
  ctx.fillRect(x + cs * 0.16, y, cs * 0.06, cs * 0.12);
  ctx.fillRect(x + cs * 0.24, y, cs * 0.05, cs * 0.09);
}

function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, cs: number, open: boolean) {
  const w = cs * 0.62;
  const h = cs * 0.46;
  ctx.fillStyle = '#7a4a22';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = '#5a3415';
  ctx.fillRect(x - w / 2, y - h / 2, w, h * 0.35);
  ctx.fillStyle = '#e1bf47';
  ctx.fillRect(x - w / 2, y - h * 0.08, w, h * 0.12);
  ctx.fillRect(x - cs * 0.05, y - h * 0.15, cs * 0.1, h * 0.3);
  if (open) {
    ctx.strokeStyle = 'rgba(153,238,45,0.8)';
    ctx.lineWidth = cs * 0.05;
    ctx.strokeRect(x - w / 2 - cs * 0.04, y - h / 2 - cs * 0.04, w + cs * 0.08, h + cs * 0.08);
  }
}

function drawShrine(ctx: CanvasRenderingContext2D, x: number, y: number, cs: number, now: number) {
  const glow = 0.5 + 0.3 * Math.sin(now / 250);
  const halo = ctx.createRadialGradient(x, y, 0, x, y, cs * 0.6);
  halo.addColorStop(0, `rgba(64,106,255,${glow})`);
  halo.addColorStop(1, 'rgba(64,106,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - cs, y - cs, cs * 2, cs * 2);
  ctx.fillStyle = '#8ea6ff';
  ctx.beginPath();
  ctx.moveTo(x, y - cs * 0.32);
  ctx.lineTo(x + cs * 0.18, y);
  ctx.lineTo(x, y + cs * 0.32);
  ctx.lineTo(x - cs * 0.18, y);
  ctx.closePath();
  ctx.fill();
}

function drawMonster(ctx: CanvasRenderingContext2D, x: number, y: number, cs: number, m: Monster, now: number, awake: boolean) {
  ctx.globalAlpha = awake ? 1 : 0.55;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + cs * 0.32, cs * 0.3, cs * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  if (m.kind === SLIME) {
    const squish = 1 + Math.sin(now / 160 + x) * 0.1;
    ctx.fillStyle = '#5fd35a';
    ctx.beginPath();
    ctx.ellipse(x, y + cs * 0.08, cs * 0.32 * squish, (cs * 0.26) / squish, 0, Math.PI, 0);
    ctx.lineTo(x + cs * 0.32 * squish, y + cs * 0.22);
    ctx.lineTo(x - cs * 0.32 * squish, y + cs * 0.22);
    ctx.fill();
    eyes(ctx, x, y + cs * 0.02, cs * 0.1, cs * 0.06);
  } else if (m.kind === BAT) {
    const flap = Math.sin(now / 60 + y) * cs * 0.14;
    ctx.fillStyle = '#9b5de5';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - cs * 0.42, y - cs * 0.1 - flap);
    ctx.lineTo(x - cs * 0.22, y + cs * 0.08);
    ctx.lineTo(x + cs * 0.22, y + cs * 0.08);
    ctx.lineTo(x + cs * 0.42, y - cs * 0.1 - flap);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6a3aa8';
    ctx.beginPath();
    ctx.arc(x, y, cs * 0.15, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, x, y - cs * 0.02, cs * 0.06, cs * 0.04, '#ff5a5a');
  } else if (m.kind === KNIGHT) {
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(x - cs * 0.22, y - cs * 0.12, cs * 0.44, cs * 0.42);
    ctx.fillStyle = '#c9d0d8';
    ctx.beginPath();
    ctx.arc(x, y - cs * 0.14, cs * 0.2, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - cs * 0.2, y - cs * 0.14, cs * 0.4, cs * 0.12);
    ctx.fillStyle = '#111';
    ctx.fillRect(x - cs * 0.14, y - cs * 0.1, cs * 0.28, cs * 0.04);
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.ellipse(x, y - cs * 0.38, cs * 0.06, cs * 0.12, 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (m.hp < 2) {
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(x - cs * 0.2, y + cs * 0.36, cs * 0.2, cs * 0.05);
    }
  }
  ctx.globalAlpha = 1;
}

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, r: number, color = '#111') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x - gap, y, r, 0, Math.PI * 2);
  ctx.arc(x + gap, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** The player, with every item they picked drawn on them. */
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, cs: number, now: number, fallen: boolean, owned: number) {
  const has = (id: number) => (owned & (1 << id)) !== 0;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + cs * 0.34, cs * 0.28, cs * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  if (has(GREED)) {
    ctx.fillStyle = '#7a4a22';
    ctx.beginPath();
    ctx.arc(x - cs * 0.24, y + cs * 0.1, cs * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e1bf47';
    ctx.beginPath();
    ctx.arc(x - cs * 0.24, y + cs * 0.12, cs * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  if (has(BOOTS)) {
    ctx.fillStyle = '#7a4a22';
    ctx.fillRect(x - cs * 0.2, y + cs * 0.26, cs * 0.13, cs * 0.09);
    ctx.fillRect(x + cs * 0.07, y + cs * 0.26, cs * 0.13, cs * 0.09);
    ctx.fillStyle = '#e1bf47';
    ctx.fillRect(x - cs * 0.2, y + cs * 0.26, cs * 0.13, cs * 0.025);
    ctx.fillRect(x + cs * 0.07, y + cs * 0.26, cs * 0.13, cs * 0.025);
  }
  ctx.fillStyle = fallen ? '#555' : '#99ee2d';
  ctx.beginPath();
  ctx.moveTo(x, y - cs * 0.36);
  ctx.lineTo(x + cs * 0.28, y + cs * 0.3);
  ctx.lineTo(x - cs * 0.28, y + cs * 0.3);
  ctx.closePath();
  ctx.fill();
  if (has(ARMOR)) {
    ctx.fillStyle = '#c9d0d8';
    ctx.beginPath();
    ctx.moveTo(x - cs * 0.17, y + cs * 0.06);
    ctx.lineTo(x + cs * 0.17, y + cs * 0.06);
    ctx.lineTo(x + cs * 0.12, y + cs * 0.26);
    ctx.lineTo(x - cs * 0.12, y + cs * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e1bf47';
    ctx.fillRect(x - cs * 0.015, y + cs * 0.06, cs * 0.03, cs * 0.2);
  }
  ctx.fillStyle = '#15171c';
  ctx.beginPath();
  ctx.arc(x, y - cs * 0.06, cs * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5ffe6';
  ctx.fillRect(x - cs * 0.07, y - cs * 0.08, cs * 0.04, cs * 0.04);
  ctx.fillRect(x + cs * 0.03, y - cs * 0.08, cs * 0.04, cs * 0.04);
  if (fallen) return;
  if (has(SWORD)) {
    ctx.save();
    ctx.translate(x - cs * 0.3, y + cs * 0.05);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#e6ebf0';
    ctx.fillRect(-cs * 0.03, -cs * 0.42, cs * 0.06, cs * 0.38);
    ctx.fillStyle = '#e1bf47';
    ctx.fillRect(-cs * 0.1, -cs * 0.05, cs * 0.2, cs * 0.05);
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(-cs * 0.025, 0, cs * 0.05, cs * 0.1);
    ctx.restore();
  }
  const fx = x + cs * 0.3;
  const fy = y - cs * 0.12;
  const lick = Math.sin(now / 70) * cs * 0.03;
  if (has(LANTERN)) {
    ctx.fillStyle = '#8a7a52';
    ctx.fillRect(fx - cs * 0.01, fy - cs * 0.2, cs * 0.02, cs * 0.08);
    ctx.fillStyle = '#3b3544';
    ctx.fillRect(fx - cs * 0.09, fy - cs * 0.13, cs * 0.18, cs * 0.24);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(fx - cs * 0.06, fy - cs * 0.1, cs * 0.12, cs * 0.18);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.ellipse(fx, fy, cs * 0.03, cs * 0.05 + lick * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(fx - cs * 0.03, fy, cs * 0.06, cs * 0.3);
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath();
  ctx.ellipse(fx, fy - cs * 0.04, cs * 0.08, cs * 0.13 + lick, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath();
  ctx.ellipse(fx, fy - cs * 0.01, cs * 0.04, cs * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
}

