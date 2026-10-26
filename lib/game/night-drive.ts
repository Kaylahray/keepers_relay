import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LANE, type LaneRow } from '@/lib/game/lane-runner';

/**
 * The lane runner drawn as a night drive: your car in three lanes of a neon road between city
 * buildings. Only the drawing changes. Every position comes from the same rules the chain replays
 * (the car's x, each row's distance, blocked lanes and coin), so what you see is what is scored.
 *
 * Everything is built from simple shapes and generated textures: no model or image files.
 */

export type DriveState = {
  /** Car position from the rules: 0 is the left lane's centre, 2000 the right lane's. */
  x: number;
  rows: LaneRow[];
  tick: number;
  /** The run ended by hitting a barrier (not by reaching the time limit). */
  crashed: boolean;
};

export type NightDrive = {
  readonly canvas: HTMLCanvasElement;
  render(state: DriveState, now: number): void;
  dispose(): void;
};

const LANE_UNITS = 2.4; // one lane, in scene units
const Z_SCALE = 0.012; // a row's distance in rule units -> scene depth
const ROAD_HALF = LANE_UNITS * 1.5 + 0.6;
const BUILDINGS = 64;
const CITY_LENGTH = 132;
const DASH_GAP = 4;
const DASHES = 24;

const COLORS = {
  sky: '#0d0420',
  fog: 0x1a0733,
  road: 0x07060f,
  lane: 0x99ee2d,
  edge: 0xff56f6,
  barrier: 0xff2bd6,
  coin: 0xffcf3a,
  body: 0x14161f,
  glow: 0x406aff,
  tail: 0xff2244,
};

/** The rules' speed, mirrored only to scroll the road markings; rows move by themselves. */
function speedAt(tick: number): number {
  return Math.min(220, 60 + 2 * Math.floor(tick / 45));
}

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A small deterministic generator for the city's layout, so it looks the same every load. */
function layout(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Accent colours for the road edges, lane dashes and the car's underglow. The game uses the default. */
export type DriveTheme = { edge: number; lane: number; glow: number };

export type DriveOptions = {
  theme?: Partial<DriveTheme>;
  /** Keep the last frame readable, so a still can be saved from the canvas. */
  stills?: boolean;
};

export function createNightDrive(canvas: HTMLCanvasElement, options: DriveOptions = {}): NightDrive | null {
  const theme: DriveTheme = { edge: COLORS.edge, lane: COLORS.lane, glow: COLORS.glow, ...options.theme };
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: Boolean(options.stills),
    });
  } catch {
    return null;
  }
  const small = window.matchMedia('(max-width: 767px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = canvasTexture(4, 256, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#05010d');
    sky.addColorStop(0.55, '#1a0733');
    sky.addColorStop(1, '#4a0f5c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 4, 256);
  });
  scene.fog = new THREE.Fog(COLORS.fog, 28, 92);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
  camera.position.set(0, 3.4, 7.4);
  camera.lookAt(0, 0.2, -16);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T) => {
    disposables.push(thing);
    return thing;
  };

  // Sun: a striped disc low on the horizon, ignoring fog so it stays bright.
  const sunTexture = keep(
    canvasTexture(256, 256, (ctx) => {
      const glow = ctx.createLinearGradient(0, 0, 0, 256);
      glow.addColorStop(0, '#ffd86b');
      glow.addColorStop(0.6, '#ff5ab0');
      glow.addColorStop(1, '#a12cff');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(128, 128, 126, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 7; i += 1) {
        const y = 140 + i * 16;
        ctx.fillRect(0, y, 256, 3 + i * 1.4);
      }
    }),
  );
  const sun = new THREE.Mesh(
    keep(new THREE.CircleGeometry(16, 48)),
    keep(new THREE.MeshBasicMaterial({ map: sunTexture, transparent: true, fog: false })),
  );
  sun.position.set(0, 7, -150);
  scene.add(sun);

  // Ground and road.
  const ground = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(240, 240)),
    keep(new THREE.MeshBasicMaterial({ color: 0x090313 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -90);
  scene.add(ground);

  const grid = new THREE.GridHelper(240, 60, 0x5a1b8c, 0x2a0b45);
  grid.position.set(0, -0.01, -90);
  scene.add(grid);
  keep(grid.geometry);
  keep(grid.material as THREE.Material);

  const road = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(ROAD_HALF * 2, 220)),
    keep(new THREE.MeshBasicMaterial({ color: COLORS.road })),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -100);
  scene.add(road);

  const edgeMaterial = keep(new THREE.MeshBasicMaterial({ color: theme.edge }));
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, 0.05, 220)), edgeMaterial);
    edge.position.set(side * ROAD_HALF, 0.03, -100);
    scene.add(edge);
  }

  // Lane dashes between the three lanes, scrolled by the distance driven.
  const dashes = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(0.1, 0.03, 1.4)),
    keep(new THREE.MeshBasicMaterial({ color: theme.lane })),
    DASHES * 2,
  );
  scene.add(dashes);

  // City: instanced towers on both sides with lit windows, scrolling past.
  const windows = keep(
    canvasTexture(64, 128, (ctx) => {
      ctx.fillStyle = '#0b0618';
      ctx.fillRect(0, 0, 64, 128);
      const rand = layout(7);
      for (let y = 4; y < 124; y += 8) {
        for (let x = 4; x < 60; x += 8) {
          const lit = rand();
          if (lit < 0.45) continue;
          ctx.fillStyle = lit > 0.9 ? '#ff7ae6' : lit > 0.75 ? '#7ad7ff' : '#ffd86b';
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }),
  );
  windows.wrapS = THREE.RepeatWrapping;
  windows.wrapT = THREE.RepeatWrapping;
  windows.repeat.set(1, 2);
  const towers = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(1, 1, 1)),
    keep(new THREE.MeshBasicMaterial({ map: windows })),
    BUILDINGS,
  );
  const towerBase: { x: number; z: number; w: number; h: number; d: number }[] = [];
  {
    const rand = layout(1234);
    const tint = new THREE.Color();
    for (let i = 0; i < BUILDINGS; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = 2.4 + rand() * 3.4;
      const h = 4 + rand() * rand() * 26;
      const d = 2.4 + rand() * 3;
      const x = side * (ROAD_HALF + 3 + w / 2 + rand() * 9);
      const z = -(i / BUILDINGS) * CITY_LENGTH;
      towerBase.push({ x, z, w, h, d });
      tint.setHSL(0.72 + rand() * 0.2, 0.6, 0.55 + rand() * 0.3);
      towers.setColorAt(i, tint);
    }
  }
  scene.add(towers);

  // Barriers and coins, pooled: at most three barriers and one coin per row on screen.
  const MAX_ROWS = 20;
  const BARRIER_CAP = MAX_ROWS * LANE.LANES;
  const COIN_CAP = MAX_ROWS;
  const barriers = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(LANE_UNITS * 0.82, 0.95, 0.5)),
    keep(new THREE.MeshBasicMaterial({ color: COLORS.barrier })),
    BARRIER_CAP,
  );
  scene.add(barriers);
  const barrierTops = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(LANE_UNITS * 0.84, 0.1, 0.54)),
    keep(new THREE.MeshBasicMaterial({ color: 0xffd1fb })),
    BARRIER_CAP,
  );
  scene.add(barrierTops);
  const coins = new THREE.InstancedMesh(
    keep(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24)),
    keep(new THREE.MeshBasicMaterial({ color: COLORS.coin })),
    COIN_CAP,
  );
  scene.add(coins);

  // The car: a low body, a cabin, wheels, tail lights and a blue underglow.
  const car = new THREE.Group();
  const bodyMaterial = keep(new THREE.MeshBasicMaterial({ color: COLORS.body }));
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(1.5, 0.42, 2.7)), bodyMaterial);
  body.position.y = 0.42;
  car.add(body);
  const cabin = new THREE.Mesh(
    keep(new THREE.BoxGeometry(1.1, 0.38, 1.25)),
    keep(new THREE.MeshBasicMaterial({ color: 0x2a3550 })),
  );
  cabin.position.set(0, 0.8, 0.15);
  car.add(cabin);
  const stripe = new THREE.Mesh(
    keep(new THREE.BoxGeometry(1.52, 0.05, 2.72)),
    keep(new THREE.MeshBasicMaterial({ color: theme.lane })),
  );
  stripe.position.y = 0.56;
  car.add(stripe);
  const tailMaterial = keep(new THREE.MeshBasicMaterial({ color: COLORS.tail }));
  for (const side of [-0.5, 0.5]) {
    const tail = new THREE.Mesh(keep(new THREE.BoxGeometry(0.42, 0.1, 0.05)), tailMaterial);
    tail.position.set(side, 0.5, 1.37);
    car.add(tail);
  }
  const wheelGeometry = keep(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 16));
  const wheelMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x050505 }));
  for (const [x, z] of [
    [-0.78, -0.85],
    [0.78, -0.85],
    [-0.78, 0.85],
    [0.78, 0.85],
  ]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.26, z);
    car.add(wheel);
  }
  const underglow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(1.9, 3.1)),
    keep(new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.55 })),
  );
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = 0.02;
  car.add(underglow);
  scene.add(car);

  // Glow: bloom makes every bright colour bleed into the dark. Off on phones to keep it smooth.
  let composer: EffectComposer | null = null;
  if (!small) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.35));
    composer.addPass(new OutputPass());
  }

  const matrix = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const coinTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const unit = new THREE.Vector3(1, 1, 1);
  const upright = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const size = new THREE.Vector3();
  let width = 0;
  let height = 0;
  let distance = 0;
  let lastTick = 0;
  let carX = 0;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    // Narrow screens need a wider view to keep all three lanes in frame.
    camera.fov = camera.aspect < 0.75 ? 74 : 62;
    camera.updateProjectionMatrix();
  }

  function render(state: DriveState, now: number) {
    resize();
    // A new run starts back at tick 0.
    if (state.tick < lastTick) distance = 0;
    for (let t = lastTick; t < state.tick; t += 1) distance += speedAt(t);
    lastTick = state.tick;
    const travelled = distance * Z_SCALE;

    // Car: glide toward the rules' x, lean into the move, flash red on a crash.
    const targetX = (state.x / LANE.LANE_W - 1) * LANE_UNITS;
    carX += (targetX - carX) * 0.35;
    car.position.x = carX;
    car.rotation.z = (carX - targetX) * 0.08;
    bodyMaterial.color.setHex(state.crashed ? 0xaf2a3a : COLORS.body);

    // Lane dashes.
    for (let i = 0; i < DASHES; i += 1) {
      const z = -((i * DASH_GAP - (travelled % DASH_GAP)) % (DASHES * DASH_GAP)) + 2;
      for (const [k, side] of [-0.5, 0.5].entries()) {
        matrix.makeTranslation(side * LANE_UNITS, 0.02, z);
        dashes.setMatrixAt(i * 2 + k, matrix);
      }
    }
    dashes.instanceMatrix.needsUpdate = true;

    // City scrolling past at road speed.
    for (let i = 0; i < BUILDINGS; i += 1) {
      const b = towerBase.at(i);
      if (!b) continue;
      const z = (((b.z + travelled * 0.9) % CITY_LENGTH) + CITY_LENGTH) % CITY_LENGTH - CITY_LENGTH + 8;
      position.set(b.x, b.h / 2, z);
      size.set(b.w, b.h, b.d);
      matrix.compose(position, upright, size);
      towers.setMatrixAt(i, matrix);
    }
    towers.instanceMatrix.needsUpdate = true;

    // Barriers and coins, exactly where the rules put them.
    let barrierCount = 0;
    let coinCount = 0;
    for (const row of state.rows) {
      if (row.y < -200 || row.y > LANE.VIEW_DEPTH) continue;
      const z = -row.y * Z_SCALE;
      for (let lane = 0; lane < LANE.LANES; lane += 1) {
        if (!(row.blocked & (1 << lane)) || barrierCount >= BARRIER_CAP) continue;
        const x = (lane - 1) * LANE_UNITS;
        matrix.makeTranslation(x, 0.48, z);
        barriers.setMatrixAt(barrierCount, matrix);
        matrix.makeTranslation(x, 0.98, z);
        barrierTops.setMatrixAt(barrierCount, matrix);
        barrierCount += 1;
      }
      if (row.coin >= 0 && coinCount < COIN_CAP) {
        spin.setFromAxisAngle(up, now / 300 + row.y * 0.01).multiply(coinTilt);
        position.set((row.coin - 1) * LANE_UNITS, 0.9 + Math.sin(now / 200 + row.y) * 0.08, z);
        matrix.compose(position, spin, unit);
        coins.setMatrixAt(coinCount, matrix);
        coinCount += 1;
      }
    }
    barriers.count = barrierCount;
    barrierTops.count = barrierCount;
    coins.count = coinCount;
    barriers.instanceMatrix.needsUpdate = true;
    barrierTops.instanceMatrix.needsUpdate = true;
    coins.instanceMatrix.needsUpdate = true;

    // A small shake on a crash.
    const shake = state.crashed ? Math.sin(now / 25) * 0.06 : 0;
    camera.position.set(carX * 0.35 + shake, 3.4, 7.4);
    camera.lookAt(carX * 0.2, 0.2, -16);

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function dispose() {
    composer?.dispose();
    for (const thing of disposables) thing.dispose();
    renderer.dispose();
  }

  // Pools are sized for the most rows at once; counts are set each frame. Three works out whether a
  // pool is on screen once, from its first (empty) contents, so pooled meshes are always drawn.
  for (const pooled of [dashes, towers, barriers, barrierTops, coins]) pooled.frustumCulled = false;
  barriers.count = 0;
  barrierTops.count = 0;
  coins.count = 0;

  return { canvas, render, dispose };
}
