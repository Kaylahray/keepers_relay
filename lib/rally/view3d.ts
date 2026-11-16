import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CAR_COLORS, type RallyFrame } from '@/lib/rally/draw';
import { ITEMS, RALLY, SLICK_ITEM, type CarView, type PadView } from '@/lib/rally/rules';
import { buildCar, buildWorld, METRES, shadowTexture, skyTexture, tagTexture, type CarRig, type World } from '@/lib/rally/scene3d';

/** A car's place on screen: where, which way, how fast. */
type Pose = { x: number; z: number; angle: number; speed: number };

/** What one car looks like now and a tick ago, to draw smoothly between the race's 20 ticks a second. */
type Smooth = { from: Pose; to: Pose; at: number; hp: number; wrecked: boolean; tag: string };

type Spark = { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; color: THREE.Color };

const SPARKS = 160;
/** Further than this between two ticks is a car put back on the road, not driving: no smoothing. */
const JUMP_METRES = 8;

/** The rules' angle (y down the page) as a turn about three.js's up axis, for a model facing +z. */
function yaw(angle: number): number {
  return Math.PI / 2 - angle;
}

function poseOf(car: CarView): Pose {
  return { x: car.x * METRES, z: car.y * METRES, angle: car.angle, speed: car.speed };
}

function turnBetween(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Whether this device should start on lighter settings: a phone or tablet. */
function lightweight(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

/**
 * The race in 3D from behind your car, or behind the leader when watching. It draws whatever frame
 * it's handed, so practice, live races and replays all look the same. Throws if the device has no WebGL.
 */
export class RallyView3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, 1, 0.3, 1200);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.8);
  private readonly key = new THREE.DirectionalLight(0xffffff, 1.3);
  private readonly light: boolean;
  private readonly shadow = shadowTexture();
  private readonly env: THREE.WebGLRenderTarget;
  private readonly map = document.createElement('canvas');
  private world: World | null = null;
  private sky: THREE.Texture | null = null;
  /** The neon glow over bright lights; off on phones, where it costs too much. */
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private worldKey = '';
  private rigs: CarRig[] = [];
  /** Per car: the Ward's bubble. */
  private wards: THREE.Mesh[] = [];
  private readonly wardMaterial = new THREE.MeshBasicMaterial({ color: 0xff56f6, wireframe: true, transparent: true, opacity: 0.5 });
  private readonly wardShape = new THREE.SphereGeometry(3.2, 16, 12);
  /** Each pad's glowing disc and the item floating over it. */
  private pads: { disc: THREE.Mesh; floater: THREE.Mesh }[] = [];
  private padKey = '';
  private readonly padParts: { dispose: () => void }[] = [];
  /** Slicks and Barricades, reused from a small pool. */
  private readonly slicks: THREE.Mesh[] = [];
  private readonly blocks: THREE.Mesh[] = [];
  private readonly hazardParts: { dispose: () => void }[] = [];
  private smooth: Smooth[] = [];
  private readonly sparks: Spark[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private cursor = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly cam = { pos: new THREE.Vector3(0, 60, 0), look: new THREE.Vector3(), ready: false, shake: 0 };
  private last = 0;
  private readonly resize: ResizeObserver;

  constructor(private readonly container: HTMLElement) {
    this.light = lightweight();
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.light, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.light ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !this.light;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    canvas.setAttribute('aria-label', 'The race in 3D, from behind your car');
    container.appendChild(canvas);

    // The small map of the whole road in the corner.
    this.map.style.cssText = 'position:absolute;right:16px;top:calc(env(safe-area-inset-top) + 76px);width:min(30vmin,150px);height:min(30vmin,150px);pointer-events:none;border-radius:14px;background:rgba(10,11,15,0.55)';
    container.appendChild(this.map);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.scene.add(this.hemi, this.key, this.key.target);
    this.key.castShadow = !this.light;
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 });
    this.key.shadow.bias = -0.0005;

    this.sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0xffffff }), SPARKS);
    this.sparkMesh.frustumCulled = false;
    for (let i = 0; i < SPARKS; i += 1) {
      this.sparks.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, color: new THREE.Color() });
      this.hide(i);
      this.sparkMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.scene.add(this.sparkMesh);

    // Up to one Slick and one Barricade per car.
    const slickShape = new THREE.CircleGeometry(16 * RALLY.SCALE * METRES, 24);
    slickShape.rotateX(-Math.PI / 2);
    const slickMaterial = new THREE.MeshStandardMaterial({ color: 0x1a0f2e, emissive: 0x6a3cff, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.92 });
    const blockShape = new THREE.BoxGeometry(20 * RALLY.SCALE * METRES, 1.6, 1.6);
    const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff7a00, emissiveIntensity: 0.4, roughness: 0.5 });
    this.hazardParts.push(slickShape, slickMaterial, blockShape, blockMaterial);
    for (let n = 0; n < RALLY.MAX_CARS; n += 1) {
      const slick = new THREE.Mesh(slickShape, slickMaterial);
      slick.position.y = 0.05;
      const block = new THREE.Mesh(blockShape, blockMaterial);
      block.position.y = 0.8;
      block.castShadow = !this.light;
      slick.visible = block.visible = false;
      this.slicks.push(slick);
      this.blocks.push(block);
      this.scene.add(slick, block);
    }

    if (!this.light) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  private fit() {
    const [w, h] = [this.container.clientWidth || 1, this.container.clientHeight || 1];
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Builds the world for a new road, and the cars for a new field. */
  private prepare(frame: RallyFrame) {
    const first = frame.track[0];
    const key = `${frame.map ?? 'seed'}:${frame.track.length}:${first?.x}:${first?.y}`;
    if (key !== this.worldKey && frame.track.length > 2) {
      if (this.world) {
        this.scene.remove(this.world.group);
        this.world.dispose();
      }
      this.world = buildWorld(frame.track, frame.map, !this.light);
      this.worldKey = key;
      this.scene.add(this.world.group);
      const theme = this.world.theme;
      this.sky?.dispose();
      this.sky = skyTexture(theme);
      this.scene.background = this.sky;
      this.scene.fog = new THREE.FogExp2(theme.haze, theme.fog);
      this.hemi.color.setHex(theme.hemi[0]);
      this.hemi.groundColor.setHex(theme.hemi[1]);
      this.hemi.intensity = theme.hemi[2];
      this.key.color.setHex(theme.key[0]);
      this.key.intensity = theme.key[1];
      this.cam.ready = false;
      this.smooth = [];
    }
    if (this.rigs.length !== frame.cars.length) {
      for (const rig of this.rigs) {
        this.scene.remove(rig.root);
        rig.dispose();
      }
      this.rigs = frame.cars.map((_, i) => {
        const rig = buildCar(CAR_COLORS[i % CAR_COLORS.length]!, this.shadow, !this.light);
        this.scene.add(rig.root);
        return rig;
      });
      this.wards = this.rigs.map((rig) => {
        const bubble = new THREE.Mesh(this.wardShape, this.wardMaterial);
        bubble.position.y = 1;
        bubble.scale.set(0.9, 0.55, 1.1);
        bubble.visible = false;
        rig.root.add(bubble);
        return bubble;
      });
      this.smooth = [];
    }
  }

  /** Draws one frame. Call once per animation frame with the race as it stands. */
  draw(frame: RallyFrame) {
    const now = performance.now();
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.prepare(frame);
    this.placePads(frame.pads ?? [], now);
    this.placeHazards(frame);

    const poses = frame.cars.map((car, i) => this.follow(i, car, frame, now));
    frame.cars.forEach((car, i) => this.pose(i, car, poses[i]!, dt, now));
    this.updateSparks(dt);
    this.aim(frame, poses, dt);
    this.drawMap(frame);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * One still picture of the frame, for the homepage: `chase` from behind the frame's car, `side`
   * low beside it looking back at the cars behind. Returns a JPEG data URL, or '' with no cars.
   */
  still(frame: RallyFrame, view: 'chase' | 'side'): string {
    const now = performance.now();
    this.prepare(frame);
    this.placePads(frame.pads ?? [], now);
    this.placeHazards(frame);
    this.smooth = [];
    const poses = frame.cars.map((car, i) => this.follow(i, car, frame, now));
    frame.cars.forEach((car, i) => this.pose(i, car, poses[i]!, 0, now));
    for (const rig of this.rigs) rig.tag.visible = false;

    const pose = poses[frame.me ?? 0];
    if (!pose) return '';
    const [fx, fz] = [Math.cos(pose.angle), Math.sin(pose.angle)];
    if (view === 'chase') {
      this.camera.fov = 66;
      this.camera.position.set(pose.x - fx * 11, 4.4, pose.z - fz * 11);
      this.camera.lookAt(pose.x + fx * 14, 1.2, pose.z + fz * 14);
    } else {
      this.camera.fov = 55;
      this.camera.position.set(pose.x + fx * 9 - fz * 6, 1.8, pose.z + fz * 9 + fx * 6);
      this.camera.lookAt(pose.x - fx * 6, 1, pose.z - fz * 6);
    }
    this.key.position.set(pose.x + 40, 80, pose.z + 30);
    this.key.target.position.set(pose.x, 0, pose.z);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.86);
  }

  /** Where car `i` is drawn now: between its last two ticks. Also notices crashes, for sparks. */
  private follow(i: number, car: CarView, frame: RallyFrame, now: number): Pose {
    const next = poseOf(car);
    let state = this.smooth[i];
    if (!state) {
      state = { from: next, to: next, at: now, hp: car.hp, wrecked: car.wrecked, tag: '' };
      this.smooth[i] = state;
    }
    const moved = next.x !== state.to.x || next.z !== state.to.z || next.angle !== state.to.angle;
    if (moved) {
      const jump = Math.hypot(next.x - state.to.x, next.z - state.to.z) > JUMP_METRES;
      state.from = jump ? next : this.blend(state, now);
      state.to = next;
      state.at = now;
    }
    // Crashes: sparks where it hit, a shake if it's your car, a burst and smoke when it's wrecked.
    if (car.hp < state.hp && !car.wrecked) {
      this.burst(next.x, 0.8, next.z, 0xffb347, Math.min(24, 4 + (state.hp - car.hp) * 2));
      if (i === frame.me) this.cam.shake = Math.min(1, this.cam.shake + (state.hp - car.hp) / 25);
    }
    if (car.wrecked && !state.wrecked) {
      this.burst(next.x, 1, next.z, 0xff5a3d, 40);
      this.burst(next.x, 1.5, next.z, 0x9aa0aa, 20);
      if (i === frame.me) this.cam.shake = 1;
    }
    state.hp = car.hp;
    state.wrecked = car.wrecked;
    return this.blend(state, now);
  }

  private blend(state: Smooth, now: number): Pose {
    const t = Math.min(1, (now - state.at) / RALLY.TICK_MS);
    const { from, to } = state;
    return {
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
      angle: from.angle + turnBetween(from.angle, to.angle) * t,
      speed: from.speed + (to.speed - from.speed) * t,
    };
  }

  private pose(i: number, car: CarView, pose: Pose, dt: number, now: number) {
    const rig = this.rigs[i];
    const state = this.smooth[i];
    if (!rig || !state) return;
    rig.root.position.set(pose.x, 0, pose.z);
    rig.root.rotation.y = yaw(pose.angle);

    // Lean and steer with how fast it's turning.
    const turning = turnBetween(state.from.angle, state.to.angle);
    const lean = THREE.MathUtils.clamp(-turning * 2.2, -0.12, 0.12);
    rig.body.rotation.z = THREE.MathUtils.damp(rig.body.rotation.z, lean, 10, dt);
    for (const front of rig.fronts) front.rotation.y = THREE.MathUtils.damp(front.rotation.y, THREE.MathUtils.clamp(-turning * 6, -0.45, 0.45), 14, dt);
    const metresPerSecond = (pose.speed * METRES * RALLY.TICK_HZ);
    for (const wheel of rig.wheels) wheel.rotation.x += (metresPerSecond / 0.44) * dt;

    // Wrecked: bounced up and tipped, dark. Back from a wreck: see-through and flickering.
    if (car.wrecked) {
      const wobble = now / 1000;
      rig.body.position.y = Math.abs(Math.sin(wobble * 9)) * 0.4;
      rig.body.rotation.x = Math.sin(wobble * 7) * 0.2;
      rig.paint.emissive.setHex(0x330800);
      if (Math.random() < 0.25) this.burst(pose.x, 1.6, pose.z, 0x4a4f57, 1, 2);
    } else {
      rig.body.position.y = 0;
      rig.body.rotation.x = 0;
      rig.paint.emissive.setHex(0x000000);
    }
    const ghost = car.ghost && Math.floor(now / 90) % 2 === 0;
    rig.paint.transparent = car.ghost;
    rig.paint.opacity = ghost ? 0.35 : car.ghost ? 0.7 : 1;
    rig.tail.emissiveIntensity = car.speed < state.from.speed ? 3.2 : 1.4;
    // Flames: lime on a boost or Crown Rush, orange and long on a Ram, blue in a Draft.
    const burning = car.boosting || car.rushing || car.ramming || car.drafting;
    const flameColor = car.ramming ? 0xff8a3d : car.drafting ? 0x406aff : 0x99ee2d;
    for (const flame of rig.flames) {
      flame.visible = burning;
      if (burning) {
        (flame.material as THREE.MeshBasicMaterial).color.setHex(flameColor);
        flame.scale.setScalar((car.ramming || car.rushing ? 1 : 0.7) + Math.random() * 0.35);
      }
    }
    const ward = this.wards[i];
    if (ward) {
      ward.visible = car.warded;
      ward.rotation.y += dt * 2.5;
    }
    if (car.slipping && Math.random() < 0.5) this.burst(pose.x, 0.4, pose.z, 0x9b6bff, 1, 4);
    // Health going up is a Patch: a green burst.
    if (car.hp > state.hp + 5) this.burst(pose.x, 1.2, pose.z, 0x2ee6a8, 18, 6);

    // The floating name and health bar; your own car's is in the corner instead.
    const name = this.names[i] ?? `Car ${i + 1}`;
    const tag = `${name}|${Math.ceil(car.hp / 5)}|${car.wrecked}`;
    if (tag !== state.tag) {
      state.tag = tag;
      const material = rig.tag.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.map = tagTexture(name, CAR_COLORS[i % CAR_COLORS.length]!, car.hp, car.wrecked);
      material.needsUpdate = true;
    }
    rig.tag.visible = i !== this.me;
  }

  /** Builds the pads the first time they're seen on a road, then lights or dims each. */
  private placePads(pads: PadView[], now: number) {
    const key = `${this.worldKey}:${pads.map((pad) => `${pad.x},${pad.y},${pad.item}`).join(';')}`;
    if (key !== this.padKey) {
      for (const pad of this.pads) this.scene.remove(pad.disc, pad.floater);
      this.padParts.splice(0).forEach((part) => part.dispose());
      const discShape = new THREE.CircleGeometry(12 * RALLY.SCALE * METRES, 28);
      discShape.rotateX(-Math.PI / 2);
      const gem = new THREE.OctahedronGeometry(0.9, 0);
      this.padParts.push(discShape, gem);
      this.pads = pads.map((pad) => {
        const color = ITEMS[pad.item]?.color ?? '#ffffff';
        const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.75, depthWrite: false });
        const solid = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.2 });
        this.padParts.push(glow, solid);
        const disc = new THREE.Mesh(discShape, glow);
        disc.position.set(pad.x * METRES, 0.07, pad.y * METRES);
        const floater = new THREE.Mesh(gem, solid);
        floater.position.set(pad.x * METRES, 1.6, pad.y * METRES);
        this.scene.add(disc, floater);
        return { disc, floater };
      });
      this.padKey = key;
    }
    pads.forEach((pad, i) => {
      const shown = this.pads[i];
      if (!shown) return;
      (shown.disc.material as THREE.MeshStandardMaterial).opacity = pad.empty ? 0.15 : 0.75;
      shown.floater.visible = !pad.empty;
      shown.floater.rotation.y = now / 600 + i;
      shown.floater.position.y = 1.6 + Math.sin(now / 300 + i) * 0.25;
    });
  }

  private placeHazards(frame: RallyFrame) {
    const slicks = (frame.hazards ?? []).filter((hazard) => hazard.kind === SLICK_ITEM);
    const blocks = (frame.hazards ?? []).filter((hazard) => hazard.kind !== SLICK_ITEM);
    this.slicks.forEach((mesh, n) => {
      const hazard = slicks[n];
      mesh.visible = hazard != null;
      if (hazard) mesh.position.set(hazard.x * METRES, 0.05, hazard.y * METRES);
    });
    this.blocks.forEach((mesh, n) => {
      const hazard = blocks[n];
      mesh.visible = hazard != null;
      if (!hazard) return;
      mesh.position.set(hazard.x * METRES, 0.8, hazard.y * METRES);
      // Across the road: square to the nearest car's heading when it was dropped is not known, so face the camera's way.
      mesh.rotation.y = Math.atan2(this.cam.look.x - this.cam.pos.x, this.cam.look.z - this.cam.pos.z) + Math.PI / 2;
    });
  }

  private names: string[] = [];
  private me: number | null = null;

  /** The chase camera: behind and above the car it follows, pulled back and widened with speed. */
  private aim(frame: RallyFrame, poses: Pose[], dt: number) {
    this.names = frame.names ?? [];
    this.me = frame.me;
    const leader = frame.cars.reduce((best, car, i) => (car.place < (frame.cars[best]?.place ?? Infinity) ? i : best), 0);
    const i = frame.me ?? leader;
    const pose = poses[i];
    const car = frame.cars[i];
    if (!pose || !car) {
      // No cars yet: look over the whole road from high up.
      this.camera.position.set(0, 160, 120);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    const [fx, fz] = [Math.cos(pose.angle), Math.sin(pose.angle)];
    const back = car.boosting ? 10.5 : 9;
    const want = new THREE.Vector3(pose.x - fx * back, 3.6, pose.z - fz * back);
    const look = new THREE.Vector3(pose.x + fx * 12, 1.2, pose.z + fz * 12);
    if (!this.cam.ready) {
      // Start high above the car, so the first second swoops down behind it.
      this.cam.pos.set(pose.x - fx * 30, 45, pose.z - fz * 30);
      this.cam.look.copy(look);
      this.cam.ready = true;
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      this.cam.pos[axis] = THREE.MathUtils.damp(this.cam.pos[axis], want[axis], axis === 'y' ? 3 : 7, dt);
      this.cam.look[axis] = THREE.MathUtils.damp(this.cam.look[axis], look[axis], 12, dt);
    }
    const shake = this.cam.shake * this.cam.shake * 0.6;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.8);
    this.camera.position.set(this.cam.pos.x + (Math.random() * 2 - 1) * shake, this.cam.pos.y + (Math.random() * 2 - 1) * shake, this.cam.pos.z);
    this.camera.lookAt(this.cam.look);
    const fov = (car.boosting ? 80 : 66) + Math.min(8, (pose.speed / (6 * RALLY.SCALE)) * 8);
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 6, dt);
      this.camera.updateProjectionMatrix();
    }
    // The sun's shadows follow the camera's car.
    this.key.position.set(pose.x + 40, 80, pose.z + 30);
    this.key.target.position.set(pose.x, 0, pose.z);
  }

  private burst(x: number, y: number, z: number, color: number, count: number, speed = 14) {
    for (let n = 0; n < count; n += 1) {
      const spark = this.sparks[this.cursor]!;
      this.cursor = (this.cursor + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      Object.assign(spark, { active: true, x, y, z, vx: Math.cos(a) * v, vy: 3 + Math.random() * (speed * 0.6), vz: Math.sin(a) * v, age: 0, life: 0.3 + Math.random() * 0.4, size: 0.5 + Math.random() * 0.8 });
      spark.color.setHex(color);
    }
  }

  private hide(i: number) {
    this.dummy.position.set(0, -100, 0);
    this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix();
    this.sparkMesh.setMatrixAt(i, this.dummy.matrix);
  }

  private updateSparks(dt: number) {
    let changed = false;
    this.sparks.forEach((spark, i) => {
      if (!spark.active) return;
      changed = true;
      spark.age += dt;
      if (spark.age >= spark.life) {
        spark.active = false;
        this.hide(i);
        return;
      }
      spark.vy -= 22 * dt;
      spark.x += spark.vx * dt;
      spark.y = Math.max(0.1, spark.y + spark.vy * dt);
      spark.z += spark.vz * dt;
      this.dummy.position.set(spark.x, spark.y, spark.z);
      this.dummy.rotation.set(spark.age * 6, spark.age * 4, 0);
      this.dummy.scale.setScalar(Math.max(0.01, spark.size * (1 - spark.age / spark.life)));
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.dummy.matrix);
      this.sparkMesh.setColorAt(i, spark.color);
    });
    if (changed) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
    }
  }

  /** The whole road from above, with a dot for each car and a ring round yours. */
  private drawMap(frame: RallyFrame) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(this.map.clientWidth * ratio);
    if (size <= 0) return;
    if (this.map.width !== size) {
      this.map.width = size;
      this.map.height = size;
    }
    const ctx = this.map.getContext('2d');
    if (!ctx || frame.track.length < 2) return;
    const xs = frame.track.map((p) => p.x);
    const ys = frame.track.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = size * 0.14;
    const scale = Math.min((size - pad * 2) / (maxX - minX || 1), (size - pad * 2) / (maxY - minY || 1));
    const at = (x: number, y: number): [number, number] => [pad + (x - minX) * scale + (size - pad * 2 - (maxX - minX) * scale) / 2, pad + (y - minY) * scale + (size - pad * 2 - (maxY - minY) * scale) / 2];
    ctx.clearRect(0, 0, size, size);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    frame.track.forEach((p, i) => (i === 0 ? ctx.moveTo(...at(p.x, p.y)) : ctx.lineTo(...at(p.x, p.y))));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(3, size * 0.035);
    ctx.stroke();
    frame.cars.forEach((car, i) => {
      const [x, y] = at(car.x, car.y);
      ctx.beginPath();
      ctx.arc(x, y, size * (i === frame.me ? 0.05 : 0.035), 0, Math.PI * 2);
      ctx.fillStyle = car.wrecked ? '#ff3b3b' : CAR_COLORS[i % CAR_COLORS.length]!;
      ctx.fill();
      if (i === frame.me) {
        ctx.lineWidth = size * 0.015;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    });
  }

  dispose() {
    this.resize.disconnect();
    for (const rig of this.rigs) rig.dispose();
    this.padParts.forEach((part) => part.dispose());
    this.hazardParts.forEach((part) => part.dispose());
    this.wardShape.dispose();
    this.wardMaterial.dispose();
    this.world?.dispose();
    this.sky?.dispose();
    this.bloom?.dispose();
    this.composer?.dispose();
    this.shadow.dispose();
    this.env.dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.map.remove();
  }
}
