import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * The home page's hero: the king of Crowns, standing in neon light with a gold crown on their head.
 *
 * The character is a CC0 (public domain) animated model by Quaternius, from poly.pizza. Everything
 * else (crown, lights, skyline, sparks) is built here from simple shapes, so there is no other art.
 * On phones and for people who prefer less motion it renders one still frame and stops.
 */

/** `crownLift` and `crownSize` are in head-bone units: big cartoon hair needs the crown higher. */
export type HeroModel = { url: string; idle: string; head: string; scale: number; crownLift: number; crownSize: number };

export const HERO_MODELS = {
  character: { url: '/models/character.glb', idle: 'CharacterArmature|Idle', head: 'Head', scale: 1, crownLift: 0.56, crownSize: 0.34 },
  human: { url: '/models/human.glb', idle: 'Human Armature|Idle', head: 'Head', scale: 1, crownLift: 0.36, crownSize: 0.24 },
} satisfies Record<string, HeroModel>;

export type HeroScene = { dispose(): void };

const LIME = 0x99ee2d;
const PINK = 0xff56f6;
const BLUE = 0x406aff;
const GOLD = 0xffcf3a;

function makeCrown(): THREE.Group {
  const crown = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0x7a4a00, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.3 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.22, 24, 1, true), gold);
  band.material.side = THREE.DoubleSide;
  crown.add(band);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8), gold);
    spike.position.set(Math.cos(angle) * 0.46, 0.27, Math.sin(angle) * 0.46);
    crown.add(spike);
    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? PINK : LIME }),
    );
    gem.position.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
    crown.add(gem);
  }
  return crown;
}

function windowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#07040f';
    ctx.fillRect(0, 0, 64, 128);
    let s = 99;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let y = 4; y < 124; y += 8) {
      for (let x = 4; x < 60; x += 8) {
        const lit = rand();
        if (lit < 0.55) continue;
        ctx.fillStyle = lit > 0.9 ? '#ff7ae6' : lit > 0.75 ? '#7ad7ff' : '#ffd86b';
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createHeroScene(canvas: HTMLCanvasElement, model: HeroModel = HERO_MODELS.character): HeroScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const still =
    window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  {
    const sky = document.createElement('canvas');
    sky.width = 4;
    sky.height = 256;
    const ctx = sky.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, '#07020e');
      gradient.addColorStop(0.45, '#1c0836');
      gradient.addColorStop(0.75, '#2a0b45');
      gradient.addColorStop(1, '#111111');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 4, 256);
    }
    const texture = new THREE.CanvasTexture(sky);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
  }
  scene.fog = new THREE.Fog(0x1a0830, 10, 34);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const lookAt = new THREE.Vector3(0, 1.0, 0);

  // Light: a dim purple fill, a warm key from the front, and strong coloured rims behind the character.
  scene.add(new THREE.HemisphereLight(0x6b4bb5, 0x0a0410, 0.6));
  const key = new THREE.DirectionalLight(0xffe2c4, 1.5);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rimPink = new THREE.PointLight(PINK, 14, 10);
  rimPink.position.set(-2.2, 2.6, -1.6);
  scene.add(rimPink);
  const rimLime = new THREE.PointLight(LIME, 10, 10);
  rimLime.position.set(2.4, 1.8, -1.4);
  scene.add(rimLime);
  const under = new THREE.PointLight(BLUE, 4, 5);
  under.position.set(0, 0.2, 1.2);
  scene.add(under);

  // Ground: a dark disc with a glowing ring the character stands in.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x0d0618, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 0.95, 64),
    new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.6 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);

  // Skyline behind: rows of towers with lit windows, fading into fog.
  const windows = windowTexture();
  windows.wrapS = THREE.RepeatWrapping;
  windows.wrapT = THREE.RepeatWrapping;
  const towerGeometry = new THREE.BoxGeometry(1, 1, 1);
  const towerMaterial = new THREE.MeshBasicMaterial({ map: windows, color: 0xc9a8ff });
  const TOWERS = 90;
  const towers = new THREE.InstancedMesh(towerGeometry, towerMaterial, TOWERS);
  {
    let s = 7;
    const rand = () => {
      s = (s * 48271) % 2147483647;
      return s / 2147483647;
    };
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const size = new THREE.Vector3();
    const upright = new THREE.Quaternion();
    for (let i = 0; i < TOWERS; i += 1) {
      const h = 3 + rand() * rand() * 12;
      const w = 0.8 + rand() * 1.6;
      size.set(w, h, 0.8 + rand());
      const far = i % 2 === 1;
      position.set((i / TOWERS - 0.5) * 48 + rand() * 0.8, h / 2, far ? -16 - rand() * 6 : -8 - rand() * 4);
      matrix.compose(position, upright, size);
      towers.setMatrixAt(i, matrix);
    }
  }
  scene.add(towers);

  // Sparks: slow-rising specks of light around the character.
  const SPARKS = 90;
  const sparkPositions = new Float32Array(SPARKS * 3);
  const sparkSpeed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i += 1) {
    sparkPositions[i * 3] = (Math.random() - 0.5) * 6;
    sparkPositions[i * 3 + 1] = Math.random() * 4;
    sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
    sparkSpeed[i] = 0.15 + Math.random() * 0.35;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(
    sparkGeometry,
    new THREE.PointsMaterial({ color: 0xffd86b, size: 0.04, transparent: true, opacity: 0.9 }),
  );
  scene.add(sparks);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 0.62));
  composer.addPass(new OutputPass());

  const clock = new THREE.Clock();
  let mixer: THREE.AnimationMixer | null = null;
  let crown: THREE.Group | null = null;
  let frame = 0;
  let disposed = false;
  let pointerX = 0;
  let pointerY = 0;
  let width = 0;
  let height = 0;

  // How far left the camera looks, so the character sits right of centre on wide screens.
  let focusX = 0;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    focusX = camera.aspect > 1.3 ? -0.95 : 0;
  }

  function draw() {
    resize();
    const delta = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    mixer?.update(delta);
    // A slow drift, nudged by the pointer, so the scene feels alive without moving much.
    camera.position.set(focusX + Math.sin(t * 0.15) * 0.3 + pointerX * 0.4, 1.0 + pointerY * 0.15, 5.2);
    camera.lookAt(lookAt.x + focusX, lookAt.y, lookAt.z);
    ring.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
    if (crown) crown.rotation.y = Math.sin(t * 0.8) * 0.15;
    const positions = sparkGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < SPARKS; i += 1) {
      let y = positions.getY(i) + sparkSpeed[i]! * delta;
      if (y > 4) y = 0;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
    composer.render();
  }

  function loop() {
    if (disposed) return;
    draw();
    frame = requestAnimationFrame(loop);
  }

  const onPointer = (event: PointerEvent) => {
    pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
  };
  if (!still) window.addEventListener('pointermove', onPointer);

  new GLTFLoader().load(
    model.url,
    (gltf) => {
      if (disposed) return;
      const hero = gltf.scene;
      hero.scale.setScalar(model.scale);
      // Fit the character to about 1.9 units tall, standing on the ground at the centre.
      const box = new THREE.Box3().setFromObject(hero);
      const tall = box.max.y - box.min.y || 1;
      hero.scale.multiplyScalar(1.9 / tall);
      const fitted = new THREE.Box3().setFromObject(hero);
      hero.position.y -= fitted.min.y;
      hero.rotation.y = -0.35;
      scene.add(hero);
      lookAt.set(0, 1.12, 0);

      const head = hero.getObjectByName(model.head);
      if (head) {
        crown = makeCrown();
        // The crown sits on top of the head bone, in the head's own scale.
        const headScale = new THREE.Vector3();
        head.getWorldScale(headScale);
        crown.scale.setScalar(model.crownSize / (headScale.y || 1));
        crown.position.set(0, model.crownLift / (headScale.y || 1), 0);
        head.add(crown);
      }

      mixer = new THREE.AnimationMixer(hero);
      const idle = gltf.animations.find((clip) => clip.name === model.idle) ?? gltf.animations[0];
      if (idle) mixer.clipAction(idle).play();
      // Advance the pose a little so a still frame isn't the stiff bind pose.
      mixer.update(0.6);
      if (still) draw();
    },
    undefined,
    () => undefined,
  );

  if (still) draw();
  else loop();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      composer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      windows.dispose();
      (scene.background as THREE.Texture | null)?.dispose();
      renderer.dispose();
    },
  };
}
