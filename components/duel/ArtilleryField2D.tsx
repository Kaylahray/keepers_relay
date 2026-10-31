'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { newDuel, sideToMove, WORLD_H, WORLD_W, type ArtilleryState, type ShotResult, type Side } from '@/lib/duel/artillery';

/** What the board needs from the field: where each tank's barrel pivot is, in pixels of the field box. */
export type FieldView = { tankScreen: (side: Side) => { x: number; y: number } };

type Props = {
  state: ArtilleryState;
  /** The barrel angle of the side to move (0 points right, 180 left). */
  aimAngle: number;
  /** A shot in the air: replayed over `state`, the board before it landed. */
  flight: ShotResult | null;
  onFlightDone: () => void;
  onScene?: (view: FieldView | null) => void;
};

/** The barrel pivot sits this far above the ground under a tank. */
const PIVOT = 12;
const TANK_COLORS = [
  { body: '#99ee2d', dark: '#4f8a10' },
  { body: '#ff56f6', dark: '#a3249c' },
] as const;

type Blast = { x: number; y: number; key: number };
type Hit = { side: Side; damage: number; key: number };

/** Flat cartoon terrain columns, from the world (y-up) into SVG (y-down). */
const svgY = (y: number) => WORLD_H - y;

/** The battlefield, drawn flat in 2D: blue sky, clouds, green hills, the stone tower and two tanks. */
export function ArtilleryField2D({ state, aimAngle, flight, onFlightDone, onScene }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewH, setViewH] = useState(420);
  const [shell, setShell] = useState<{ x: number; y: number } | null>(null);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const [blast, setBlast] = useState<Blast | null>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  const [shake, setShake] = useState(0);
  // Each barrel's angle: the side to move follows the aim, the other keeps where it last pointed.
  const [angles, setAngles] = useState<[number, number]>([45, 135]);
  const stateRef = useRef(state);
  const done = useRef(onFlightDone);
  useEffect(() => {
    stateRef.current = state;
    done.current = onFlightDone;
  }, [state, onFlightDone]);

  const moving = sideToMove(state);
  if (state.winner === null && angles[moving] !== aimAngle) {
    const next: [number, number] = [angles[0], angles[1]];
    next[moving] = aimAngle;
    setAngles(next);
  }

  // Keep the whole field width, and the ground at the bottom: a tall box shows more sky, a wide one less.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (width > 0) setViewH(Math.max(330, (WORLD_W * height) / width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tell the board where the tanks are on screen, for aiming by touch.
  useEffect(() => {
    const view: FieldView = {
      tankScreen(side) {
        const svg = svgRef.current;
        const wrap = wrapRef.current;
        const ctm = svg?.getScreenCTM();
        if (!svg || !wrap || !ctm) return { x: 0, y: 0 };
        const s = stateRef.current;
        const tank = s.tanks[side];
        const point = svg.createSVGPoint();
        point.x = tank.x;
        point.y = svgY((s.heights[tank.x] ?? 0) + PIVOT);
        const screen = point.matrixTransform(ctm);
        const box = wrap.getBoundingClientRect();
        return { x: screen.x - box.left, y: screen.y - box.top };
      },
    };
    onScene?.(view);
    return () => onScene?.(null);
  }, [onScene]);

  // A shot: the shell flies the rules' path, leaves a dotted trail, then bursts where it landed.
  useEffect(() => {
    if (!flight) return;
    const path = flight.path;
    const shooter = sideToMove(stateRef.current);
    const step = Math.max(2, Math.ceil(path.length / 95));
    let i = 0;
    let raf = 0;
    const timers: number[] = [];
    const frame = () => {
      // The first frame clears the last shot's blast; its trail is replaced as this one grows.
      if (i === 0) setBlast(null);
      i = Math.min(path.length - 1, i + step);
      setShell(path[i] ?? null);
      setTrail(path.slice(0, i + 1));
      if (i < path.length - 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      setShell(null);
      if (flight.impact) {
        setBlast({ ...flight.impact, key: Date.now() });
        setShake(Date.now());
        const target: Side = shooter === 0 ? 1 : 0;
        const struck: Side | null = flight.damage[target] > 0 ? target : flight.damage[shooter] > 0 ? shooter : null;
        if (struck !== null) setHit({ side: struck, damage: flight.damage[struck], key: Date.now() });
      }
      // The board moves on with the blast: the crater and the damage show as it bursts.
      timers.push(window.setTimeout(() => done.current(), 450));
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [flight]);

  // Effects fade on their own.
  useEffect(() => {
    if (!blast) return;
    const t = window.setTimeout(() => setBlast(null), 900);
    return () => window.clearTimeout(t);
  }, [blast]);
  useEffect(() => {
    if (!hit) return;
    const t = window.setTimeout(() => setHit(null), 1200);
    return () => window.clearTimeout(t);
  }, [hit]);

  // The tower as it was built: the stone columns, so craters in them show as chipped stone.
  const tower = useMemo(() => {
    const first = newDuel(state.seed).heights;
    let top = 0;
    let at = 0;
    for (let x = 380; x < 580; x += 1) if (first[x]! > top) [top, at] = [first[x]!, x];
    let left = at;
    let right = at;
    while (left > 0 && first[left - 1] === top) left -= 1;
    while (right < WORLD_W - 1 && first[right + 1] === top) right += 1;
    const base = Math.min(first[left - 1] ?? top, first[right + 1] ?? top);
    return { left, right, top, base };
  }, [state.seed]);

  const heights = state.heights;
  const ground = useMemo(() => {
    let d = `M0 ${WORLD_H} `;
    for (let x = 0; x < WORLD_W; x += 2) d += `L${x} ${svgY(heights[x]!)} `;
    return `${d}L${WORLD_W - 1} ${svgY(heights[WORLD_W - 1]!)} L${WORLD_W} ${WORLD_H} Z`;
  }, [heights]);
  const grass = useMemo(() => {
    const parts: string[] = [];
    let d = '';
    for (let x = 0; x < WORLD_W; x += 2) {
      const inTower = x >= tower.left - 1 && x <= tower.right + 1;
      if (inTower) {
        if (d) parts.push(d);
        d = '';
        continue;
      }
      d += `${d ? 'L' : 'M'}${x} ${svgY(heights[x]!)} `;
    }
    if (d) parts.push(d);
    return parts.join(' ');
  }, [heights, tower]);
  const stone = useMemo(() => {
    let d = `M${tower.left} ${svgY(tower.base - 6)} `;
    for (let x = tower.left; x <= tower.right; x += 1) d += `L${x} ${svgY(heights[x]!)} `;
    return `${d}L${tower.right} ${svgY(tower.base - 6)} Z`;
  }, [heights, tower]);
  const towerMid = Math.round((tower.left + tower.right) / 2);
  const flagStands = heights[towerMid]! >= tower.top - 2;
  const top = WORLD_H - viewH;

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden bg-[#7cc8ff]">
      <svg
        ref={svgRef}
        viewBox={`0 ${top} ${WORLD_W} ${viewH}`}
        preserveAspectRatio="xMidYMax meet"
        className="h-full w-full"
        role="img"
        aria-label="Battlefield with two tanks and a stone tower"
      >
        <defs>
          <linearGradient id="field-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5cb6f5" />
            <stop offset="1" stopColor="#bfe6ff" />
          </linearGradient>
          <pattern id="field-bricks" width="18" height="16" patternUnits="userSpaceOnUse">
            <rect width="18" height="16" fill="#a3a9b0" />
            <path d="M0 0 H18 M0 8 H18 M9 0 V8 M0 8 V16 M18 8 V16" stroke="#6b7178" strokeWidth="2" />
          </pattern>
        </defs>

        <g className={shake ? 'field-shake' : undefined} key={shake}>
          <rect x={-200} y={top - 400} width={WORLD_W + 400} height={viewH + 800} fill="url(#field-sky)" />
          {/* Clouds */}
          {[
            [140, 90, 1],
            [400, 50, 0.8],
            [720, 110, 1.1],
            [900, 40, 0.7],
          ].map(([x, y, s]) => (
            <g key={x} transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={0.95}>
              <ellipse cx="0" cy="0" rx="42" ry="16" />
              <ellipse cx="-22" cy="-6" rx="20" ry="16" />
              <ellipse cx="16" cy="-12" rx="24" ry="20" />
            </g>
          ))}
          {/* Hills behind the field */}
          <path d="M-200 430 Q 100 300 320 400 Q 500 320 700 395 Q 880 300 1160 410 L1160 560 L-200 560Z" fill="#a8e08f" />
          <path d="M-200 450 Q 170 370 400 430 Q 620 370 840 425 Q 1010 380 1160 440 L1160 560 L-200 560Z" fill="#8fd97a" />

          {/* The ground, with every crater the duel has made */}
          <path d={ground} fill="#7a4f2a" />
          <path d={ground} fill="none" stroke="#5e3b1e" strokeWidth="2" />
          <path d={grass} fill="none" stroke="#57b543" strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" />
          <path d={grass} fill="none" stroke="#6cc455" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" transform="translate(0 -3)" />

          {/* The stone tower, chipped wherever a shell has hit it */}
          <path d={stone} fill="url(#field-bricks)" stroke="#5b6168" strokeWidth="2" strokeLinejoin="round" />
          {flagStands ? (
            <g transform={`translate(${towerMid} ${svgY(tower.top)})`}>
              <rect x="-1.5" y="-34" width="3" height="34" fill="#444" />
              <path d="M1.5 -34 L24 -27 L1.5 -20Z" fill="#e1bf47" />
            </g>
          ) : null}

          {([0, 1] as Side[]).map((side) => (
            <Tank
              key={side}
              side={side}
              x={state.tanks[side].x}
              ground={heights[state.tanks[side].x]!}
              angle={angles[side]}
              dead={state.tanks[side].hp <= 0}
              hitKey={hit?.side === side ? hit.key : null}
            />
          ))}

          {/* The last shot's dotted trail stays until the next one */}
          {trail
            .filter((_, i) => i % 6 === 0)
            .map((p, i) => (
              <circle key={i} cx={p.x} cy={svgY(p.y)} r="3.5" fill="#fff" stroke="#1d1d1d" strokeOpacity="0.3" strokeWidth="1" />
            ))}
          {shell ? <circle cx={shell.x} cy={svgY(shell.y)} r="6" fill="#1d1d1d" stroke="#fff" strokeWidth="2" /> : null}

          {blast ? (
            <g key={`blast-${blast.key}`} transform={`translate(${blast.x} ${svgY(blast.y)})`}>
              <circle className="field-blast-outer" r="40" fill="#ff8a1f" />
              <circle className="field-blast-inner" r="20" fill="#ffe08a" />
              {[-16, 0, 14].map((dx, i) => (
                <circle key={dx} className="field-smoke" cx={dx} cy={-6} r={9 + i * 2} fill="#6b6b6b" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </g>
          ) : null}

          {hit ? (
            <text
              key={`hit-${hit.key}`}
              className="field-damage"
              x={state.tanks[hit.side].x}
              y={svgY(heights[state.tanks[hit.side].x]! + 40)}
              textAnchor="middle"
              fontSize="26"
              fontWeight="900"
              fill={hit.side === 0 ? '#99ee2d' : '#ff56f6'}
              stroke="#111"
              strokeWidth="5"
              paintOrder="stroke"
              fontFamily="Unbounded, system-ui, sans-serif"
            >
              −{hit.damage}
            </text>
          ) : null}
        </g>
      </svg>
    </div>
  );
}

/** A cartoon tank in its side's colour. Hit, it flashes and jolts; at zero health it is a smoking wreck. */
function Tank({ side, x, ground, angle, dead, hitKey }: { side: Side; x: number; ground: number; angle: number; dead: boolean; hitKey: number | null }) {
  const color = TANK_COLORS[side];
  return (
    <g transform={`translate(${x} ${svgY(ground)}) scale(0.8)`}>
      <g key={hitKey ?? 'still'} className={hitKey ? 'field-tank-hit' : undefined} opacity={dead ? 0.55 : 1}>
        <g transform={`translate(0 -22) rotate(${-angle})`}>
          <rect x="0" y="-4" width="34" height="8" rx="3" fill="#2a2a2a" />
        </g>
        <circle cx="0" cy="-24" r="12" fill={dead ? '#555' : color.body} stroke={dead ? '#333' : color.dark} strokeWidth="3" />
        <path d="M-28 -12 L28 -12 L22 -26 L-22 -26Z" fill={dead ? '#555' : color.body} stroke={dead ? '#333' : color.dark} strokeWidth="3" strokeLinejoin="round" />
        <rect x="-33" y="-14" width="66" height="14" rx="7" fill="#333" />
        {[-22, -8, 6, 20].map((cx) => (
          <circle key={cx} cx={cx + 1} cy="-7" r="4.5" fill="#666" stroke="#222" strokeWidth="1.5" />
        ))}
      </g>
      {dead
        ? [0, 1, 2].map((i) => <circle key={i} className="field-wreck-smoke" cx={-6 + i * 6} cy={-34} r={7} fill="#555" style={{ animationDelay: `${i * 0.6}s` }} />)
        : null}
    </g>
  );
}
