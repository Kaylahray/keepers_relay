import * as THREE from 'three';
import type { TrackTheme } from './types';

const harbourAsphaltUrl = '/nightline/textures/harbour-asphalt.jpg';
const mountainTarmacUrl = '/nightline/textures/mountain-tarmac.jpg';
const oldtownCobbleUrl = '/nightline/textures/oldtown-cobble.jpg';
const stoneFacadeUrl = '/nightline/textures/stone-facade.jpg';

export interface DerivedPbrMaps {
  map: THREE.Texture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy);
  const b = hash2d(ix + 1, iy);
  const c = hash2d(ix, iy + 1);
  const d = hash2d(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Computes a tangent-space normal map and wet-puddle roughness map from a loaded
 * albedo image using a Sobel filter + multi-octave puddle mask.
 */
export function deriveNormalAndRoughnessFromImage(
  image: HTMLImageElement | HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  wetnessStrength: number,
  normalStrength = 2.4,
): { normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture } {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size).data;

  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    height[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  const normalData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  const sampleH = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = tr + 2 * r + br - (tl + 2 * l + bl);
      const dY = bl + 2 * b + br - (tl + 2 * t + tr);

      // Puddle smooths out fine grain in low spots
      const n1 = valueNoise((x / size) * 5.0, (y / size) * 5.0);
      const n2 = valueNoise((x / size) * 11.0 + 3.1, (y / size) * 11.0 + 7.4);
      const puddleMask = Math.max(0, Math.min(1, (n1 * 0.7 + n2 * 0.3 - (0.56 - wetnessStrength * 0.25)) * 4.5));

      const scale = normalStrength * (1 - puddleMask * 0.82);
      let nx = -dX * scale;
      let ny = -dY * scale;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      normalData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;

      // Wet puddles are glossy (0.07), damp stones/asphalt around 0.42..0.68
      const baseRough = 0.48 + (1 - height[y * size + x]) * 0.24 - wetnessStrength * 0.14;
      const rough = Math.max(0.06, Math.min(0.9, baseRough * (1 - puddleMask) + 0.06 * puddleMask));
      const roughByte = Math.round(rough * 255);
      roughData[idx] = roughByte;
      roughData[idx + 1] = roughByte;
      roughData[idx + 2] = roughByte;
      roughData[idx + 3] = 255;
    }
  }

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeatX, repeatY);
  normalMap.anisotropy = anisotropy;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatX, repeatY);
  roughnessMap.anisotropy = anisotropy;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

export function getTrackAlbedoUrl(theme: TrackTheme): string {
  if (theme === 'harbour') return harbourAsphaltUrl;
  if (theme === 'switchback') return mountainTarmacUrl;
  return oldtownCobbleUrl;
}

export function getStoneFacadeUrl(): string {
  return stoneFacadeUrl;
}

/**
 * Generates an equirectangular HDRI-style sky dome texture tailored to each track.
 */
export function createEquirectSkyTexture(theme: TrackTheme): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (theme === 'harbour') {
    grad.addColorStop(0.0, '#020612');
    grad.addColorStop(0.32, '#071728');
    grad.addColorStop(0.47, '#0d3448');
    grad.addColorStop(0.52, '#174f63');
    grad.addColorStop(0.58, '#081b29');
    grad.addColorStop(1.0, '#02050b');
  } else if (theme === 'switchback') {
    grad.addColorStop(0.0, '#070818');
    grad.addColorStop(0.28, '#1a1536');
    grad.addColorStop(0.44, '#4c2356');
    grad.addColorStop(0.51, '#9d4467');
    grad.addColorStop(0.57, '#2a1632');
    grad.addColorStop(1.0, '#090710');
  } else {
    grad.addColorStop(0.0, '#03050c');
    grad.addColorStop(0.35, '#0b1222');
    grad.addColorStop(0.48, '#1b263b');
    grad.addColorStop(0.53, '#382a1e');
    grad.addColorStop(0.62, '#10141c');
    grad.addColorStop(1.0, '#040508');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizon neon / dusk atmospheric glow spots
  if (theme === 'harbour') {
    const spots = [
      { x: 0.18, c: 'rgba(255, 46, 147, 0.25)' },
      { x: 0.48, c: 'rgba(0, 229, 255, 0.28)' },
      { x: 0.78, c: 'rgba(163, 255, 18, 0.18)' },
    ];
    for (const sp of spots) {
      const rg = ctx.createRadialGradient(sp.x * w, h * 0.5, 4, sp.x * w, h * 0.5, 160);
      rg.addColorStop(0, sp.c);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, h * 0.3, w, h * 0.4);
    }
  } else if (theme === 'switchback') {
    // Layered mountain silhouettes right along the horizon line
    const layers = [
      { baseY: h * 0.51, amp: 52, freq: 0.009, color: '#241432' },
      { baseY: h * 0.525, amp: 34, freq: 0.017, color: '#170d24' },
    ];
    for (const layer of layers) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const ridge =
          Math.sin(x * layer.freq) * layer.amp * 0.6 +
          Math.cos(x * layer.freq * 2.3 + 1.1) * layer.amp * 0.3 +
          Math.sin(x * layer.freq * 4.7) * layer.amp * 0.1;
        ctx.lineTo(x, layer.baseY - Math.abs(ridge));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
    }
  }

  // Stars in upper hemisphere
  for (let i = 0; i < 160; i++) {
    const sx = hash2d(i, 1.3) * w;
    const sy = hash2d(i, 9.7) * h * 0.42;
    const alpha = 0.2 + hash2d(i, 4.1) * 0.6;
    ctx.fillStyle = `rgba(220, 235, 255, ${alpha.toFixed(2)})`;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createLightPoolTexture(colorHex: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = new THREE.Color(colorHex);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);

  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.52)`);
  grad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, 0.22)`);
  grad.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, 0.05)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNeonSignTexture(label: string, primaryHex: string, secondaryHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, 512, 192);

  ctx.strokeStyle = secondaryHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 488, 168);

  ctx.shadowColor = primaryHex;
  ctx.shadowBlur = 18;
  ctx.fillStyle = primaryHex;
  ctx.font = 'bold 68px Oxanium, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 98);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkylineWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#050a14';
  ctx.fillRect(0, 0, 256, 512);

  // Subtle architectural glass floor bands + cohesive teal/cyan/pink/amber lit offices
  for (let row = 12; row < 498; row += 16) {
    ctx.fillStyle = 'rgba(14, 42, 68, 0.38)';
    ctx.fillRect(4, row, 248, 10);
    const floorLit = hash2d(row, 11.7) > 0.22;
    for (let col = 10; col < 242; col += 18) {
      const r = hash2d(col, row);
      if (floorLit && r > 0.45) {
        const tintIdx = Math.floor(hash2d(row * 0.3, col * 0.7) * 12);
        const cols = ['#0ea5e9', '#22d3ee', '#38bdf8', '#7dd3fc', '#ff2e93', '#a3ff12'];
        ctx.fillStyle = tintIdx < 9 ? cols[tintIdx % 4] : cols[4 + (tintIdx % 2)];
        ctx.globalAlpha = 0.35 + hash2d(col * 2, row) * 0.55;
        ctx.fillRect(col, row + 1, 13, 8);
      }
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createTownhouseWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#ffcf7d');
  grad.addColorStop(0.55, '#e8983e');
  grad.addColorStop(1, '#7c3f18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Subtle curtain & dark wooden cross-mullions
  ctx.fillStyle = 'rgba(30, 18, 10, 0.65)';
  ctx.fillRect(60, 0, 8, 128);
  ctx.fillRect(0, 60, 128, 8);
  ctx.strokeStyle = 'rgba(20, 12, 8, 0.85)';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createChevronSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 256, 192);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 176);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ox of [78, 162]) {
    ctx.beginPath();
    ctx.moveTo(ox - 28, 38);
    ctx.lineTo(ox + 22, 96);
    ctx.lineTo(ox - 28, 154);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createQuayHazardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a2332';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#eab308';
  for (let x = -64; x < 320; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 28, 64);
    ctx.lineTo(x + 60, 0);
    ctx.lineTo(x + 32, 0);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createBoostPadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(4, 14, 24, 0.85)';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 240);

  // Chevrons pointing +X (right in UV space)
  for (let i = 0; i < 3; i++) {
    const cx = 56 + i * 64;
    ctx.beginPath();
    ctx.moveTo(cx - 24, 52);
    ctx.lineTo(cx + 28, 128);
    ctx.lineTo(cx - 24, 204);
    ctx.strokeStyle = i === 2 ? '#a3ff12' : '#00e5ff';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createOilSlickTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 58);
  grad.addColorStop(0, 'rgba(10, 10, 16, 0.95)');
  grad.addColorStop(0.55, 'rgba(32, 18, 48, 0.85)');
  grad.addColorStop(0.82, 'rgba(12, 42, 46, 0.6)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNameplateTexture(name: string, colorHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(7, 11, 18, 0.82)';
  ctx.beginPath();
  ctx.roundRect(14, 10, 228, 44, 8);
  ctx.fill();

  ctx.fillStyle = colorHex;
  ctx.fillRect(14, 10, 8, 44);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 132, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStartFinishTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cols = 4;
  const rows = 16;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
