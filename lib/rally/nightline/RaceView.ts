import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import {
  buildSampledTrack,
  insideWallsFraction,
  isFootprintSafe,
  isScenerySpotSafe,
  offsetEdge,
  sampleTrackAtT,
  type SampledTrack,
} from './trackMath';
import {
  createBoostPadTexture,
  createChevronSignTexture,
  createContactShadowTexture,
  createEquirectSkyTexture,
  createLightPoolTexture,
  createNameplateTexture,
  createNeonSignTexture,
  createOilSlickTexture,
  createQuayHazardTexture,
  createSkylineWindowTexture,
  createStartFinishTexture,
  createTownhouseWindowTexture,
  deriveNormalAndRoughnessFromImage,
  getStoneFacadeUrl,
  getTrackAlbedoUrl,
} from './textures';
import type {
  CameraMode,
  CarFrameState,
  QualityLevel,
  RaceFrame,
  TrackData,
} from './types';
import { itemShape } from './itemShapes';

export interface RaceViewOptions {
  quality?: QualityLevel;
  /** Scales every car, so its size matches the rules' collision circle. */
  carScale?: number;
  cameraMode?: CameraMode;
  onProgress?: (progress: number) => void;
}

interface CarVisual {
  id: string;
  root: THREE.Group;
  chassisGroup: THREE.Group;
  wheels: THREE.Group[];
  frontWheels: THREE.Group[];
  wheelSpin: number;
  bodyMat: THREE.MeshPhysicalMaterial;
  tailMat: THREE.MeshStandardMaterial;
  underglowMesh: THREE.Mesh;
  headlightCone: THREE.Mesh;
  nitroFlames: THREE.Mesh[];
  nitroMat: THREE.MeshBasicMaterial;
  auraRing: THREE.Mesh;
  nameSprite: THREE.Sprite;
  prevSpeed: number;
  smokeCooldown: number;
}

/** Where one copy of an instanced prop goes. */
type InstanceTransform = { x: number; y: number; z: number; rotY: number; sx?: number; sy?: number; sz?: number; color?: number };

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

const VignetteGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignetteStrength: { value: 0.42 },
    grainStrength: { value: 0.035 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteStrength;
    uniform float grainStrength;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 distVec = vUv - 0.5;
      float dist = length(distVec);
      float vig = smoothstep(0.32, 0.92, dist);
      col.rgb *= (1.0 - vig * vignetteStrength);
      float n = (rand(vUv + fract(time)) - 0.5) * grainStrength;
      col.rgb += n;
      gl_FragColor = col;
    }
  `,
};

/**
 * Clears pixels the scene drew as NaN or infinity before the bloom sees them. Harbour's water mirror and
 * the wet road now and then shade a pixel to NaN; the bloom's blur then spreads it into black blocks
 * that cover half the screen, edge to edge.
 */
const NanGuardShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (any(isnan(col)) || any(isinf(col))) col = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = min(col, vec4(64.0));
    }
  `,
};

// Scratch math helpers (zero per-frame GC allocation)
const _v3A = new THREE.Vector3();
const _v3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function detectDefaultQuality(): QualityLevel {
  if (typeof window === 'undefined') return 'medium';
  if (detectSoftwareWebGL()) return 'low';
  const cores = navigator.hardwareConcurrency ?? 4;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (isMobile && cores <= 4) return 'low';
  if (isMobile) return 'medium';
  return cores >= 6 ? 'high' : 'medium';
}

export class RaceView {
  public readonly isSoftwareGl: boolean;
  private container: HTMLElement;
  private track: TrackData;
  private sampled: SampledTrack;
  private quality: QualityLevel;
  private cameraMode: CameraMode;
  private carScale: number;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private vignettePass: ShaderPass | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private playerPointLight: THREE.PointLight | null = null;
  private reflector: Reflector | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private envTexture: THREE.Texture | null = null;
  private skyTexture: THREE.CanvasTexture | null = null;
  private shadowTex: THREE.CanvasTexture | null = null;
  private slickTex: THREE.CanvasTexture | null = null;
  private boostTex: THREE.CanvasTexture | null = null;
  private joltRingMesh: THREE.Mesh | null = null;
  private joltRingTimer = 0;

  private carTemplate: THREE.Group | null = null;
  private wheelTemplate: THREE.Group | null = null;
  private caliperTemplate: THREE.Mesh | null = null;
  private itemBoxTemplate: THREE.Group | null = null;
  private barricadeTemplate: THREE.Mesh | null = null;
  private speedLines: THREE.LineSegments | null = null;
  private speedLinesMat: THREE.LineBasicMaterial | null = null;

  private cars = new Map<string, CarVisual>();
  private itemBoxMeshes = new Map<string, THREE.Group>();
  private hazardMeshes = new Map<string, THREE.Object3D>();
  private boostPadMeshes: THREE.Mesh[] = [];

  // Pooled particle system
  private particles: Particle[] = [];
  private particleCursor = 0;
  private particleMesh!: THREE.InstancedMesh;
  private readonly maxParticles = 240;

  // Camera smoothing state
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInitialized = false;
  private camTrauma = 0;
  private lastDrawMs = performance.now();
  private animTime = 0;

  private ready = false;
  private disposed = false;
  private readyPromise: Promise<void>;

  // Track procedural geometries/materials/textures for guaranteed disposal
  private trackedTextures = new Set<THREE.Texture>();
  private trackedGeometries = new Set<THREE.BufferGeometry>();
  private trackedMaterials = new Set<THREE.Material>();

  constructor(container: HTMLElement, track: TrackData, options: RaceViewOptions = {}) {
    this.container = container;
    this.track = track;
    this.sampled = buildSampledTrack(track, 2.0);
    this.isSoftwareGl = detectSoftwareWebGL();
    this.quality = options.quality ?? detectDefaultQuality();
    this.cameraMode = options.cameraMode ?? 'chase';
    this.carScale = options.carScale ?? 1;

    this.initRendererAndScene();
    this.initParticles();
    this.readyPromise = this.loadAssetsAndBuildTrack(options.onProgress);
  }

  public whenReady(): Promise<void> {
    return this.readyPromise;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  public getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  public setQuality(quality: QualityLevel): void {
    if (this.quality === quality || this.disposed) return;
    this.quality = quality;
    this.applyRendererQuality();
  }

  private trackTex<T extends THREE.Texture>(tex: T): T {
    this.trackedTextures.add(tex);
    return tex;
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.trackedGeometries.add(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.trackedMaterials.add(mat);
    return mat;
  }

  private initRendererAndScene(): void {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && this.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.track.theme === 'switchback' ? 1.15 : 1.12;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.4, 950);
    this.scene.add(this.camera);

    // Fog & background per track theme
    if (this.track.theme === 'harbour') {
      this.scene.background = new THREE.Color('#040c18');
      this.scene.fog = new THREE.FogExp2('#061524', 0.0046);
    } else if (this.track.theme === 'switchback') {
      this.scene.background = new THREE.Color('#191029');
      this.scene.fog = new THREE.FogExp2('#34193d', 0.0044);
    } else {
      this.scene.background = new THREE.Color('#06080f');
      this.scene.fog = new THREE.FogExp2('#0b101b', 0.0062);
    }

    // Sky dome with equirectangular texture + PMREM environment from night/dusk sky
    this.skyTexture = this.trackTex(createEquirectSkyTexture(this.track.theme));
    const skyGeo = this.trackGeo(new THREE.SphereGeometry(480, 32, 16));
    const skyMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.skyTexture,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.renderOrder = -10;
    this.scene.add(skyMesh);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const skyEnv = pmrem.fromEquirectangular(this.skyTexture).texture;
    this.envTexture = this.trackTex(skyEnv);
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = this.track.theme === 'switchback' ? 1.25 : 1.15;
    pmrem.dispose();

    // Warm/cool night lighting rig
    const hemiColors =
      this.track.theme === 'harbour'
        ? ([0x1e4d6b, 0x070d14, 0.75] as const)
        : this.track.theme === 'switchback'
          ? ([0x7c4678, 0x161020, 0.85] as const)
          : ([0x293957, 0x16100a, 0.7] as const);
    const hemi = new THREE.HemisphereLight(hemiColors[0], hemiColors[1], hemiColors[2]);
    this.scene.add(hemi);

    const keyColor =
      this.track.theme === 'harbour'
        ? 0x7dd3fc
        : this.track.theme === 'switchback'
          ? 0xf4a261
          : 0xffd28a;
    const key = new THREE.DirectionalLight(keyColor, this.track.theme === 'switchback' ? 1.55 : 1.25);
    key.position.set(80, 110, 60);
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 260;
    const d = 65;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;

    // Player neon underglow/headlight bounce point light
    this.playerPointLight = new THREE.PointLight(0x00e5ff, 2.8, 34, 1.4);
    this.scene.add(this.playerPointLight);

    // Shared helper textures
    this.shadowTex = this.trackTex(createContactShadowTexture());
    this.slickTex = this.trackTex(createOilSlickTexture());
    this.boostTex = this.trackTex(createBoostPadTexture());

    // Jolt shockwave ring VFX
    const joltGeo = this.trackGeo(new THREE.RingGeometry(0.8, 1.6, 32));
    joltGeo.rotateX(-Math.PI / 2);
    const joltMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.joltRingMesh = new THREE.Mesh(joltGeo, joltMat);
    this.joltRingMesh.visible = false;
    this.scene.add(this.joltRingMesh);

    this.initSpeedStreaks();
    this.applyRendererQuality();
    this.setupResizeObserver();
  }

  private initSpeedStreaks(): void {
    const streakCount = 28;
    const verts = new Float32Array(streakCount * 2 * 3);
    for (let i = 0; i < streakCount; i++) {
      const ang = (i / streakCount) * Math.PI * 2 + (i % 3) * 0.18;
      const rad = 3.25 + ((i * 17) % 10) * 0.15;
      const z0 = -4.6 - ((i * 29) % 10) * 0.38;
      const len = 1.2 + ((i * 7) % 5) * 0.28;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad * 0.62;
      verts[i * 6 + 0] = x;
      verts[i * 6 + 1] = y;
      verts[i * 6 + 2] = z0;
      verts[i * 6 + 3] = x * 1.1;
      verts[i * 6 + 4] = y * 1.1;
      verts[i * 6 + 5] = z0 - len;
    }
    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = this.trackMat(
      new THREE.LineBasicMaterial({
        color: 0xa5f3fc,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const lines = new THREE.LineSegments(geo, mat);
    lines.visible = false;
    lines.frustumCulled = false;
    this.camera.add(lines);
    this.speedLines = lines;
    this.speedLinesMat = mat;
  }

  private applyRendererQuality(): void {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    const pr = this.isSoftwareGl
      ? 1
      : this.quality === 'low'
        ? Math.min(window.devicePixelRatio, 1)
        : this.quality === 'medium'
          ? Math.min(window.devicePixelRatio, 1.5)
          : Math.min(window.devicePixelRatio, 2);

    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height, false);

    const enableShadows = !this.isSoftwareGl && this.quality === 'high';
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.keyLight) {
      this.keyLight.castShadow = enableShadows;
    }

    // Post-processing composer (GPU + High/Medium only; never on software WebGL)
    this.disposeComposer();
    if (!this.isSoftwareGl && this.quality !== 'low') {
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(pr);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(this.scene, this.camera));
      composer.addPass(new ShaderPass(NanGuardShader));

      const bloom = new UnrealBloomPass(
        new THREE.Vector2(Math.floor(width / 2), Math.floor(height / 2)),
        this.quality === 'high' ? 0.52 : 0.36,
        0.55,
        0.78,
      );
      composer.addPass(bloom);
      this.bloomPass = bloom;

      const vig = new ShaderPass(VignetteGrainShader);
      vig.uniforms.vignetteStrength.value = 0.42;
      vig.uniforms.grainStrength.value = this.quality === 'high' ? 0.032 : 0.0;
      composer.addPass(vig);
      this.vignettePass = vig;

      composer.addPass(new OutputPass());
      this.composer = composer;
    }
  }

  private disposeComposer(): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
      this.vignettePass = null;
    }
  }

  private setupResizeObserver(): void {
    const onResize = () => {
      if (this.disposed) return;
      const w = Math.max(1, this.container.clientWidth || window.innerWidth);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      if (this.composer) {
        this.composer.setSize(w, h);
        if (this.bloomPass) {
          this.bloomPass.resolution.set(Math.floor(w / 2), Math.floor(h / 2));
        }
      }
    };
    this.resizeObserver = new ResizeObserver(onResize);
    this.resizeObserver.observe(this.container);
  }

  private initParticles(): void {
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0.25,
        r: 1,
        g: 1,
        b: 1,
      });
    }
    const geo = this.trackGeo(new THREE.IcosahedronGeometry(0.3, 1));
    const mat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.particleMesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < this.maxParticles; i++) {
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setRGB(1, 1, 1));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleMesh);
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.r = r;
    p.g = g;
    p.b = b;
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 4.2 * dt; // subtle gravity for sparks (smoke has positive vy boost)
      const ratio = p.life / p.maxLife;
      const sc = p.size * (0.4 + 0.8 * ratio);
      _v3A.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.set(sc, sc, sc);
      _mat4.compose(_v3A, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setRGB(p.r * ratio, p.g * ratio, p.b * ratio));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private async loadAssetsAndBuildTrack(onProgress?: (p: number) => void): Promise<void> {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      if (total > 0) onProgress?.(Math.min(0.95, loaded / total));
    };

    const gltfLoader = new GLTFLoader(manager);
    const texLoader = new THREE.TextureLoader(manager);

    const trackPackUrl =
      this.track.theme === 'harbour'
        ? '/nightline/models/harbour_props.glb'
        : this.track.theme === 'switchback'
          ? '/nightline/models/switchback_props.glb'
          : '/nightline/models/oldtown_props.glb';

    const roadUrl = getTrackAlbedoUrl(this.track.theme);
    const loadList: Promise<GLTF | THREE.Texture>[] = [
      gltfLoader.loadAsync('/nightline/models/car.glb'),
      gltfLoader.loadAsync('/nightline/models/shared_props.glb'),
      gltfLoader.loadAsync(trackPackUrl),
      texLoader.loadAsync(roadUrl),
    ];
    if (this.track.theme === 'oldtown') {
      loadList.push(texLoader.loadAsync(getStoneFacadeUrl()));
    }

    const results = await Promise.all(loadList);
    if (this.disposed) return;

    const carGltf = results[0] as GLTF;
    const sharedGltf = results[1] as GLTF;
    const trackGltf = results[2] as GLTF;
    const roadTex = results[3] as THREE.Texture;
    const facadeTex = results[4] as THREE.Texture | undefined;

    this.extractCarTemplates(carGltf.scene);
    this.extractSharedTemplates(sharedGltf.scene);

    this.buildRoadAndBoundaries(roadTex);
    this.buildTrackScenery(trackGltf.scene, facadeTex);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    onProgress?.(1.0);
    this.ready = true;
  }

  private extractCarTemplates(root: THREE.Group): void {
    const bodyGroup = new THREE.Group();
    const wheelGroup = new THREE.Group();
    this.caliperTemplate = null;

    root.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      this.trackGeo(mesh.geometry);
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => this.trackMat(m));
      } else {
        this.trackMat(mesh.material);
      }

      if (mesh.name === 'wheel_caliper') {
        const cloned = new THREE.Mesh(mesh.geometry, mesh.material);
        cloned.name = mesh.name;
        this.caliperTemplate = cloned;
      } else if (mesh.name.startsWith('wheel_')) {
        const cloned = new THREE.Mesh(mesh.geometry, mesh.material);
        cloned.castShadow = true;
        cloned.name = mesh.name;
        wheelGroup.add(cloned);
      } else {
        const cloned = new THREE.Mesh(mesh.geometry, mesh.material);
        cloned.castShadow = true;
        cloned.receiveShadow = true;
        cloned.name = mesh.name;
        bodyGroup.add(cloned);
      }
    });

    this.carTemplate = bodyGroup;
    this.wheelTemplate = wheelGroup;
  }

  private extractSharedTemplates(root: THREE.Group): void {
    const itemGroup = new THREE.Group();
    root.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      this.trackGeo(mesh.geometry);
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => this.trackMat(m));
      } else {
        this.trackMat(mesh.material);
      }
      if (mesh.name === 'item_frame' || mesh.name === 'item_core') {
        const clone = new THREE.Mesh(mesh.geometry, mesh.material);
        clone.name = mesh.name;
        itemGroup.add(clone);
      } else if (mesh.name === 'barricade') {
        this.barricadeTemplate = new THREE.Mesh(mesh.geometry, mesh.material);
      }
    });
    this.itemBoxTemplate = itemGroup;
  }

  private buildRoadAndBoundaries(roadAlbedo: THREE.Texture): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const roadRepeatY = Math.max(24, Math.round(this.sampled.totalLength / 6));
    const roadRepeatX = 2;

    roadAlbedo.colorSpace = THREE.SRGBColorSpace;
    roadAlbedo.wrapS = THREE.RepeatWrapping;
    roadAlbedo.wrapT = THREE.RepeatWrapping;
    roadAlbedo.repeat.set(roadRepeatX, roadRepeatY);
    roadAlbedo.anisotropy = maxAniso;
    this.trackTex(roadAlbedo);

    const wetness = this.track.theme === 'harbour' ? 0.85 : this.track.theme === 'oldtown' ? 0.78 : 0.45;
    const { normalMap, roughnessMap } = deriveNormalAndRoughnessFromImage(
      roadAlbedo.image as HTMLImageElement,
      roadRepeatX,
      roadRepeatY,
      maxAniso,
      wetness,
      this.track.theme === 'oldtown' ? 3.2 : 1.9,
    );
    this.trackTex(normalMap);
    this.trackTex(roughnessMap);

    const roadMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: roadAlbedo,
        normalMap,
        normalScale: new THREE.Vector2(1.15, 1.15),
        roughnessMap,
        roughness: 1.0,
        metalness: 0.12,
        clearcoat: this.track.theme === 'switchback' ? 0.52 : 0.92,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.65,
      }),
    );

    const wetTint =
      this.track.theme === 'harbour'
        ? new THREE.Color(0x18a6d8)
        : this.track.theme === 'switchback'
          ? new THREE.Color(0xd96b8c)
          : new THREE.Color(0xe59c44);
    const streakIntensity = this.track.theme === 'switchback' ? 0.22 : 0.34;
    roadMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWetTint = { value: wetTint };
      shader.uniforms.uStreakIntensity = { value: streakIntensity };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRoadUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vRoadUv;
          uniform vec3 uWetTint;
          uniform float uStreakIntensity;`,
        )
        .replace(
          '#include <fog_fragment>',
          `float viewFresnel = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
          float laneBands = sin(vRoadUv.x * 22.0) * 0.5 + 0.5;
          float puddleRipple = sin(vRoadUv.y * 190.0 + vRoadUv.x * 9.0) * 0.5 + 0.5;
          float wetGlint = smoothstep(0.32, 0.95, laneBands * 0.65 + puddleRipple * 0.35);
          gl_FragColor.rgb += uWetTint * (viewFresnel * wetGlint * uStreakIntensity);
          #include <fog_fragment>`,
        );
    };
    roadMat.customProgramCacheKey = () => `wet-road-${this.track.theme}`;

    const samples = this.sampled.samples;
    const halfRoad = this.sampled.roadWidth * 0.5;
    const halfWall = this.sampled.wallDistance;

    // 1. Road Ribbon Geometry
    const roadGeo = this.buildRibbonGeometry(samples, -halfRoad, halfRoad, 0.0, 0.0, this.sampled.totalLength, false);
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    // 2. Shoulder / Sidewalk / Quay Deck Ribbon (from -wallDistance-1.5 to +wallDistance+1.5 slightly below/flush)
    const shoulderColor =
      this.track.theme === 'harbour' ? 0x162230 : this.track.theme === 'switchback' ? 0x201d26 : 0x2a2723;
    const shoulderMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: shoulderColor,
        roughness: 0.48,
        metalness: 0.18,
      }),
    );
    const leftShoulderGeo = this.buildRibbonGeometry(
      samples,
      -halfWall - 2.6,
      -halfRoad,
      this.track.theme === 'oldtown' ? 0.16 : 0.02,
      this.track.theme === 'oldtown' ? 0.16 : -0.02,
      this.sampled.totalLength,
    );
    const rightShoulderGeo = this.buildRibbonGeometry(
      samples,
      halfRoad,
      halfWall + 2.6,
      this.track.theme === 'oldtown' ? 0.16 : -0.02,
      this.track.theme === 'oldtown' ? 0.16 : 0.02,
      this.sampled.totalLength,
    );
    const lsMesh = new THREE.Mesh(leftShoulderGeo, shoulderMat);
    const rsMesh = new THREE.Mesh(rightShoulderGeo, shoulderMat);
    lsMesh.receiveShadow = true;
    rsMesh.receiveShadow = true;
    this.scene.add(lsMesh, rsMesh);

    // 3. Continuous Road Center Dashed Lines / Edge Lines (Harbour & Switchback)
    if (this.track.theme !== 'oldtown') {
      const lineMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: this.track.theme === 'harbour' ? 0x38bdf8 : 0xfbbf24,
          transparent: true,
          opacity: 0.65,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      for (const side of [-1, 1]) {
        const edgeGeo = this.buildRibbonGeometry(
          samples,
          side * (halfRoad - 0.55) - 0.12,
          side * (halfRoad - 0.55) + 0.12,
          0.025,
          0.025,
          this.sampled.totalLength,
        );
        this.scene.add(new THREE.Mesh(edgeGeo, lineMat));
      }
    }

    // 4. Continuous Track Wall / Guardrail / Curb Beams at +/- wallDistance
    const wallHeight = this.track.theme === 'harbour' ? 0.75 : this.track.theme === 'switchback' ? 0.85 : 0.55;
    const wallColor =
      this.track.theme === 'harbour' ? 0x1e3a4c : this.track.theme === 'switchback' ? 0x64748b : 0x3a342d;
    const wallMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.55,
        metalness: this.track.theme === 'switchback' ? 0.75 : 0.2,
      }),
    );

    for (const side of [-1, 1]) {
      const offset = side * (halfWall + 0.28);
      const wallGeo = this.buildWallGeometry(samples, offset, wallHeight, 0.45);
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);
    }

    // 5. Start / Finish Line Strip + Neon Arch
    const startPt = sampleTrackAtT(this.sampled, 0);
    const startTex = this.trackTex(createStartFinishTexture());
    const startGeo = this.trackGeo(new THREE.PlaneGeometry(3.2, this.sampled.roadWidth * 0.96));
    startGeo.rotateX(-Math.PI / 2);
    const startMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: startTex,
        roughness: 0.4,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    const startMesh = new THREE.Mesh(startGeo, startMat);
    startMesh.position.set(startPt.x, startPt.elevation + 0.03, startPt.y);
    startMesh.rotation.y = -Math.atan2(startPt.ty, startPt.tx);
    this.scene.add(startMesh);

    // Start gantry arch
    const archGroup = new THREE.Group();
    const archMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.3 }),
    );
    const archGlowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: this.track.theme === 'harbour' ? 0x00e5ff : this.track.theme === 'switchback' ? 0xff4d9e : 0xfbbf24,
      }),
    );
    // The legs stand just outside the barrier, so no car can reach them.
    const span = this.sampled.wallDistance * 2 + 1.6;
    for (const side of [-1, 1]) {
      const colGeo = this.trackGeo(new THREE.BoxGeometry(0.6, 7.2, 0.6));
      const col = new THREE.Mesh(colGeo, archMat);
      col.position.set(0, 3.6, side * span * 0.5);
      archGroup.add(col);
    }
    const beamGeo = this.trackGeo(new THREE.BoxGeometry(1.1, 1.1, span + 0.8));
    const beam = new THREE.Mesh(beamGeo, archMat);
    beam.position.set(0, 7.0, 0);
    archGroup.add(beam);

    const stripGeo = this.trackGeo(new THREE.BoxGeometry(1.18, 0.25, span));
    const strip = new THREE.Mesh(stripGeo, archGlowMat);
    strip.position.set(0, 6.65, 0);
    archGroup.add(strip);

    archGroup.position.set(startPt.x, startPt.elevation, startPt.y);
    archGroup.rotation.y = -Math.atan2(startPt.ty, startPt.tx);
    this.scene.add(archGroup);

  }

  private buildRibbonGeometry(
    samples: SampledTrack['samples'],
    offsetLeft: number,
    offsetRight: number,
    elevLeft: number,
    elevRight: number,
    totalLength: number,
    clip = true,
  ): THREE.BufferGeometry {
    const n = samples.length;
    // Clipped, a ribbon leaves out the stretches where its edge would fold back across the road.
    const left = clip ? offsetEdge(this.sampled, offsetLeft) : [];
    const right = clip ? offsetEdge(this.sampled, offsetRight) : [];
    const raw = (s: SampledTrack['samples'][number], offset: number) => ({ x: s.x + s.nx * offset, y: s.y + s.ny * offset });
    const positions = new Float32Array((n + 1) * 2 * 3);
    const uvs = new Float32Array((n + 1) * 2 * 2);
    const indices: number[] = [];

    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const vDist = i === n ? 1.0 : s.dist / totalLength;

      const { x: lx, y: lz } = left[i % n] ?? raw(s, offsetLeft);
      const ly = s.elevation + elevLeft;

      const { x: rx, y: rz } = right[i % n] ?? raw(s, offsetRight);
      const ry = s.elevation + elevRight;

      const base = i * 6;
      positions[base] = lx;
      positions[base + 1] = ly;
      positions[base + 2] = lz;
      positions[base + 3] = rx;
      positions[base + 4] = ry;
      positions[base + 5] = rz;

      const uvBase = i * 4;
      uvs[uvBase] = 0;
      uvs[uvBase + 1] = vDist;
      uvs[uvBase + 2] = 1;
      uvs[uvBase + 3] = vDist;

      const drawn = (k: number) => !clip || (left[k % n] != null && right[k % n] != null);
      if (i < n && drawn(i) && drawn(i + 1)) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return this.trackGeo(geo);
  }

  private buildWallGeometry(
    samples: SampledTrack['samples'],
    offset: number,
    height: number,
    thickness: number,
  ): THREE.BufferGeometry {
    const n = samples.length;
    const verts: number[] = [];
    const indices: number[] = [];

    const halfT = thickness * 0.5;
    const inner = offsetEdge(this.sampled, offset - halfT);
    const outer = offsetEdge(this.sampled, offset + halfT);
    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      const cy = s.elevation;
      const { x: ix, y: iz } = inner[i % n] ?? { x: s.x + s.nx * (offset - halfT), y: s.y + s.ny * (offset - halfT) };
      const { x: ox, y: oz } = outer[i % n] ?? { x: s.x + s.nx * (offset + halfT), y: s.y + s.ny * (offset + halfT) };

      // 4 vertices per ring: inner-bottom, inner-top, outer-top, outer-bottom
      verts.push(ix, cy - 0.1, iz);
      verts.push(ix, cy + height, iz);
      verts.push(ox, cy + height, oz);
      verts.push(ox, cy - 0.1, oz);

      const drawn = (k: number) => inner[k % n] != null && outer[k % n] != null;
      if (i < n && drawn(i) && drawn(i + 1)) {
        const p = i * 4;
        const q = (i + 1) * 4;
        // Inner face
        indices.push(p + 0, q + 0, q + 1, p + 0, q + 1, p + 1);
        // Top face
        indices.push(p + 1, q + 1, q + 2, p + 1, q + 2, p + 2);
        // Outer face
        indices.push(p + 2, q + 2, q + 3, p + 2, q + 3, p + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return this.trackGeo(geo);
  }

  private extractNamedMeshes(root: THREE.Group): Map<string, THREE.Mesh> {
    const map = new Map<string, THREE.Mesh>();
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        this.trackGeo(m.geometry);
        if (Array.isArray(m.material)) m.material.forEach((mat) => this.trackMat(mat));
        else this.trackMat(m.material);
        map.set(m.name, m);
      }
    });
    return map;
  }

  private buildTrackScenery(propRoot: THREE.Group, facadeTex?: THREE.Texture): void {
    const meshes = this.extractNamedMeshes(propRoot);
    const densityMult = this.quality === 'low' ? 0.5 : this.quality === 'medium' ? 0.78 : 1.0;

    if (this.track.theme === 'harbour') {
      this.buildHarbourScenery(meshes, densityMult);
    } else if (this.track.theme === 'switchback') {
      this.buildSwitchbackScenery(meshes, densityMult);
    } else {
      this.buildOldTownScenery(meshes, densityMult, facadeTex);
    }
  }

  private createInstanced(
    mesh: THREE.Mesh,
    transforms: InstanceTransform[],
    castShadow = false,
  ): THREE.InstancedMesh | null {
    if (transforms.length === 0) return null;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, transforms.length);
    im.castShadow = castShadow;
    im.receiveShadow = true;
    transforms.forEach((t, idx) => {
      _v3A.set(t.x, t.y, t.z);
      _euler.set(0, t.rotY, 0);
      _quat.setFromEuler(_euler);
      _scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
      _mat4.compose(_v3A, _quat, _scale);
      im.setMatrixAt(idx, _mat4);
      if (t.color !== undefined) {
        im.setColorAt(idx, _color.setHex(t.color));
      }
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    this.scene.add(im);
    return im;
  }

  private buildHarbourScenery(meshes: Map<string, THREE.Mesh>, densityMult: number): void {
    const b = this.sampled.bounds;
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minY + b.maxY) * 0.5;

    // 1. Dark reflective harbour water plane beneath the entire quay
    const waterGeo = this.trackGeo(new THREE.PlaneGeometry(1100, 1100));
    if (!this.isSoftwareGl && this.quality === 'high') {
      const reflector = new Reflector(waterGeo, {
        clipBias: 0.003,
        textureWidth: 512,
        textureHeight: 512,
        color: 0x0b2234,
      });
      reflector.rotation.x = -Math.PI / 2;
      reflector.position.set(cx, -1.8, cz);
      this.scene.add(reflector);
      this.reflector = reflector;
    } else {
      const waterMat = this.trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0x030e18,
          roughness: 0.08,
          metalness: 0.75,
          clearcoat: 0.9,
          clearcoatRoughness: 0.08,
          envMapIntensity: 1.5,
        }),
      );
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(cx, -1.8, cz);
      this.scene.add(water);
    }

    // Quay ground slab beneath the track interior
    const quayMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0c1520, roughness: 0.8, metalness: 0.15 }),
    );
    const quayGeo = this.buildRibbonGeometry(
      this.sampled.samples,
      -this.sampled.wallDistance - 26,
      this.sampled.wallDistance + 10,
      -1.85,
      -1.85,
      this.sampled.totalLength,
    );
    this.scene.add(new THREE.Mesh(quayGeo, quayMat));

    // Outer quay hazard warning curb ribbon
    const hazardTex = this.trackTex(createQuayHazardTexture());
    hazardTex.repeat.set(1, Math.max(40, Math.round(this.sampled.totalLength / 4)));
    const hazardMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.65, metalness: 0.15 }),
    );
    const hazardCurbGeo = this.buildRibbonGeometry(
      this.sampled.samples,
      this.sampled.wallDistance + 0.45,
      this.sampled.wallDistance + 1.35,
      0.04,
      0.04,
      this.sampled.totalLength,
    );
    this.scene.add(new THREE.Mesh(hazardCurbGeo, hazardMat));

    // 2. Bollards, Shipping Containers, Cranes, Floating Buoys & Neon Signs safely outside wallDistance
    const bollardTransforms: InstanceTransform[] = [];
    const containerTransforms: InstanceTransform[] = [];
    const craneTransforms: InstanceTransform[] = [];
    const buoyTransforms: InstanceTransform[] = [];
    const signFrameTransforms: InstanceTransform[] = [];
    const lightPoolTransforms: { x: number; y: number; z: number; scale: number; color: number }[] = [];

    const containerColors = [0x0e7490, 0x1d4ed8, 0xb91c1c, 0xc2410c, 0x0f766e, 0x475569];
    const stepBollard = Math.max(4, Math.round(6 / densityMult));
    const n = this.sampled.samples.length;

    for (let i = 0; i < n; i += stepBollard) {
      const s = this.sampled.samples[i];
      const heading = -Math.atan2(s.ty, s.tx);

      // Bollards along outer quay edge
      const bx = s.x + s.nx * (this.sampled.wallDistance + 1.8);
      const bz = s.y + s.ny * (this.sampled.wallDistance + 1.8);
      if (isScenerySpotSafe(this.sampled, bx, bz, 0.8)) {
        bollardTransforms.push({ x: bx, y: s.elevation, z: bz, rotY: heading });
      }
    }

    // Channel buoys floating in harbour water outside outer quay
    const buoyStep = Math.max(14, Math.round(18 / densityMult));
    for (let i = 0; i < n; i += buoyStep) {
      const s = this.sampled.samples[i];
      const bx = s.x + s.nx * (this.sampled.wallDistance + 22 + ((i * 7) % 14));
      const bz = s.y + s.ny * (this.sampled.wallDistance + 22 + ((i * 7) % 14));
      if (isScenerySpotSafe(this.sampled, bx, bz, 12.0)) {
        buoyTransforms.push({ x: bx, y: -1.85, z: bz, rotY: i * 0.4 });
      }
    }

    // Shipping container stacks & gantry cranes along inner/landward side
    const propStep = Math.max(7, Math.round(9 / densityMult));
    for (let i = 0; i < n; i += propStep) {
      const s = this.sampled.samples[i];
      const heading = -Math.atan2(s.ty, s.tx);
      const distOut = this.sampled.wallDistance + 6.5;
      const side = -1;
      const px = s.x + s.nx * side * distOut;
      const pz = s.y + s.ny * side * distOut;

      if (isScenerySpotSafe(this.sampled, px, pz, 4.2)) {
        const stackHeight = ((i * 7) % 3) + 1;
        for (let h = 0; h < stackHeight; h++) {
          containerTransforms.push({
            x: px,
            y: s.elevation + h * 2.6,
            z: pz,
            rotY: heading,
            color: containerColors[(i + h * 3) % containerColors.length],
          });
        }
      }

      // Huge gantry cranes every ~35 samples
      if (i % (propStep * 4) === 0) {
        const gx = s.x + s.nx * (this.sampled.wallDistance + 13.5);
        const gz = s.y + s.ny * (this.sampled.wallDistance + 13.5);
        // A crane is 12 m wide and 30 m deep (from 9.5 m inside its middle to 20.5 m out): on a bend its
        // middle can be clear while a leg stands on the road, so the whole footprint must be.
        if (isScenerySpotSafe(this.sampled, gx, gz, 6.5) && isFootprintSafe(this.sampled, gx, gz, heading, -6, 6, -9.5, 20.5, 1)) {
          craneTransforms.push({ x: gx, y: -1.6, z: gz, rotY: heading });
        }
      }
    }

    // Neon Harbour Signs & wet road light pools
    const signSpecs = [
      { label: 'PIER 04', primary: '#ff2e93', secondary: '#00e5ff', pool: 0xff2e93 },
      { label: 'CARGO BAY', primary: '#00e5ff', secondary: '#a3ff12', pool: 0x00e5ff },
      { label: 'NIGHTLINE', primary: '#a3ff12', secondary: '#00e5ff', pool: 0xa3ff12 },
      { label: 'DOCK 07', primary: '#ff2e93', secondary: '#a3ff12', pool: 0xff2e93 },
    ];
    const signCount = this.quality === 'low' ? 8 : 14;
    for (let k = 0; k < signCount; k++) {
      const t = (k + 0.08) / signCount;
      const s = sampleTrackAtT(this.sampled, t);
      const side = k % 2 === 0 ? 1 : -1;
      // The frame runs 2.4 m either side of its middle, across the road's line: far enough out that its
      // near end stays off the wall.
      const sx = s.x + s.nx * side * (this.sampled.wallDistance + 2.9);
      const sz = s.y + s.ny * side * (this.sampled.wallDistance + 2.9);
      const rotY = -Math.atan2(s.ty, s.tx) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (isScenerySpotSafe(this.sampled, sx, sz, 1.2) && isFootprintSafe(this.sampled, sx, sz, rotY, -2.4, 2.3, -0.2, 0.2, 0.3)) {
        signFrameTransforms.push({ x: sx, y: s.elevation, z: sz, rotY });

        const spec = signSpecs[k % signSpecs.length];
        const tex = this.trackTex(createNeonSignTexture(spec.label, spec.primary, spec.secondary));
        const panelGeo = this.trackGeo(new THREE.PlaneGeometry(3.6, 1.3));
        const panelMat = this.trackMat(
          new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
        );
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(sx, s.elevation + 4.5, sz);
        panel.rotation.y = rotY;
        this.scene.add(panel);

        // Light pool on road edge
        lightPoolTransforms.push({
          x: s.x + s.nx * side * (this.sampled.roadWidth * 0.36),
          y: s.elevation + 0.03,
          z: s.y + s.ny * side * (this.sampled.roadWidth * 0.36),
          scale: 13,
          color: spec.pool,
        });
      }
    }

    // Distant glowing city skyline + rooftop neon beacon crowns around outer perimeter
    const skylineMesh = meshes.get('container');
    if (skylineMesh) {
      const winTex = this.trackTex(createSkylineWindowTexture());
      const towerGeo = this.trackGeo(new THREE.BoxGeometry(1, 1, 1));
      const towerMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0b1626,
          emissive: 0xffffff,
          emissiveMap: winTex,
          emissiveIntensity: 0.9,
          roughness: 0.4,
          metalness: 0.6,
        }),
      );
      const crownGeo = this.trackGeo(new THREE.BoxGeometry(1.02, 0.02, 1.02));
      const crownMat = this.trackMat(
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      const towerCount = this.quality === 'low' ? 28 : 54;
      const skylineIM = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
      const crownIM = new THREE.InstancedMesh(crownGeo, crownMat, towerCount);
      const crownColors = [0x00e5ff, 0xff2e93, 0xa3ff12, 0x38bdf8];

      for (let i = 0; i < towerCount; i++) {
        const ang = (i / towerCount) * Math.PI * 2;
        const rad = 250 + ((i * 37) % 90);
        const w = 18 + ((i * 13) % 22);
        const h = 42 + ((i * 29) % 95);
        const tx = cx + Math.cos(ang) * rad;
        const tz = cz + Math.sin(ang) * rad;
        _v3A.set(tx, h * 0.5 - 2, tz);
        _euler.set(0, -ang, 0);
        _quat.setFromEuler(_euler);
        _scale.set(w, h, w);
        _mat4.compose(_v3A, _quat, _scale);
        skylineIM.setMatrixAt(i, _mat4);

        _v3A.set(tx, h - 1.2, tz);
        _scale.set(w, 1.1, w);
        _mat4.compose(_v3A, _quat, _scale);
        crownIM.setMatrixAt(i, _mat4);
        crownIM.setColorAt(i, _color.setHex(crownColors[i % crownColors.length]));
      }
      skylineIM.instanceMatrix.needsUpdate = true;
      skylineIM.computeBoundingSphere();
      crownIM.instanceMatrix.needsUpdate = true;
      if (crownIM.instanceColor) crownIM.instanceColor.needsUpdate = true;
      crownIM.computeBoundingSphere();
      this.scene.add(skylineIM, crownIM);
    }

    const bollardMesh = meshes.get('bollard');
    const containerMesh = meshes.get('container');
    const craneMesh = meshes.get('crane');
    const signFrameMesh = meshes.get('neon_frame');
    const buoyBodyMesh = meshes.get('buoy_body');
    const buoyLightMesh = meshes.get('buoy_light');

    if (bollardMesh) this.createInstanced(bollardMesh, bollardTransforms);
    if (containerMesh) this.createInstanced(containerMesh, containerTransforms, true);
    if (craneMesh) this.createInstanced(craneMesh, craneTransforms, true);
    if (signFrameMesh) this.createInstanced(signFrameMesh, signFrameTransforms);
    if (buoyBodyMesh) this.createInstanced(buoyBodyMesh, buoyTransforms);
    if (buoyLightMesh) this.createInstanced(buoyLightMesh, buoyTransforms);

    this.addLightPoolDecals(lightPoolTransforms);
  }

  private buildSwitchbackScenery(meshes: Map<string, THREE.Mesh>, densityMult: number): void {
    const b = this.sampled.bounds;
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minY + b.maxY) * 0.5;

    // 1. Mountain Ground Valley Skirt + Layered Dusk Mountain Silhouette Rings
    const terrainGeo = this.trackGeo(new THREE.PlaneGeometry(1100, 1100, 32, 32));
    terrainGeo.rotateX(-Math.PI / 2);
    const tPos = terrainGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      const x = tPos.getX(i);
      const z = tPos.getZ(i);
      const dist = Math.hypot(x - cx, z - cz);
      const drop = dist > 190 ? (dist - 190) * 0.14 : 0;
      tPos.setY(i, -6 - drop + Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4);
    }
    terrainGeo.computeVertexNormals();
    const terrainMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x161124, roughness: 0.95, metalness: 0.02 }),
    );
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.position.set(cx, 0, cz);
    this.scene.add(terrainMesh);

    // Road embankment skirt beneath elevated mountain track
    const embMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1c172b, roughness: 0.92 }),
    );
    const embLeft = this.buildRibbonGeometry(
      this.sampled.samples,
      -this.sampled.wallDistance - 16,
      -this.sampled.wallDistance - 2.4,
      -8.0,
      -0.02,
      this.sampled.totalLength,
    );
    const embRight = this.buildRibbonGeometry(
      this.sampled.samples,
      this.sampled.wallDistance + 2.4,
      this.sampled.wallDistance + 16,
      -0.02,
      -8.0,
      this.sampled.totalLength,
    );
    this.scene.add(new THREE.Mesh(embLeft, embMat), new THREE.Mesh(embRight, embMat));

    // Multi-layered Sculpted Craggy Mountain Ridge Rings in Dusk Haze (replaces cone pyramids)
    const ridgeConfigs = [
      { radius: 245, baseY: -12, amp: 54, seed: 1.2, color: 0x221233 },
      { radius: 345, baseY: -10, amp: 82, seed: 4.7, color: 0x331945 },
    ];
    for (const rc of ridgeConfigs) {
      const segs = 128;
      const verts: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const rJitter =
          rc.radius +
          Math.sin(a * 5 + rc.seed) * 22 +
          Math.cos(a * 11 + rc.seed * 2) * 11;
        const ridgeH =
          Math.abs(Math.sin(a * 4 + rc.seed)) * rc.amp * 0.6 +
          Math.abs(Math.cos(a * 9 + rc.seed * 1.6)) * rc.amp * 0.28 +
          Math.abs(Math.sin(a * 19 + rc.seed * 3.1)) * rc.amp * 0.14;
        const vx = cx + Math.cos(a) * rJitter;
        const vz = cz + Math.sin(a) * rJitter;
        verts.push(vx, rc.baseY, vz);
        verts.push(vx * 1.02 - cx * 0.02, rc.baseY + 12 + ridgeH, vz * 1.02 - cz * 0.02);
        if (i < segs) {
          const p = i * 2;
          indices.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
        }
      }
      const ridgeGeo = this.trackGeo(new THREE.BufferGeometry());
      ridgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      ridgeGeo.setIndex(indices);
      ridgeGeo.computeVertexNormals();
      const ridgeMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: rc.color,
          roughness: 0.96,
          side: THREE.DoubleSide,
        }),
      );
      this.scene.add(new THREE.Mesh(ridgeGeo, ridgeMat));
    }

    // 2. Pine Trees, Rocks, Guardrail Posts, Roadside Lamps & Hairpin Chevrons
    const pineTransforms: InstanceTransform[] = [];
    const rockTransforms: InstanceTransform[] = [];
    const railPostTransforms: InstanceTransform[] = [];
    const lampTransforms: InstanceTransform[] = [];
    const chevronTransforms: InstanceTransform[] = [];
    const lightPools: { x: number; y: number; z: number; scale: number; color: number }[] = [];

    const n = this.sampled.samples.length;
    const treeStep = Math.max(3, Math.round(4 / densityMult));

    for (let i = 0; i < n; i += treeStep) {
      const s = this.sampled.samples[i];
      const heading = -Math.atan2(s.ty, s.tx);

      // Guardrail posts along both edges
      for (const side of [-1, 1]) {
        const px = s.x + s.nx * side * (this.sampled.wallDistance + 0.45);
        const pz = s.y + s.ny * side * (this.sampled.wallDistance + 0.45);
        railPostTransforms.push({ x: px, y: s.elevation, z: pz, rotY: heading });
      }

      // Pine forest rings strictly outside wallDistance
      for (let ring = 0; ring < 2; ring++) {
        const side = (i + ring) % 2 === 0 ? 1 : -1;
        const distOut = this.sampled.wallDistance + 5.5 + ring * 9 + ((i * 11) % 7);
        const tx = s.x + s.nx * side * distOut;
        const tz = s.y + s.ny * side * distOut;
        if (isScenerySpotSafe(this.sampled, tx, tz, 3.0)) {
          const sc = 0.85 + ((i * 13 + ring * 7) % 10) * 0.05;
          pineTransforms.push({
            x: tx,
            y: s.elevation - 0.5,
            z: tz,
            rotY: (i * 1.3) % Math.PI,
            sx: sc,
            sy: sc * (0.95 + ((i % 4) * 0.08)),
            sz: sc,
          });
        }
      }

      // Rocks near road shoulder outside wall
      if (i % (treeStep * 2) === 0) {
        const side = i % 4 === 0 ? -1 : 1;
        const rx = s.x + s.nx * side * (this.sampled.wallDistance + 4.0);
        const rz = s.y + s.ny * side * (this.sampled.wallDistance + 4.0);
        if (isScenerySpotSafe(this.sampled, rx, rz, 2.2)) {
          const rSc = 0.75 + ((i * 5) % 8) * 0.12;
          rockTransforms.push({ x: rx, y: s.elevation - 0.3, z: rz, rotY: i * 0.9, sx: rSc, sy: rSc, sz: rSc });
        }
      }
    }

    // Hairpin reflective chevron boards along outer edge of sharp turns
    for (let i = 0; i < n; i += 4) {
      const prev = this.sampled.samples[(i - 2 + n) % n];
      const curr = this.sampled.samples[i];
      const next = this.sampled.samples[(i + 2) % n];
      const cross = prev.tx * next.ty - prev.ty * next.tx;
      if (Math.abs(cross) > 0.14) {
        // Outer edge is opposite to turn direction
        const outerSide = cross > 0 ? -1 : 1;
        const cxOut = curr.x + curr.nx * outerSide * (this.sampled.wallDistance + 1.15);
        const czOut = curr.y + curr.ny * outerSide * (this.sampled.wallDistance + 1.15);
        if (isScenerySpotSafe(this.sampled, cxOut, czOut, 0.7)) {
          const faceRot = -Math.atan2(curr.ty, curr.tx) + (cross > 0 ? -0.45 : 0.45);
          chevronTransforms.push({ x: cxOut, y: curr.elevation, z: czOut, rotY: faceRot });
        }
      }
    }

    // Roadside highway lamps + illuminated luminaire bulbs
    const lampStep = Math.max(10, Math.round(14 / densityMult));
    for (let i = 0; i < n; i += lampStep) {
      const s = this.sampled.samples[i];
      const side = (i / lampStep) % 2 === 0 ? 1 : -1;
      const lx = s.x + s.nx * side * (this.sampled.wallDistance + 1.4);
      const lz = s.y + s.ny * side * (this.sampled.wallDistance + 1.4);
      if (isScenerySpotSafe(this.sampled, lx, lz, 0.9)) {
        const rotY = Math.atan2(-s.ny * side, -s.nx * side);
        lampTransforms.push({ x: lx, y: s.elevation, z: lz, rotY });

        lightPools.push({
          x: s.x + s.nx * side * (this.sampled.roadWidth * 0.25),
          y: s.elevation + 0.03,
          z: s.y + s.ny * side * (this.sampled.roadWidth * 0.25),
          scale: 13.5,
          color: 0xffb36b,
        });
      }
    }

    const trunkMesh = meshes.get('pine_trunk');
    const foliageMesh = meshes.get('pine_foliage');
    const rockMesh = meshes.get('rock');
    const postMesh = meshes.get('guardrail_post');
    const lampMesh = meshes.get('lamp_post');
    const bulbMesh = meshes.get('lamp_bulb');
    const chevPostMesh = meshes.get('chevron_post');
    const chevBoardMesh = meshes.get('chevron_board');

    if (chevBoardMesh) {
      const chevTex = this.trackTex(createChevronSignTexture());
      const cMat = chevBoardMesh.material as THREE.MeshStandardMaterial;
      cMat.map = chevTex;
      cMat.emissiveMap = chevTex;
      cMat.emissive.setHex(0xffffff);
      cMat.emissiveIntensity = 0.75;
      cMat.needsUpdate = true;
    }

    if (trunkMesh) this.createInstanced(trunkMesh, pineTransforms);
    if (foliageMesh) this.createInstanced(foliageMesh, pineTransforms, true);
    if (rockMesh) this.createInstanced(rockMesh, rockTransforms);
    if (postMesh) this.createInstanced(postMesh, railPostTransforms);
    if (lampMesh) this.createInstanced(lampMesh, lampTransforms);
    if (bulbMesh) this.createInstanced(bulbMesh, lampTransforms);
    if (chevPostMesh) this.createInstanced(chevPostMesh, chevronTransforms);
    if (chevBoardMesh) this.createInstanced(chevBoardMesh, chevronTransforms);

    this.addLightPoolDecals(lightPools);
  }

  private buildOldTownScenery(
    meshes: Map<string, THREE.Mesh>,
    densityMult: number,
    facadeTex?: THREE.Texture,
  ): void {
    const b = this.sampled.bounds;
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minY + b.maxY) * 0.5;

    // Ground base plane beneath Old Town
    const baseGeo = this.trackGeo(new THREE.PlaneGeometry(750, 750));
    baseGeo.rotateX(-Math.PI / 2);
    const baseMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.9 }),
    );
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(cx, -0.05, cz);
    this.scene.add(baseMesh);

    // Apply generated stone masonry texture to townhouse walls
    const wallsMesh = meshes.get('house_walls');
    if (wallsMesh && facadeTex) {
      facadeTex.colorSpace = THREE.SRGBColorSpace;
      facadeTex.wrapS = THREE.RepeatWrapping;
      facadeTex.wrapT = THREE.RepeatWrapping;
      facadeTex.repeat.set(2, 2);
      this.trackTex(facadeTex);
      const wallMat = wallsMesh.material as THREE.MeshStandardMaterial;
      wallMat.map = facadeTex;
      wallMat.color.setHex(0xbcb2a4);
      wallMat.roughness = 0.88;
      wallMat.needsUpdate = true;
    }

    const houseTransforms: InstanceTransform[] = [];
    const lanternTransforms: InstanceTransform[] = [];
    const lightPools: { x: number; y: number; z: number; scale: number; color: number }[] = [];

    const houseColors = [0xd6cfc2, 0xc4b8a5, 0x9ca3af, 0xb8a38f, 0x8c8478];
    const n = this.sampled.samples.length;
    const houseStep = Math.max(4, Math.round(5 / densityMult));

    for (let i = 0; i < n; i += houseStep) {
      const s = this.sampled.samples[i];
      const heading = -Math.atan2(s.ty, s.tx);

      for (const side of [-1, 1]) {
        const hx = s.x + s.nx * side * (this.sampled.wallDistance + 4.35);
        const hz = s.y + s.ny * side * (this.sampled.wallDistance + 4.35);
        if (isScenerySpotSafe(this.sampled, hx, hz, 3.8)) {
          const scY = 0.88 + ((i * 7 + (side > 0 ? 3 : 0)) % 7) * 0.09;
          houseTransforms.push({
            x: hx,
            y: s.elevation,
            z: hz,
            rotY: heading,
            sx: 1.0,
            sy: scY,
            sz: 1.0,
            color: houseColors[(i + (side > 0 ? 2 : 0)) % houseColors.length],
          });
        }
      }
    }

    const lanternStep = Math.max(4, Math.round(6 / densityMult));
    for (let i = 0; i < n; i += lanternStep) {
      const s = this.sampled.samples[i];
      const side = (i / lanternStep) % 2 === 0 ? 1 : -1;
      const lx = s.x + s.nx * side * (this.sampled.wallDistance + 0.55);
      const lz = s.y + s.ny * side * (this.sampled.wallDistance + 0.55);
      if (isScenerySpotSafe(this.sampled, lx, lz, 0.45)) {
        lanternTransforms.push({ x: lx, y: s.elevation, z: lz, rotY: 0 });
        lightPools.push({
          x: s.x + s.nx * side * (this.sampled.roadWidth * 0.18),
          y: s.elevation + 0.035,
          z: s.y + s.ny * side * (this.sampled.roadWidth * 0.18),
          scale: 15.0,
          color: 0xffaa3b,
        });
      }
    }

    const roofMesh = meshes.get('house_roof');
    const winMesh = meshes.get('house_windows');
    const lanternIron = meshes.get('lantern_iron');
    const lanternGlass = meshes.get('lantern_glass');

    if (winMesh) {
      const winTex = this.trackTex(createTownhouseWindowTexture());
      const wMat = winMesh.material as THREE.MeshStandardMaterial;
      wMat.map = winTex;
      wMat.emissiveMap = winTex;
      wMat.emissive.setHex(0xffb347);
      wMat.emissiveIntensity = 1.35;
      wMat.needsUpdate = true;
    }
    if (lanternGlass) {
      const lMat = lanternGlass.material as THREE.MeshStandardMaterial;
      lMat.emissiveIntensity = 1.85;
      lMat.needsUpdate = true;
    }

    // Distant old-town gable roofs & cathedral spires silhouette ring so horizons never feel empty
    const spireGeo = this.trackGeo(new THREE.ConeGeometry(7, 28, 4));
    const spireMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0d121d, roughness: 0.92 }),
    );
    const spireCount = this.quality === 'low' ? 18 : 34;
    const spireIM = new THREE.InstancedMesh(spireGeo, spireMat, spireCount);
    for (let i = 0; i < spireCount; i++) {
      const ang = (i / spireCount) * Math.PI * 2;
      const rad = 210 + ((i * 29) % 75);
      const isTower = i % 5 === 0;
      _v3A.set(cx + Math.cos(ang) * rad, isTower ? 18 : 11, cz + Math.sin(ang) * rad);
      _euler.set(0, ang, 0);
      _quat.setFromEuler(_euler);
      _scale.set(isTower ? 1.1 : 1.8, isTower ? 1.55 : 0.9, isTower ? 1.1 : 1.8);
      _mat4.compose(_v3A, _quat, _scale);
      spireIM.setMatrixAt(i, _mat4);
    }
    spireIM.instanceMatrix.needsUpdate = true;
    spireIM.computeBoundingSphere();
    this.scene.add(spireIM);

    if (wallsMesh) this.createInstanced(wallsMesh, houseTransforms, true);
    if (roofMesh) this.createInstanced(roofMesh, houseTransforms);
    if (winMesh) this.createInstanced(winMesh, houseTransforms);
    if (lanternIron) this.createInstanced(lanternIron, lanternTransforms);
    if (lanternGlass) this.createInstanced(lanternGlass, lanternTransforms);

    this.addLightPoolDecals(lightPools);
  }

  private addLightPoolDecals(
    pools: { x: number; y: number; z: number; scale: number; color: number }[],
  ): void {
    if (pools.length === 0) return;
    const poolTex = this.trackTex(createLightPoolTexture('#ffffff'));
    const geo = this.trackGeo(new THREE.PlaneGeometry(1, 1));
    geo.rotateX(-Math.PI / 2);
    const mat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: poolTex,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );

    const im = new THREE.InstancedMesh(geo, mat, pools.length);
    pools.forEach((p, idx) => {
      _v3A.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.set(p.scale, 1, p.scale);
      _mat4.compose(_v3A, _quat, _scale);
      im.setMatrixAt(idx, _mat4);
      im.setColorAt(idx, _color.setHex(p.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    this.scene.add(im);
  }

  private getElevationAt(x: number, y: number): number {
    // Fast elevation estimate from closest track sample
    let bestD = Infinity;
    let elev = 0;
    const samples = this.sampled.samples;
    for (let i = 0; i < samples.length; i += 2) {
      const s = samples[i];
      const d = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d < bestD) {
        bestD = d;
        elev = s.elevation;
      }
    }
    return elev;
  }

  private getOrCreateCarVisual(carState: CarFrameState): CarVisual | null {
    const existing = this.cars.get(carState.id);
    if (existing) return existing;
    if (!this.carTemplate || !this.wheelTemplate) return null;

    const root = new THREE.Group();
    const chassisGroup = new THREE.Group();
    root.add(chassisGroup);

    const carColor = new THREE.Color(carState.color);
    const bodyMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: carColor,
        metalness: 0.76,
        roughness: 0.22,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.4,
      }),
    );

    const tailMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff1e38,
        emissive: 0xff1e38,
        emissiveIntensity: 1.8,
        roughness: 0.2,
      }),
    );

    this.carTemplate.traverse((c) => {
      if (!(c as THREE.Mesh).isMesh) return;
      const src = c as THREE.Mesh;
      const mat =
        src.name === 'car_body'
          ? bodyMat
          : src.name === 'car_taillights'
            ? tailMat
            : src.material;
      const m = new THREE.Mesh(src.geometry, mat);
      m.castShadow = src.castShadow;
      m.receiveShadow = src.receiveShadow;
      chassisGroup.add(m);
    });

    // 4 wheels attached to root (chassis rolls independently)
    const wheelPositions: [number, number, number, boolean][] = [
      [1.36, 0.34, -0.92, true],
      [1.36, 0.34, 0.92, true],
      [-1.34, 0.34, -0.94, false],
      [-1.34, 0.34, 0.94, false],
    ];
    const wheels: THREE.Group[] = [];
    const frontWheels: THREE.Group[] = [];

    for (const [wx, wy, wz, isFront] of wheelPositions) {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(wx, wy, wz);
      const spinPivot = new THREE.Group();
      this.wheelTemplate.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = new THREE.Mesh((c as THREE.Mesh).geometry, (c as THREE.Mesh).material);
          m.castShadow = true;
          spinPivot.add(m);
        }
      });
      steerPivot.add(spinPivot);
      if (this.caliperTemplate) {
        const cal = new THREE.Mesh(this.caliperTemplate.geometry, this.caliperTemplate.material);
        steerPivot.add(cal);
      }
      root.add(steerPivot);
      wheels.push(spinPivot);
      if (isFront) frontWheels.push(steerPivot);
    }

    // Twin additive nitro exhaust flame cones at quad exhaust tips
    const flameGeo = this.trackGeo(new THREE.ConeGeometry(0.068, 0.7, 10));
    flameGeo.rotateZ(Math.PI / 2);
    flameGeo.translate(-0.35, 0, 0);
    const nitroMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const nitroFlames: THREE.Mesh[] = [];
    for (const fz of [-0.39, 0.39]) {
      const flame = new THREE.Mesh(flameGeo, nitroMat);
      flame.position.set(-2.27, 0.25, fz);
      flame.visible = false;
      chassisGroup.add(flame);
      nitroFlames.push(flame);
    }

    // Contact shadow + neon underglow
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(5.2, 2.7));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      }),
    );
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = 0.025;
    root.add(shadowMesh);

    const underglowGeo = this.trackGeo(new THREE.PlaneGeometry(4.6, 2.5));
    underglowGeo.rotateX(-Math.PI / 2);
    const underglowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.trackTex(createLightPoolTexture(carState.color)),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
    underglowMesh.position.y = 0.035;
    root.add(underglowMesh);

    // Headlight ground projection cone
    const coneGeo = this.trackGeo(new THREE.PlaneGeometry(16, 5.6));
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(10.1, 0.04, 0);
    const coneMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.trackTex(createLightPoolTexture('#d8f3ff')),
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const headlightCone = new THREE.Mesh(coneGeo, coneMat);
    root.add(headlightCone);

    // Crown / Ram aura ring
    const auraGeo = this.trackGeo(new THREE.TorusGeometry(2.15, 0.07, 8, 28));
    auraGeo.rotateX(Math.PI / 2);
    const auraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      }),
    );
    const auraRing = new THREE.Mesh(auraGeo, auraMat);
    auraRing.position.y = 0.45;
    auraRing.visible = false;
    root.add(auraRing);

    // Floating player nameplate Sprite (compact size, omitted on player car so rear view stays clean)
    const nameTex = this.trackTex(createNameplateTexture(carState.name, carState.color));
    const spriteMat = this.trackMat(
      new THREE.SpriteMaterial({
        map: nameTex,
        transparent: true,
        depthTest: true,
      }),
    );
    const nameSprite = new THREE.Sprite(spriteMat);
    nameSprite.position.set(0, 1.85, 0);
    nameSprite.scale.set(1.5, 0.375, 1);
    nameSprite.visible = !carState.isPlayer;
    root.add(nameSprite);

    root.scale.setScalar(this.carScale);
    this.scene.add(root);
    const visual: CarVisual = {
      id: carState.id,
      root,
      chassisGroup,
      wheels,
      frontWheels,
      wheelSpin: 0,
      bodyMat,
      tailMat,
      underglowMesh,
      headlightCone,
      nitroFlames,
      nitroMat,
      auraRing,
      nameSprite,
      prevSpeed: 0,
      smokeCooldown: 0,
    };
    this.cars.set(carState.id, visual);
    return visual;
  }

  public draw(frame: RaceFrame): void {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastDrawMs) / 1000, 0.16);
    this.lastDrawMs = now;
    this.animTime += dt;

    if (this.vignettePass) {
      this.vignettePass.uniforms.time.value = this.animTime;
    }

    if (this.ready) {
      this.syncCars(frame, dt);
      this.syncItemBoxes(frame, dt);
      this.syncHazards(frame);
      this.processEvents(frame, dt);
      this.updateParticles(dt);
      this.updateCamera(frame, dt);
    }

    this.renderFrame();
  }

  /**
   * Renders an atmospheric spline flyover around the selected track for the Title Menu.
   */
  public renderPreviewFlyover(elapsedSec: number): void {
    if (this.disposed) return;
    const t = (elapsedSec * 0.018) % 1;
    const pt = sampleTrackAtT(this.sampled, t);
    const ahead = sampleTrackAtT(this.sampled, (t + 0.045) % 1);

    this.camera.position.set(
      pt.x + pt.nx * 12,
      pt.elevation + 11.5,
      pt.y + pt.ny * 12,
    );
    this.camera.lookAt(ahead.x, ahead.elevation + 2.0, ahead.y);
    this.camera.fov = 56;
    this.camera.updateProjectionMatrix();

    if (this.vignettePass) {
      this.vignettePass.uniforms.time.value = elapsedSec;
    }
    this.renderFrame();
  }

  private syncCars(frame: RaceFrame, dt: number): void {
    for (const c of frame.cars) {
      const vis = this.getOrCreateCarVisual(c);
      if (!vis) continue;

      const elev = this.getElevationAt(c.x, c.y);
      vis.root.position.set(c.x, elev, c.y);
      vis.root.rotation.y = -c.angle;

      // Wheel rotation & front wheel steering
      vis.wheelSpin -= (c.speed * dt) / 0.34;
      for (const w of vis.wheels) {
        w.rotation.z = vis.wheelSpin;
      }
      const steerAng = -(c.steer ?? 0) * 0.55;
      for (const fw of vis.frontWheels) {
        fw.rotation.y = steerAng;
      }

      // Body roll on corners & pitch on acceleration/braking
      const speedNorm = Math.min(1, Math.abs(c.speed) / 45);
      const targetRoll = (c.steer ?? 0) * speedNorm * 0.095;
      const accel = (c.speed - vis.prevSpeed) / Math.max(dt, 0.008);
      vis.prevSpeed = c.speed;
      const targetPitch = THREE.MathUtils.clamp(-accel * 0.0018, -0.055, 0.055);
      vis.chassisGroup.rotation.x = THREE.MathUtils.damp(vis.chassisGroup.rotation.x, targetRoll, 10, dt);
      vis.chassisGroup.rotation.z = THREE.MathUtils.damp(vis.chassisGroup.rotation.z, targetPitch, 10, dt);

      if (c.wrecked) {
        const t = this.animTime;
        vis.chassisGroup.position.y = Math.abs(Math.sin(t * 9)) * 0.45;
        vis.chassisGroup.rotation.x = Math.sin(t * 7) * 0.22;
        vis.chassisGroup.rotation.z = Math.cos(t * 5.5) * 0.12;
        vis.bodyMat.emissive.setHex(0x4a0d00);
        vis.bodyMat.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * 6)) * 0.6;
        vis.root.rotation.y += Math.sin(t * 4) * 0.08;
        if (Math.random() < 0.3) {
          this.spawnParticle(c.x, elev + 1.2, c.y, (Math.random() - 0.5) * 5, 4 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.4, 0.3, 1.0, 0.45, 0.1);
        }
      } else {
        vis.chassisGroup.position.y = 0;
        vis.bodyMat.emissive.setHex(0x000000);
        vis.bodyMat.emissiveIntensity = 1;
      }

      const flicker = Boolean(c.ghost) && Math.floor(this.animTime * 11) % 2 === 0;
      // A car that has finished is out of the race and others drive through it: drawn see-through.
      const parked = Boolean(c.finished) && !c.isPlayer;
      vis.bodyMat.transparent = Boolean(c.ghost) || parked;
      vis.bodyMat.opacity = parked ? 0.28 : flicker ? 0.35 : c.ghost ? 0.7 : 1;

      // Tail-lights intensify on braking
      vis.tailMat.emissiveIntensity = c.braking ? 3.8 : 1.5;

      // Twin nitro exhaust flames during Boost or Crown Rush
      const showNitro = Boolean(c.boosting || c.crownActive || c.ramming || c.drafting);
      vis.nitroMat.color.setHex(c.crownActive ? 0x99ee2d : c.ramming ? 0xff8a3d : c.drafting ? 0x406aff : 0x22d3ee);
      for (let f = 0; f < vis.nitroFlames.length; f++) {
        const fl = vis.nitroFlames[f];
        fl.visible = showNitro;
        if (showNitro) {
          const pulse = 0.85 + Math.sin(this.animTime * 42 + f * 2.1) * 0.35;
          fl.scale.set(pulse * (c.crownActive ? 1.45 : 1.1), 0.9, 0.9);
        }
      }

      // Aura ring for Crown Rush / Ram / Jolt
      if (c.crownActive) {
        vis.auraRing.visible = true;
        (vis.auraRing.material as THREE.MeshBasicMaterial).color.setHex(0xfacc15);
        vis.auraRing.rotation.z += dt * 4;
      } else if (c.ramming) {
        vis.auraRing.visible = true;
        (vis.auraRing.material as THREE.MeshBasicMaterial).color.setHex(0xef4444);
      } else if (c.warded) {
        vis.auraRing.visible = true;
        (vis.auraRing.material as THREE.MeshBasicMaterial).color.setHex(0xff56f6);
        vis.auraRing.rotation.z -= dt * 3;
      } else if (c.jolted) {
        vis.auraRing.visible = true;
        (vis.auraRing.material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
      } else {
        vis.auraRing.visible = false;
      }

      // Damage smoke, wrecked sparks, boost exhaust, and high-speed wet tire mist
      vis.smokeCooldown -= dt;
      const fwdX = Math.cos(c.angle);
      const fwdZ = Math.sin(c.angle);
      const rightX = -fwdZ;
      const rightZ = fwdX;

      if ((c.health < 40 || c.wrecked) && vis.smokeCooldown <= 0) {
        vis.smokeCooldown = c.wrecked ? 0.06 : c.health < 20 ? 0.1 : 0.18;
        const dark = c.wrecked || c.health < 30 ? 0.18 : 0.48;
        this.spawnParticle(
          c.x + fwdX * 1.4 + (Math.random() - 0.5) * 0.5,
          elev + 0.85,
          c.y + fwdZ * 1.4 + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 1.6,
          2.8 + Math.random() * 1.8,
          (Math.random() - 0.5) * 1.6,
          0.75,
          c.wrecked ? 0.9 : 0.55,
          dark,
          dark,
          dark,
        );
        if (c.wrecked || c.health < 30) {
          this.spawnParticle(
            c.x + fwdX * 1.3,
            elev + 0.65,
            c.y + fwdZ * 1.3,
            (Math.random() - 0.5) * 7,
            3 + Math.random() * 4,
            (Math.random() - 0.5) * 7,
            0.35,
            0.35,
            1.0,
            0.55,
            0.12,
          );
        }
      }

      if (c.boosting && Math.random() < 0.65) {
        this.spawnParticle(
          c.x - fwdX * 2.25 + (Math.random() - 0.5) * 0.4,
          elev + 0.35,
          c.y - fwdZ * 2.25 + (Math.random() - 0.5) * 0.4,
          -fwdX * 6 + (Math.random() - 0.5) * 2,
          0.8,
          -fwdZ * 6 + (Math.random() - 0.5) * 2,
          0.24,
          0.45,
          c.crownActive ? 1.0 : 0.1,
          c.crownActive ? 0.82 : 0.9,
          c.crownActive ? 0.2 : 1.0,
        );
      }

      if (Math.abs(c.speed) > 26 && Math.random() < 0.14) {
        const wheelSide = Math.random() < 0.5 ? -0.94 : 0.94;
        this.spawnParticle(
          c.x - fwdX * 1.45 + rightX * wheelSide,
          elev + 0.16,
          c.y - fwdZ * 1.45 + rightZ * wheelSide,
          -fwdX * 3.5 + (Math.random() - 0.5) * 1.1,
          1.4 + Math.random() * 0.9,
          -fwdZ * 3.5 + (Math.random() - 0.5) * 1.1,
          0.22,
          0.28,
          0.62,
          0.74,
          0.86,
        );
      }

      if (c.isPlayer && this.playerPointLight) {
        this.playerPointLight.position.set(c.x + fwdX * 2.4, elev + 1.4, c.y + fwdZ * 2.4);
        this.playerPointLight.color.set(c.crownActive ? '#facc15' : c.color);
      }
    }
  }

  /** Shapes for the item pads, one per item, made the first time a pad shows it. */
  private itemGeometries = new Map<number, THREE.BufferGeometry>();

  /**
   * Each item pad: a glowing ring on the road and a faint beam in the item's colour, with the
   * item's own shape spinning over it. An empty pad keeps a dim ring until it refills.
   */
  private syncItemBoxes(frame: RaceFrame, dt: number): void {
    // A pad that now gives a different item has a new id: take the old one away.
    const live = new Set(frame.itemBoxes.map((box) => box.id));
    for (const [id, pad] of this.itemBoxMeshes) {
      if (!live.has(id)) {
        this.scene.remove(pad);
        this.itemBoxMeshes.delete(id);
      }
    }
    for (const box of frame.itemBoxes) {
      let pad = this.itemBoxMeshes.get(box.id);
      if (!pad) {
        pad = this.buildItemPad(box.item ?? 0, box.color ?? '#ffffff', box.radius ?? 3, box.image);
        pad.position.set(box.x, this.getElevationAt(box.x, box.y), box.y);
        this.scene.add(pad);
        this.itemBoxMeshes.set(box.id, pad);
      }
      const [ring, beam, floater] = pad.children as [THREE.Mesh, THREE.Mesh, THREE.Object3D];
      (ring.material as THREE.MeshBasicMaterial).opacity = box.active ? 0.75 : 0.18;
      beam.visible = box.active;
      floater.visible = box.active;
      if (box.active) {
        if (!(floater instanceof THREE.Sprite)) floater.rotation.y += dt * 1.9;
        floater.position.y = (floater instanceof THREE.Sprite ? 2.6 : 1.7) + Math.sin(this.animTime * 3.2 + box.x) * 0.22;
      }
    }
  }

  /** The item pictures, loaded once each. */
  private itemPictures = new Map<string, THREE.Texture>();

  private itemPicture(url: string): THREE.Texture {
    let texture = this.itemPictures.get(url);
    if (!texture) {
      texture = this.trackTex(new THREE.TextureLoader().load(url));
      texture.colorSpace = THREE.SRGBColorSpace;
      this.itemPictures.set(url, texture);
    }
    return texture;
  }

  private buildItemPad(item: number, color: string, radius: number, image?: string): THREE.Group {
    const pad = new THREE.Group();
    const tint = new THREE.Color(color);

    const ringGeo = this.trackGeo(new THREE.RingGeometry(radius * 0.72, radius, 40));
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(
      ringGeo,
      this.trackMat(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
    );
    ring.position.y = 0.05;

    const beamGeo = this.trackGeo(new THREE.CylinderGeometry(0.55, 0.9, 7, 16, 1, true));
    beamGeo.translate(0, 3.5, 0);
    const beam = new THREE.Mesh(
      beamGeo,
      this.trackMat(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })),
    );

    let floater: THREE.Object3D;
    if (image) {
      // The item's own picture, always facing you. Added light, so its black background drops away.
      floater = new THREE.Sprite(
        this.trackMat(new THREE.SpriteMaterial({ map: this.itemPicture(image), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })),
      );
      floater.scale.setScalar(4.8);
    } else {
      let shape = this.itemGeometries.get(item);
      if (!shape) {
        shape = this.trackGeo(itemShape(item));
        this.itemGeometries.set(item, shape);
      }
      floater = new THREE.Mesh(
        shape,
        this.trackMat(new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.9, metalness: 0.35, roughness: 0.3, side: THREE.DoubleSide })),
      );
      floater.scale.setScalar(1.35);
      floater.castShadow = true;
    }

    pad.add(ring, beam, floater);
    return pad;
  }

  private syncHazards(frame: RaceFrame): void {
    const activeIds = new Set(frame.hazards.map((h) => h.id));
    for (const [id, obj] of this.hazardMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(obj);
        this.hazardMeshes.delete(id);
      }
    }

    for (const h of frame.hazards) {
      if (this.hazardMeshes.has(h.id)) continue;
      const elev = this.getElevationAt(h.x, h.y);
      if (h.type === 'slick') {
        const geo = this.trackGeo(new THREE.PlaneGeometry(h.size ?? 3.8, h.size ?? 3.8));
        geo.rotateX(-Math.PI / 2);
        const mat = this.trackMat(
          new THREE.MeshPhysicalMaterial({
            map: this.slickTex,
            transparent: true,
            roughness: 0.05,
            metalness: 0.35,
            clearcoat: 1.0,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        const m = new THREE.Mesh(geo, mat);
        m.position.set(h.x, elev + 0.035, h.y);
        this.scene.add(m);
        this.hazardMeshes.set(h.id, m);
      } else if (this.barricadeTemplate) {
        const m = this.barricadeTemplate.clone();
        m.position.set(h.x, elev, h.y);
        m.rotation.y = -h.angle;
        this.scene.add(m);
        this.hazardMeshes.set(h.id, m);
      }
    }
  }

  private processEvents(frame: RaceFrame, dt: number): void {
    if (this.joltRingTimer > 0 && this.joltRingMesh) {
      this.joltRingTimer -= dt;
      const progress = 1 - Math.max(0, this.joltRingTimer) / 0.45;
      const sc = 1 + progress * 16;
      this.joltRingMesh.scale.set(sc, sc, sc);
      (this.joltRingMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress);
      if (this.joltRingTimer <= 0) {
        this.joltRingMesh.visible = false;
      }
    }

    if (!frame.events) return;
    for (const ev of frame.events) {
      const elev = this.getElevationAt(ev.x, ev.y);
      if (ev.type === 'collision' || ev.type === 'wreck') {
        const count = ev.type === 'wreck' ? 24 : 12;
        for (let i = 0; i < count; i++) {
          this.spawnParticle(
            ev.x,
            elev + 0.65,
            ev.y,
            (Math.random() - 0.5) * 14,
            3 + Math.random() * 6,
            (Math.random() - 0.5) * 14,
            0.42,
            0.4,
            1.0,
            0.65,
            0.15,
          );
        }
        const player = frame.cars.find((c) => c.isPlayer);
        if (player && Math.hypot(player.x - ev.x, player.y - ev.y) < 12) {
          this.camTrauma = Math.min(1, this.camTrauma + (ev.intensity ?? 0.5) * 0.55);
        }
      } else if (ev.type === 'jolt' && this.joltRingMesh) {
        this.joltRingMesh.position.set(ev.x, elev + 0.35, ev.y);
        this.joltRingMesh.scale.set(1, 1, 1);
        this.joltRingMesh.visible = true;
        this.joltRingTimer = 0.45;
      }
    }
  }

  private updateCamera(frame: RaceFrame, dt: number): void {
    const player = frame.cars.find((c) => c.isPlayer) ?? frame.cars[0];
    if (!player) return;

    const elev = this.getElevationAt(player.x, player.y);
    const fwdX = Math.cos(player.angle);
    const fwdZ = Math.sin(player.angle);

    // Move directional key light shadow frustum with player
    if (this.keyLight) {
      this.keyLight.position.set(player.x + 48, elev + 76, player.y + 42);
      this.keyLight.target.position.set(player.x, elev, player.y);
    }

    if (this.cameraMode === 'topdown') {
      _v3A.set(player.x - fwdX * 6, elev + 38, player.y - fwdZ * 6);
      _v3B.set(player.x + fwdX * 8, elev, player.y + fwdZ * 8);
    } else {
      // Lower, tighter Asphalt-style chase framing
      // A tall phone screen sees less across, so the camera sits further back and higher.
      const portrait = this.camera.aspect < 1;
      const distBack = (portrait ? 9.5 : 6.3) * this.carScale + (player.boosting ? 0.55 : 0);
      const heightUp = (portrait ? 3.3 : 2.35) * this.carScale;
      _v3A.set(player.x - fwdX * distBack, elev + heightUp, player.y - fwdZ * distBack);
      _v3B.set(player.x + fwdX * 10.5, elev + 0.95, player.y + fwdZ * 10.5);
    }

    if (!this.camInitialized) {
      this.camPos.copy(_v3A);
      this.camLook.copy(_v3B);
      this.camInitialized = true;
    } else {
      const posLambda = this.cameraMode === 'topdown' ? 9 : 13;
      const lookLambda = 16;
      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, _v3A.x, posLambda, dt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, _v3A.y, posLambda, dt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, _v3A.z, posLambda, dt);

      this.camLook.x = THREE.MathUtils.damp(this.camLook.x, _v3B.x, lookLambda, dt);
      this.camLook.y = THREE.MathUtils.damp(this.camLook.y, _v3B.y, lookLambda, dt);
      this.camLook.z = THREE.MathUtils.damp(this.camLook.z, _v3B.z, lookLambda, dt);
    }

    // On a bend the spot behind the car is past the wall, among the cranes and buildings: from inside
    // one it sees only the prop. Keep the camera inside the walls, pulled in along the line to the car.
    let camX = this.camPos.x;
    let camZ = this.camPos.z;
    if (this.cameraMode !== 'topdown') {
      const keep = insideWallsFraction(this.sampled, player.x, player.y, camX, camZ, this.sampled.wallDistance - 0.5);
      camX = player.x + (camX - player.x) * keep;
      camZ = player.y + (camZ - player.y) * keep;
    }

    // Apply trauma shake
    this.camTrauma = Math.max(0, this.camTrauma - dt * 1.9);
    const shake = this.camTrauma * this.camTrauma * 0.45;
    this.camera.position.set(
      camX + (Math.random() - 0.5) * shake,
      this.camPos.y + (Math.random() - 0.5) * shake,
      camZ + (Math.random() - 0.5) * shake,
    );
    this.camera.lookAt(this.camLook);

    // Dynamic FOV widening with speed / boost
    const speedRatio = Math.min(1, Math.max(0, player.speed) / 55);
    const targetFov =
      this.cameraMode === 'topdown'
        ? 52
        : (this.camera.aspect < 1 ? 70 : 58) + speedRatio * 11 + (player.boosting ? 7 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    }

    // Peripheral camera-space speed streaks at high velocity / boost
    if (this.speedLines && this.speedLinesMat) {
      const streakActive =
        this.cameraMode === 'chase' &&
        (player.speed > 42 || Boolean(player.boosting && player.speed > 30));
      this.speedLines.visible = streakActive;
      if (streakActive) {
        const intensity = player.boosting ? 0.26 : Math.min(0.18, (player.speed - 42) / 55);
        this.speedLinesMat.opacity = intensity;
        this.speedLinesMat.color.setHex(player.crownActive ? 0xfde047 : 0xa5f3fc);
        this.speedLines.position.z = ((this.animTime * 18) % 2.4);
      }
    }
  }

  private renderFrame(): void {
    if (this.composer && !this.isSoftwareGl && this.quality !== 'low') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * The whole track straight from above, without cars, items or fog, as a picture for a minimap.
   * Drawn once into a corner of the screen and copied out at once; the next frame draws over it.
   * `x`, `y` and `span` say which square of the world, in metres, the picture shows.
   */
  public overheadPicture(maxSize = 360): { picture: HTMLCanvasElement; x: number; y: number; span: number } | null {
    if (!this.ready || this.disposed) return null;
    const canvas = this.renderer.domElement;
    const ratio = this.renderer.getPixelRatio();
    const size = Math.floor(Math.min(maxSize, canvas.width / ratio, canvas.height / ratio));
    if (size < 32) return null;

    const b = this.sampled.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) + (this.sampled.wallDistance + 8) * 2;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minY + b.maxY) / 2;
    const camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 1, 2000);
    camera.position.set(cx, 900, cz);
    // Up on the picture is -Z, so x runs right and y runs down, as on a 2D map.
    camera.up.set(0, 0, -1);
    camera.lookAt(cx, 0, cz);

    const hidden: THREE.Object3D[] = [
      ...[...this.cars.values()].map((car) => car.root),
      ...this.itemBoxMeshes.values(),
      ...this.hazardMeshes.values(),
      this.particleMesh,
    ].filter((o) => o && o.visible);
    hidden.forEach((o) => (o.visible = false));
    const fog = this.scene.fog;
    this.scene.fog = null;

    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, size, size);
    this.renderer.setScissor(0, 0, size, size);
    this.renderer.render(this.scene, camera);
    const picture = document.createElement('canvas');
    picture.width = Math.round(size * ratio);
    picture.height = Math.round(size * ratio);
    const ctx = picture.getContext('2d');
    // A night scene from high up is dark: lift it so the road reads at a glance.
    if (ctx) {
      ctx.filter = 'brightness(1.7) saturate(1.15)';
      ctx.drawImage(canvas, 0, canvas.height - picture.height, picture.width, picture.height, 0, 0, picture.width, picture.height);
    }

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvas.width / ratio, canvas.height / ratio);
    this.scene.fog = fog;
    hidden.forEach((o) => (o.visible = true));
    return ctx ? { picture, x: cx - span / 2, y: cz - span / 2, span } : null;
  }

  public getWebGLContext(): WebGL2RenderingContext | WebGLRenderingContext {
    return this.renderer.getContext();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.disposeComposer();

    if (this.reflector) {
      this.reflector.dispose();
      this.reflector = null;
    }

    // Dispose every geometry, material & texture in scene + tracked sets
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Sprite).isSprite) {
        const m = obj as THREE.Mesh;
        if (m.geometry) this.trackedGeometries.add(m.geometry);
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            this.trackedMaterials.add(mat);
          }
        }
      }
    });

    const texKeys = [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'emissiveMap',
      'bumpMap',
      'aoMap',
      'alphaMap',
      'envMap',
    ] as const;

    for (const mat of this.trackedMaterials) {
      const anyMat = mat as unknown as Record<string, unknown>;
      for (const k of texKeys) {
        const tex = anyMat[k];
        if (tex && tex instanceof THREE.Texture) {
          this.trackedTextures.add(tex);
        }
      }
      mat.dispose();
    }
    this.trackedMaterials.clear();

    for (const geo of this.trackedGeometries) {
      geo.dispose();
    }
    this.trackedGeometries.clear();

    for (const tex of this.trackedTextures) {
      tex.dispose();
    }
    this.trackedTextures.clear();

    this.cars.clear();
    this.itemBoxMeshes.clear();
    this.hazardMeshes.clear();
    this.boostPadMeshes = [];

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
