import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCarRig } from '@/lib/game/apex/car-model';
import { LANE, type LaneRow } from '@/lib/game/lane-runner';

/**
 * The lane runner drawn as a daytime highway: your car in three lanes of asphalt, grass verges,
 * trees and a town going by, striped road barriers to dodge and gold coins to grab. Only the
 * drawing changes. Every position comes from the same rules the chain replays (the car's x, each
 * row's distance, blocked lanes and coin), so what you see is what is scored.
 *
 * Everything is built from simple shapes and generated textures: no model or image files.
 * (The file keeps its first name, from when the drive was set at night.)
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
const ROAD_LENGTH = 220;
const BUILDINGS = 40;
const TREES = 56;
const SCENERY_LENGTH = 132;
const DASH_GAP = 4;
const DASHES = 24;
/** One tile of asphalt or grass texture, in scene units, so the ground scrolls at road speed. */
const TILE = 4;

const COLORS = {
  fog: 0xcfe6f5,
  grass: 0x6aaa45,
  line: 0xffffff,
  body: 0x1f4fd1,
  crashed: 0xaf2a3a,
  coin: 0xffc533,
};

/** The rules' speed, mirrored only to scroll the road; rows move by themselves. */
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

/** A small deterministic generator for the scenery's layout, so it looks the same every load. */
function layout(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Speckles of `colors` over `base`, repeating without seams. */
function speckle(base: string, colors: string[], count: number, seed: number) {
  const texture = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    const rand = layout(seed);
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 1 + rand() * 2);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Colours for the road lines. The game uses the default (white). */
export type DriveTheme = { edge: number; lane: number };

export type DriveOptions = {
  theme?: Partial<DriveTheme>;
  /** Keep the last frame readable, so a still can be saved from the canvas. */
  stills?: boolean;
};

export function createNightDrive(canvas: HTMLCanvasElement, options: DriveOptions = {}): NightDrive | null {
  const theme: DriveTheme = { edge: COLORS.line, lane: COLORS.line, ...options.theme };
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

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T) => {
    disposables.push(thing);
    return thing;
  };

  const scene = new THREE.Scene();
  scene.background = keep(
    canvasTexture(4, 256, (ctx) => {
      const sky = ctx.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, '#3f8fd8');
      sky.addColorStop(0.55, '#8cc6f0');
      sky.addColorStop(0.85, '#d9eef8');
      sky.addColorStop(1, '#fbeed2');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 4, 256);
    }),
  );
  scene.fog = new THREE.Fog(COLORS.fog, 40, 125);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
  camera.position.set(0, 3.4, 7.4);
  camera.lookAt(0, 0.2, -16);

  // Daylight: a soft sky, a warm sun, and a studio reflection for the car's paint and glass.
  const pmrem = keep(new THREE.PMREMGenerator(renderer));
  const room = new RoomEnvironment();
  scene.environment = keep(pmrem.fromScene(room, 0.04).texture);
  scene.environmentIntensity = 0.6;
  room.dispose();
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x6b8f4a, 1.5));
  const sunLight = new THREE.DirectionalLight(0xfff3dc, 2.4);
  sunLight.position.set(-6, 12, 6);
  scene.add(sunLight);

  // Grass either side, and the asphalt road with its painted lines. Both scroll with the drive.
  const grassMap = keep(speckle('#6aaa45', ['#5c9a3a', '#7dbb52', '#4f8a33'], 900, 3));
  grassMap.repeat.set(60, 60);
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(240, 240)), keep(new THREE.MeshLambertMaterial({ map: grassMap })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -90);
  scene.add(ground);

  const asphaltMap = keep(speckle('#45484e', ['#3a3d42', '#55585e', '#2f3236', '#62656b'], 1400, 5));
  asphaltMap.repeat.set(2, ROAD_LENGTH / TILE);
  const road = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_LENGTH)),
    keep(new THREE.MeshLambertMaterial({ map: asphaltMap })),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -100);
  scene.add(road);

  // Solid edge lines, and a pale concrete kerb where the road meets the grass.
  const edgeMaterial = keep(new THREE.MeshLambertMaterial({ color: theme.edge }));
  const kerbMaterial = keep(new THREE.MeshLambertMaterial({ color: 0xd8d4cb }));
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 0.02, ROAD_LENGTH)), edgeMaterial);
    edge.position.set(side * (ROAD_HALF - 0.3), 0.01, -100);
    scene.add(edge);
    const kerb = new THREE.Mesh(keep(new THREE.BoxGeometry(0.35, 0.14, ROAD_LENGTH)), kerbMaterial);
    kerb.position.set(side * (ROAD_HALF + 0.17), 0.07, -100);
    scene.add(kerb);
  }

  // Lane dashes between the three lanes, scrolled by the distance driven.
  const dashes = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(0.14, 0.02, 1.6)),
    keep(new THREE.MeshLambertMaterial({ color: theme.lane })),
    DASHES * 2,
  );
  scene.add(dashes);

  // A town set back from the road: pale walls with windows, in a few soft colours.
  const facade = keep(
    canvasTexture(64, 128, (ctx) => {
      ctx.fillStyle = '#efe9dc';
      ctx.fillRect(0, 0, 64, 128);
      for (let y = 6; y < 122; y += 12) {
        for (let x = 6; x < 58; x += 14) {
          ctx.fillStyle = '#5d7fa3';
          ctx.fillRect(x, y, 8, 7);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(x, y, 8, 2);
        }
      }
    }),
  );
  facade.wrapS = THREE.RepeatWrapping;
  facade.wrapT = THREE.RepeatWrapping;
  facade.repeat.set(1, 2);
  const buildings = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(1, 1, 1)),
    keep(new THREE.MeshLambertMaterial({ map: facade })),
    BUILDINGS,
  );
  const buildingBase: { x: number; z: number; w: number; h: number; d: number }[] = [];
  {
    const rand = layout(1234);
    const tint = new THREE.Color();
    const palette = [0xf3d9b1, 0xe8c4c4, 0xc9dbe8, 0xd7e4c4, 0xf0e6d2, 0xd9cbe6];
    for (let i = 0; i < BUILDINGS; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = 3 + rand() * 4;
      const h = 4 + rand() * rand() * 18;
      const d = 3 + rand() * 3;
      const x = side * (ROAD_HALF + 13 + w / 2 + rand() * 14);
      const z = -(i / BUILDINGS) * SCENERY_LENGTH;
      buildingBase.push({ x, z, w, h, d });
      tint.setHex(palette[Math.floor(rand() * palette.length)]!);
      buildings.setColorAt(i, tint);
    }
  }
  scene.add(buildings);

  // Trees along the verges, close enough to give a feeling of speed.
  const foliage = new THREE.InstancedMesh(
    keep(new THREE.ConeGeometry(1, 1, 8)),
    keep(new THREE.MeshLambertMaterial({ color: 0xffffff })),
    TREES,
  );
  const trunks = new THREE.InstancedMesh(
    keep(new THREE.CylinderGeometry(0.12, 0.16, 1, 6)),
    keep(new THREE.MeshLambertMaterial({ color: 0x7a5232 })),
    TREES,
  );
  const treeBase: { x: number; z: number; r: number; h: number }[] = [];
  {
    const rand = layout(77);
    const tint = new THREE.Color();
    for (let i = 0; i < TREES; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      treeBase.push({
        x: side * (ROAD_HALF + 2 + rand() * 8),
        z: -(i / TREES) * SCENERY_LENGTH,
        r: 0.8 + rand() * 0.7,
        h: 2.6 + rand() * 2.2,
      });
      tint.setHSL(0.27 + rand() * 0.07, 0.5, 0.3 + rand() * 0.12);
      foliage.setColorAt(i, tint);
    }
  }
  scene.add(foliage, trunks);

  // Barriers (red and white road blocks) and coins, pooled: at most three barriers and one coin per row on screen.
  const MAX_ROWS = 20;
  const BARRIER_CAP = MAX_ROWS * LANE.LANES;
  const COIN_CAP = MAX_ROWS;
  const stripes = keep(
    canvasTexture(128, 32, (ctx) => {
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(0, 0, 128, 32);
      ctx.fillStyle = '#e0262f';
      for (let x = -32; x < 160; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 32);
        ctx.lineTo(x + 16, 32);
        ctx.lineTo(x + 32, 0);
        ctx.lineTo(x + 16, 0);
        ctx.closePath();
        ctx.fill();
      }
    }),
  );
  const barriers = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(LANE_UNITS * 0.82, 0.95, 0.5)),
    keep(new THREE.MeshLambertMaterial({ map: stripes })),
    BARRIER_CAP,
  );
  scene.add(barriers);
  const barrierTops = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(LANE_UNITS * 0.84, 0.1, 0.54)),
    keep(new THREE.MeshLambertMaterial({ color: 0x3a3d42 })),
    BARRIER_CAP,
  );
  scene.add(barrierTops);
  const coins = new THREE.InstancedMesh(
    keep(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24)),
    keep(new THREE.MeshStandardMaterial({ color: COLORS.coin, metalness: 0.85, roughness: 0.3, emissive: 0x5a3a00 })),
    COIN_CAP,
  );
  scene.add(coins);

  // The car: the Apex GT, built in code (lib/game/apex, from the "Apex GT" AI Studio app).
  const car = new THREE.Group();
  const apex = createCarRig({ paintColor: COLORS.body, accentColor: 0xffffff, headlightsOn: false });
  keep(apex);
  // The rig faces +Z and is a real 4.7 m long; the road runs away from the camera toward -Z and a
  // lane is 2.4 units wide, so it is turned round and scaled to fill a lane.
  apex.root.rotation.y = Math.PI;
  apex.root.scale.setScalar(0.68);
  for (const lamp of apex.lights.taillightPointLights) lamp.intensity = 0.2;
  car.add(apex.root);
  let paintCrashed = false;
  let wheelTurn = 0;
  // A soft contact shadow under the car, so it sits on the road.
  const shadow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2.1, 3.6)),
    keep(
      new THREE.MeshBasicMaterial({
        map: keep(
          canvasTexture(64, 128, (ctx) => {
            const blob = ctx.createRadialGradient(32, 64, 4, 32, 64, 60);
            blob.addColorStop(0, 'rgba(0,0,0,0.55)');
            blob.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = blob;
            ctx.fillRect(0, 0, 64, 128);
          }),
        ),
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  car.add(shadow);
  scene.add(car);

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
    camera.aspect = w / Math.max(1, h);
    // Narrow screens need a wider view to keep all three lanes in frame.
    camera.fov = camera.aspect < 0.75 ? 74 : 62;
    camera.updateProjectionMatrix();
  }

  /** Where a piece of scenery is now: it slides toward the camera and wraps round to the far end. */
  const scrolled = (z: number, travelled: number) => ((((z + travelled) % SCENERY_LENGTH) + SCENERY_LENGTH) % SCENERY_LENGTH) - SCENERY_LENGTH + 8;

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
    // Steer into the move, lean on the suspension, and turn the wheels with the distance driven.
    wheelTurn = travelled / (0.33 * 0.68);
    apex.update({ steeringAngle: (targetX - carX) * 0.35, bodyRoll: (carX - targetX) * 0.09, wheelSpin: wheelTurn });
    if (state.crashed !== paintCrashed) {
      paintCrashed = state.crashed;
      apex.setPaintColor(state.crashed ? COLORS.crashed : COLORS.body);
    }

    // The ground under the car runs toward the camera.
    asphaltMap.offset.y = (travelled / TILE) % 1;
    grassMap.offset.y = ((travelled / 240) * 60) % 1;

    // Lane dashes.
    for (let i = 0; i < DASHES; i += 1) {
      const z = -((i * DASH_GAP - (travelled % DASH_GAP)) % (DASHES * DASH_GAP)) + 2;
      for (const [k, side] of [-0.5, 0.5].entries()) {
        matrix.makeTranslation(side * LANE_UNITS, 0.01, z);
        dashes.setMatrixAt(i * 2 + k, matrix);
      }
    }
    dashes.instanceMatrix.needsUpdate = true;

    // Town and trees going by at road speed.
    for (let i = 0; i < BUILDINGS; i += 1) {
      const b = buildingBase.at(i);
      if (!b) continue;
      position.set(b.x, b.h / 2, scrolled(b.z, travelled * 0.9));
      size.set(b.w, b.h, b.d);
      matrix.compose(position, upright, size);
      buildings.setMatrixAt(i, matrix);
    }
    buildings.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < TREES; i += 1) {
      const t = treeBase.at(i);
      if (!t) continue;
      const z = scrolled(t.z, travelled);
      position.set(t.x, 0.6 + t.h / 2, z);
      size.set(t.r, t.h, t.r);
      matrix.compose(position, upright, size);
      foliage.setMatrixAt(i, matrix);
      position.set(t.x, 0.4, z);
      size.set(1, 0.8, 1);
      matrix.compose(position, upright, size);
      trunks.setMatrixAt(i, matrix);
    }
    foliage.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;

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

    renderer.render(scene, camera);
  }

  function dispose() {
    for (const thing of disposables) thing.dispose();
    renderer.dispose();
  }

  // Pools are sized for the most rows at once; counts are set each frame. Three works out whether a
  // pool is on screen once, from its first (empty) contents, so pooled meshes are always drawn.
  for (const pooled of [dashes, buildings, foliage, trunks, barriers, barrierTops, coins]) pooled.frustumCulled = false;
  barriers.count = 0;
  barrierTops.count = 0;
  coins.count = 0;

  return { canvas, render, dispose };
}
