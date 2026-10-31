/**
 * Procedural canvas textures for the 3D sports car studio.
 * Zero external image dependencies.
 */
import * as THREE from 'three';

/**
 * Procedural tire tread texture (bump / roughness)
 * Features sports asymmetric tread with deep longitudinal evacuation channels and angled lateral sipes.
 */
export function createTireTreadTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Base dark rubber with micro grain
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, size, size);

    // Subtle grain noise
    const imgData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + n));
      imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + n));
      imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Deep longitudinal grooves (4 main channels across tire width)
    ctx.fillStyle = '#050505';
    const grooveX = [size * 0.2, size * 0.4, size * 0.6, size * 0.8];
    const grooveWidth = size * 0.055;
    for (const x of grooveX) {
      ctx.fillRect(x - grooveWidth / 2, 0, grooveWidth, size);
      // Groove edge bevels
      ctx.fillStyle = '#141414';
      ctx.fillRect(x - grooveWidth / 2 - 2, 0, 2, size);
      ctx.fillRect(x + grooveWidth / 2, 0, 2, size);
      ctx.fillStyle = '#050505';
    }

    // Angled lateral sipes repeating along circumference (Y-axis)
    ctx.strokeStyle = '#080808';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const sipeSpacing = 28;
    for (let y = -30; y < size + 30; y += sipeSpacing) {
      // Left shoulder blocks
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(grooveX[0] - grooveWidth / 2, y + 14);
      ctx.stroke();

      // Center ribs sipes (chevron angle)
      ctx.beginPath();
      ctx.moveTo(grooveX[0] + grooveWidth / 2, y + 8);
      ctx.lineTo(grooveX[1] - grooveWidth / 2, y + 18);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(grooveX[1] + grooveWidth / 2, y + 16);
      ctx.lineTo(grooveX[2] - grooveWidth / 2, y + 6);
      ctx.stroke();

      // Right shoulder blocks
      ctx.beginPath();
      ctx.moveTo(grooveX[3] + grooveWidth / 2, y + 12);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 10);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Procedural carbon fiber texture (2x2 twill weave pattern)
 */
export function createCarbonFiberTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, size, size);

    const step = 8;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const isStripe = ((x / step + y / step) % 4 < 2);
        const grad = ctx.createLinearGradient(x, y, x + step, y + step);
        if (isStripe) {
          grad.addColorStop(0, '#222222');
          grad.addColorStop(0.5, '#383838');
          grad.addColorStop(1, '#181818');
        } else {
          grad.addColorStop(0, '#101010');
          grad.addColorStop(0.5, '#202020');
          grad.addColorStop(1, '#080808');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, step, step);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Procedural carbon-ceramic / vented brake disc texture
 * Concentric friction grooves with cross-drilled cooling holes.
 */
export function createBrakeDiscTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.46;
    const innerR = size * 0.22;

    // Dark titanium / carbon-ceramic base
    ctx.fillStyle = '#3a3d40';
    ctx.fillRect(0, 0, size, size);

    // Circular brushed friction track
    const radGrad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    radGrad.addColorStop(0, '#424548');
    radGrad.addColorStop(0.5, '#6a6e72');
    radGrad.addColorStop(0.85, '#5c6064');
    radGrad.addColorStop(1, '#35373a');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fill();

    // Fine concentric circular scoring lines (machining grooves)
    for (let r = innerR + 4; r < outerR - 4; r += 2.5) {
      const alpha = 0.08 + Math.random() * 0.15;
      const light = Math.random() > 0.5;
      ctx.strokeStyle = light ? `rgba(230, 235, 240, ${alpha})` : `rgba(20, 22, 25, ${alpha})`;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cross-drilled cooling holes in curved radial spiral arcs
    const numArms = 18;
    const holesPerArm = 5;
    for (let arm = 0; arm < numArms; arm++) {
      const baseAngle = (arm / numArms) * Math.PI * 2;
      for (let h = 0; h < holesPerArm; h++) {
        const t = (h + 0.6) / (holesPerArm + 0.2);
        const r = innerR + t * (outerR - innerR);
        // Curved spiral curve
        const angle = baseAngle + t * 0.45;
        const hx = cx + Math.cos(angle) * r;
        const hy = cy + Math.sin(angle) * r;

        // Hole drop shadow & bevel
        ctx.fillStyle = '#08090a';
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#858b90';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Inner hub hat section (matte dark metal)
    ctx.fillStyle = '#1c1e20';
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2d30';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Procedural wet dark asphalt texture for turntable ground
 * Produces deep glossy puddles reflecting city/neon lights with textured asphalt grain.
 */
export function createWetAsphaltTexture(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 1024;

  // 1. Color Map
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d');

  // 2. Roughness Map (puddles = very dark ~0.08, rough dry asphalt = lighter ~0.75)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d');

  if (cctx && rctx) {
    // Base asphalt dark tones
    cctx.fillStyle = '#0a0b0d';
    cctx.fillRect(0, 0, size, size);

    rctx.fillStyle = '#7a7e85'; // Base roughness for wet aggregate
    rctx.fillRect(0, 0, size, size);

    // Fine asphalt aggregate specks
    const cData = cctx.getImageData(0, 0, size, size);
    const rData = rctx.getImageData(0, 0, size, size);

    for (let i = 0; i < cData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 32;
      const v = Math.min(255, Math.max(0, 14 + noise));
      cData.data[i] = v;
      cData.data[i + 1] = v * 1.05;
      cData.data[i + 2] = v * 1.12;

      // Roughness variation with grain
      rData.data[i] = Math.min(255, Math.max(0, 130 + noise * 1.5));
      rData.data[i + 1] = rData.data[i];
      rData.data[i + 2] = rData.data[i];
    }
    cctx.putImageData(cData, 0, 0);
    rctx.putImageData(rData, 0, 0);

    // Smooth reflective water puddle pools
    const puddles = [
      { x: size * 0.35, y: size * 0.45, rx: 220, ry: 150, rot: 0.3 },
      { x: size * 0.72, y: size * 0.65, rx: 180, ry: 120, rot: -0.4 },
      { x: size * 0.5, y: size * 0.8, rx: 260, ry: 160, rot: 0.1 },
      { x: size * 0.2, y: size * 0.75, rx: 140, ry: 90, rot: 0.5 },
      { x: size * 0.8, y: size * 0.25, rx: 190, ry: 110, rot: -0.2 },
    ];

    for (const p of puddles) {
      // Color map: puddles are deeper and darker
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rot);
      const cGrad = cctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(p.rx, p.ry));
      cGrad.addColorStop(0, '#040507');
      cGrad.addColorStop(0.7, '#07080a');
      cGrad.addColorStop(1, 'rgba(10, 11, 13, 0)');
      cctx.fillStyle = cGrad;
      cctx.beginPath();
      cctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
      cctx.fill();
      cctx.restore();

      // Roughness map: puddles are ultra-smooth mirror surfaces (~0.04 to 0.15)
      rctx.save();
      rctx.translate(p.x, p.y);
      rctx.rotate(p.rot);
      const rGrad = rctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(p.rx, p.ry));
      rGrad.addColorStop(0, '#101010'); // mirror puddle
      rGrad.addColorStop(0.65, '#222222');
      rGrad.addColorStop(0.9, '#60646c');
      rGrad.addColorStop(1, 'rgba(122, 126, 133, 0)');
      rctx.fillStyle = rGrad;
      rctx.beginPath();
      rctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
      rctx.fill();
      rctx.restore();
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(6, 6);
  roughnessMap.anisotropy = 8;

  return { map, roughnessMap };
}

/**
 * Procedural hexagonal grille mesh texture for aerodynamic intakes
 */
export function createGrilleTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2.5;

    const r = 12;
    const h = r * Math.sqrt(3);
    for (let y = -h; y < size + h; y += h) {
      for (let x = -r * 3; x < size + r * 3; x += r * 3) {
        drawHex(ctx, x, y, r);
        drawHex(ctx, x + r * 1.5, y + h / 2, r);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 4);
  texture.anisotropy = 8;
  return texture;
}

function drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}
