/**
 * Apex GT - Original High-Performance Sports Car 3D Rig
 * Built 100% in code with Three.js r170 procedural geometries & PBR materials.
 * 
 * Real-world scale (meters), Y-up, ground level at Y=0, car facing +Z.
 * Budget: < 30,000 triangles.
 */
import * as THREE from 'three';
import {
  createTireTreadTexture,
  createCarbonFiberTexture,
  createBrakeDiscTexture,
  createGrilleTexture,
} from '@/lib/game/apex/textures';
import {
  clampSteeringAngle,
  clampBodyRoll,
  calculateObjectTriangles,
  parseColor,
} from '@/lib/game/apex/car-rig-logic';

export interface CarRigOptions {
  paintColor?: string | number;
  accentColor?: string | number;
  headlightsOn?: boolean;
  taillightsOn?: boolean;
}

export interface WheelAssemblies {
  frontLeft: THREE.Group;
  frontRight: THREE.Group;
  rearLeft: THREE.Group;
  rearRight: THREE.Group;
}

export interface CarRigMaterials {
  paint: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  rims: THREE.MeshStandardMaterial;
  tires: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
  brakeDisc: THREE.MeshStandardMaterial;
  caliper: THREE.MeshStandardMaterial;
  headlightLens: THREE.MeshStandardMaterial;
  taillightLens: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
  exhaust: THREE.MeshStandardMaterial;
}

export interface CarRigLights {
  headlights: THREE.Mesh[];
  taillights: THREE.Mesh[];
  headlightMeshes: THREE.Mesh[];
  taillightMeshes: THREE.Mesh[];
  headlightPointLights: THREE.PointLight[];
  headlightSpotLights: THREE.SpotLight[];
  taillightPointLights: THREE.PointLight[];
}

export interface CarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  // Wheel groups as separate parts
  frontLeft: THREE.Group;
  frontRight: THREE.Group;
  rearLeft: THREE.Group;
  rearRight: THREE.Group;
  wheels: WheelAssemblies;
  // Lights
  headlightMeshes: THREE.Mesh[];
  taillightMeshes: THREE.Mesh[];
  lights: CarRigLights;
  // Materials
  materials: CarRigMaterials;
  paintMaterial: THREE.MeshPhysicalMaterial;
  accentMaterial: THREE.MeshStandardMaterial;
  glassMaterial: THREE.MeshPhysicalMaterial;
  rimMaterial: THREE.MeshStandardMaterial;
  tireMaterial: THREE.MeshStandardMaterial;
  // Control methods
  update: (params: {
    steeringAngle?: number;
    wheelSpin?: number;
    bodyRoll?: number;
  }) => void;
  setPaintColor: (color: string | number) => void;
  setAccentColor: (color: string | number) => void;
  setHeadlights: (on: boolean) => void;
  getTriangleCount: () => number;
  dispose: () => void;
}

/**
 * Procedurally generates an ultra-smooth, continuous aerodynamic sports car monocoque
 * using cross-sectional curve rings along the vehicle's length (Z-axis).
 */
function createAerodynamicCarBodyGeometry(): THREE.BufferGeometry {
  // Cross-sections along Z (front to rear)
  // Each profile defines symmetric half-rings from center top (X=0) down to the sill/undertray (Y=bottom)
  // [z, [ [x, y], [x, y], ... ]] from center-top to side-bottom
  const crossSections = [
    // 0. Front Splitter tip (low sharp nose)
    {
      z: 2.30,
      pts: [
        [0.00, 0.28],
        [0.28, 0.27],
        [0.55, 0.25],
        [0.78, 0.22],
        [0.86, 0.16],
        [0.88, 0.10],
      ]
    },
    // 1. Nose cone & lower fascia
    {
      z: 2.12,
      pts: [
        [0.00, 0.44],
        [0.32, 0.42],
        [0.62, 0.38],
        [0.84, 0.30],
        [0.90, 0.20],
        [0.91, 0.10],
      ]
    },
    // 2. Headlights & Hood onset
    {
      z: 1.80,
      pts: [
        [0.00, 0.54],
        [0.34, 0.53],
        [0.66, 0.52],
        [0.88, 0.46],
        [0.94, 0.28],
        [0.93, 0.10],
      ]
    },
    // 3. Front Wheel Arch Peak (wide front haunches)
    {
      z: 1.30,
      pts: [
        [0.00, 0.60],
        [0.36, 0.59],
        [0.68, 0.62],
        [0.96, 0.64],
        [0.98, 0.38],
        [0.92, 0.10],
      ]
    },
    // 4. Base of Windshield / Cowl
    {
      z: 0.75,
      pts: [
        [0.00, 0.68],
        [0.38, 0.67],
        [0.68, 0.66],
        [0.88, 0.58],
        [0.94, 0.34],
        [0.92, 0.10],
      ]
    },
    // 5. Raked Windshield midpoint & Cockpit
    {
      z: 0.25,
      pts: [
        [0.00, 0.98],
        [0.35, 0.96],
        [0.62, 0.88],
        [0.86, 0.58],
        [0.92, 0.34],
        [0.91, 0.10],
      ]
    },
    // 6. Roof Apex (low, sleek roof peak at 1.15m)
    {
      z: -0.22,
      pts: [
        [0.00, 1.15],
        [0.32, 1.14],
        [0.56, 1.05],
        [0.84, 0.58],
        [0.91, 0.34],
        [0.90, 0.10],
      ]
    },
    // 7. Mid-Roof to Fastback transition
    {
      z: -0.65,
      pts: [
        [0.00, 1.12],
        [0.32, 1.11],
        [0.58, 1.02],
        [0.85, 0.58],
        [0.92, 0.34],
        [0.91, 0.10],
      ]
    },
    // 8. Fastback Rear Window slope
    {
      z: -1.05,
      pts: [
        [0.00, 0.96],
        [0.34, 0.95],
        [0.62, 0.88],
        [0.88, 0.62],
        [0.95, 0.36],
        [0.93, 0.10],
      ]
    },
    // 9. Rear Wheel Arch Peak (aggressive muscular wide hips)
    {
      z: -1.35,
      pts: [
        [0.00, 0.82],
        [0.35, 0.81],
        [0.68, 0.80],
        [0.98, 0.76],
        [1.00, 0.40],
        [0.94, 0.10],
      ]
    },
    // 10. Rear Deck & Engine Louvers
    {
      z: -1.75,
      pts: [
        [0.00, 0.74],
        [0.34, 0.73],
        [0.66, 0.72],
        [0.94, 0.68],
        [0.97, 0.36],
        [0.92, 0.10],
      ]
    },
    // 11. Rear Fascia / Cyber Taillight Line
    {
      z: -2.10,
      pts: [
        [0.00, 0.66],
        [0.32, 0.65],
        [0.62, 0.64],
        [0.88, 0.60],
        [0.92, 0.34],
        [0.88, 0.12],
      ]
    },
    // 12. Rear Diffuser / Bottom Exit
    {
      z: -2.28,
      pts: [
        [0.00, 0.42],
        [0.28, 0.41],
        [0.55, 0.40],
        [0.78, 0.38],
        [0.84, 0.26],
        [0.82, 0.14],
      ]
    },
  ];

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const numZ = crossSections.length;
  const ptsPerSide = crossSections[0].pts.length;
  // Full ring: left side (from bottom to top) + right side (from top to bottom)
  // Left: x > 0, Right: x < 0
  const vertsPerRing = (ptsPerSide - 1) * 2 + 1; // e.g. 5*2 + 1 = 11 vertices

  for (let zi = 0; zi < numZ; zi++) {
    const section = crossSections[zi];
    const z = section.z;
    const v = zi / (numZ - 1);

    // Build vertices: Left side (bottom to center) then Right side (center to bottom)
    const ring: [number, number, number][] = [];

    // Left side from bottom up to center
    for (let pi = ptsPerSide - 1; pi >= 1; pi--) {
      const [x, y] = section.pts[pi];
      ring.push([x, y, z]);
    }
    // Center vertex (x = 0)
    ring.push([0, section.pts[0][1], z]);
    // Right side from center down to bottom
    for (let pi = 1; pi < ptsPerSide; pi++) {
      const [x, y] = section.pts[pi];
      ring.push([-x, y, z]);
    }

    for (let ri = 0; ri < ring.length; ri++) {
      positions.push(ring[ri][0], ring[ri][1], ring[ri][2]);
      const u = ri / (ring.length - 1);
      uvs.push(u, v);
    }
  }

  // Generate quad indices between consecutive rings
  for (let zi = 0; zi < numZ - 1; zi++) {
    const ringStartA = zi * vertsPerRing;
    const ringStartB = (zi + 1) * vertsPerRing;

    for (let ri = 0; ri < vertsPerRing - 1; ri++) {
      const a1 = ringStartA + ri;
      const a2 = ringStartA + ri + 1;
      const b1 = ringStartB + ri;
      const b2 = ringStartB + ri + 1;

      // Two triangles per quad with outward normals
      indices.push(a1, b1, a2);
      indices.push(a2, b1, b2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  return geom;
}

/**
 * Creates the complete procedural Car Rig.
 */
export function createCarRig(options: CarRigOptions = {}): CarRig {
  const initialPaintColor = options.paintColor ?? 0x08080a; // Deep glossy obsidian black
  const initialAccentColor = options.accentColor ?? 0x39ff14; // Lime green neon glow
  const initialHeadlightsOn = options.headlightsOn ?? true;

  // Root container (origin at ground level under car center)
  const root = new THREE.Group();
  root.name = 'CarRig_Root';

  // Body container (pivots above ground for realistic suspension roll)
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'CarRig_BodyGroup';
  // Position roll pivot at ~0.42m above ground (suspension roll center)
  bodyGroup.position.set(0, 0.42, 0);
  root.add(bodyGroup);

  // Sub-container for body meshes offset by roll center
  const bodyMeshGroup = new THREE.Group();
  bodyMeshGroup.position.set(0, -0.42, 0);
  bodyGroup.add(bodyMeshGroup);

  // Procedural textures
  const tireTreadTex = createTireTreadTexture();
  const carbonTex = createCarbonFiberTexture();
  const brakeDiscTex = createBrakeDiscTexture();
  const grilleTex = createGrilleTexture();

  // Materials initialization
  // 1. Paint: Glossy deep obsidian black with ultra-rich clearcoat
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: parseColor(initialPaintColor),
    metalness: 0.04,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 0.85,
  });

  // 2. Accent glow (lime-green neon)
  const accentColorObj = parseColor(initialAccentColor);
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColorObj,
    emissive: accentColorObj,
    emissiveIntensity: 2.5,
    roughness: 0.2,
    metalness: 0.1,
  });

  // 3. Tinted aerodynamic glass
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x081018,
    metalness: 0.9,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.82,
    depthWrite: true,
  });

  // 4. Wheels: Rims (forged dark alloy with machined face)
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x22262c,
    metalness: 0.94,
    roughness: 0.16,
  });

  // 5. Tires (semi-slick compound with procedural tread bump)
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x181819,
    metalness: 0.04,
    roughness: 0.85,
    bumpMap: tireTreadTex,
    bumpScale: 0.015,
  });

  // 6. Carbon fiber (diffuser, splitter, spoiler, mirror caps)
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x161719,
    metalness: 0.45,
    roughness: 0.32,
    map: carbonTex,
    bumpMap: carbonTex,
    bumpScale: 0.008,
  });

  // 7. Carbon-ceramic brake disc
  const brakeDiscMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: brakeDiscTex,
    metalness: 0.88,
    roughness: 0.22,
  });

  // 8. Performance brake caliper (anodized accent)
  const caliperMat = new THREE.MeshStandardMaterial({
    color: accentColorObj,
    metalness: 0.35,
    roughness: 0.25,
  });

  // 9. Headlight projector & DRL lens
  const headlightLensMat = new THREE.MeshStandardMaterial({
    color: 0xd8f5ff,
    emissive: 0x9be8ff,
    emissiveIntensity: initialHeadlightsOn ? 3.0 : 0.05,
    roughness: 0.1,
    metalness: 0.9,
  });

  // 10. Taillight cyber LED lens
  const taillightLensMat = new THREE.MeshStandardMaterial({
    color: 0xff1020,
    emissive: 0xff0515,
    emissiveIntensity: 2.8,
    roughness: 0.2,
    metalness: 0.3,
  });

  // 11. Cockpit interior
  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x111316,
    metalness: 0.2,
    roughness: 0.75,
  });

  // 12. Titanium exhaust tips
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x5a6370,
    metalness: 0.96,
    roughness: 0.15,
  });

  // 13. Front grille intake mesh
  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    map: grilleTex,
    metalness: 0.6,
    roughness: 0.5,
  });

  const materials: CarRigMaterials = {
    paint: paintMat,
    accent: accentMat,
    glass: glassMat,
    rims: rimMat,
    tires: tireMat,
    carbon: carbonMat,
    brakeDisc: brakeDiscMat,
    caliper: caliperMat,
    headlightLens: headlightLensMat,
    taillightLens: taillightLensMat,
    interior: interiorMat,
    exhaust: exhaustMat,
  };

  // -------------------------------------------------------------
  // 1. SCULPTED AERODYNAMIC BODYWORK (Main Monocoque)
  // -------------------------------------------------------------
  const bodyGeom = createAerodynamicCarBodyGeometry();
  const mainBodyMesh = new THREE.Mesh(bodyGeom, paintMat);
  mainBodyMesh.castShadow = true;
  mainBodyMesh.receiveShadow = true;
  bodyMeshGroup.add(mainBodyMesh);

  // Flat Undertray / Chassis bottom
  const floorGeom = new THREE.PlaneGeometry(1.82, 4.4, 2, 8);
  const floorMesh = new THREE.Mesh(floorGeom, carbonMat);
  floorMesh.rotation.x = Math.PI / 2;
  floorMesh.position.set(0, 0.10, 0.05);
  bodyMeshGroup.add(floorMesh);

  // -------------------------------------------------------------
  // 2. TINTED GLASS CANOPY (Windshield, Roof & Side Windows)
  // -------------------------------------------------------------
  // Windshield (Raked aerodynamic curved glass)
  const windshieldShape = new THREE.Shape();
  windshieldShape.moveTo(-0.58, 0);
  windshieldShape.lineTo(0.58, 0);
  windshieldShape.lineTo(0.48, 0.82);
  windshieldShape.lineTo(-0.48, 0.82);
  windshieldShape.closePath();

  const windshieldGeom = new THREE.ExtrudeGeometry(windshieldShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.015,
    bevelThickness: 0.01,
  });
  windshieldGeom.center();
  const windshieldMesh = new THREE.Mesh(windshieldGeom, glassMat);
  windshieldMesh.rotation.x = -Math.PI * 0.34;
  windshieldMesh.position.set(0, 0.88, 0.46);
  bodyMeshGroup.add(windshieldMesh);

  // Roof Glass Insert
  const roofGlassGeom = new THREE.BoxGeometry(0.72, 0.02, 0.88);
  const roofGlassMesh = new THREE.Mesh(roofGlassGeom, glassMat);
  roofGlassMesh.position.set(0, 1.15, -0.35);
  roofGlassMesh.rotation.x = -0.04;
  bodyMeshGroup.add(roofGlassMesh);

  // Fastback Rear Glass Hatch
  const rearGlassShape = new THREE.Shape();
  rearGlassShape.moveTo(-0.52, 0);
  rearGlassShape.lineTo(0.52, 0);
  rearGlassShape.lineTo(0.44, 0.95);
  rearGlassShape.lineTo(-0.44, 0.95);
  rearGlassShape.closePath();

  const rearGlassGeom = new THREE.ExtrudeGeometry(rearGlassShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.015,
    bevelThickness: 0.01,
  });
  rearGlassGeom.center();
  const rearGlassMesh = new THREE.Mesh(rearGlassGeom, glassMat);
  rearGlassMesh.rotation.x = Math.PI * 0.36;
  rearGlassMesh.position.set(0, 0.94, -0.92);
  bodyMeshGroup.add(rearGlassMesh);

  // Side Frameless Windows
  const sideWinShape = new THREE.Shape();
  sideWinShape.moveTo(0, 0);
  sideWinShape.lineTo(0.95, 0);
  sideWinShape.lineTo(0.65, 0.35);
  sideWinShape.lineTo(0.12, 0.34);
  sideWinShape.closePath();

  const sideWinGeom = new THREE.ExtrudeGeometry(sideWinShape, {
    depth: 0.015,
    bevelEnabled: false,
  });
  sideWinGeom.center();

  const leftSideWin = new THREE.Mesh(sideWinGeom, glassMat);
  leftSideWin.rotation.y = Math.PI / 2;
  leftSideWin.position.set(0.66, 0.86, -0.15);
  leftSideWin.scale.set(1.0, 1.0, 1.0);

  const rightSideWin = leftSideWin.clone();
  rightSideWin.position.x = -0.66;
  rightSideWin.rotation.y = -Math.PI / 2;
  bodyMeshGroup.add(leftSideWin, rightSideWin);

  // -------------------------------------------------------------
  // 3. FRONT SPLITTER & GLOWING LIME-GREEN ACCENT STRIP
  // -------------------------------------------------------------
  const splitterShape = new THREE.Shape();
  splitterShape.moveTo(-1.02, 0);
  splitterShape.lineTo(1.02, 0);
  splitterShape.lineTo(0.96, 0.42);
  splitterShape.lineTo(0.72, 0.62);
  splitterShape.lineTo(-0.72, 0.62);
  splitterShape.lineTo(-0.96, 0.42);
  splitterShape.closePath();

  const splitterGeom = new THREE.ExtrudeGeometry(splitterShape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.015,
    bevelThickness: 0.01,
  });
  splitterGeom.center();
  const splitterMesh = new THREE.Mesh(splitterGeom, carbonMat);
  splitterMesh.rotation.x = Math.PI / 2;
  splitterMesh.position.set(0, 0.07, 2.22);
  bodyMeshGroup.add(splitterMesh);

  // Front Splitter Glowing Accent Edge Line (Ultra-thin neon curve)
  const splitterAccentGeom = new THREE.TorusGeometry(0.86, 0.008, 6, 24, Math.PI * 0.72);
  const splitterAccent = new THREE.Mesh(splitterAccentGeom, accentMat);
  splitterAccent.rotation.x = Math.PI / 2;
  splitterAccent.rotation.z = -Math.PI * 0.86;
  splitterAccent.position.set(0, 0.08, 2.18);
  splitterAccent.scale.set(1.15, 0.45, 1.0);
  bodyMeshGroup.add(splitterAccent);

  // Front Center Grille Intake
  const centerIntakeGeom = new THREE.BoxGeometry(0.78, 0.16, 0.12);
  const centerIntake = new THREE.Mesh(centerIntakeGeom, grilleMat);
  centerIntake.position.set(0, 0.24, 2.16);
  bodyMeshGroup.add(centerIntake);

  // Front Side Brake Intakes
  const sideIntakeGeom = new THREE.BoxGeometry(0.32, 0.14, 0.15);
  const leftIntake = new THREE.Mesh(sideIntakeGeom, grilleMat);
  leftIntake.position.set(0.64, 0.24, 2.08);
  leftIntake.rotation.y = -0.25;
  const rightIntake = leftIntake.clone();
  rightIntake.position.x = -0.64;
  rightIntake.rotation.y = 0.25;
  bodyMeshGroup.add(leftIntake, rightIntake);

  // -------------------------------------------------------------
  // 4. GLOWING LIME-GREEN SIDE ACCENTS & CARBON SIDE SKIRTS
  // -------------------------------------------------------------
  // Carbon Fiber Side Skirts
  const skirtGeom = new THREE.BoxGeometry(0.12, 0.04, 2.15);
  const leftSkirt = new THREE.Mesh(skirtGeom, carbonMat);
  leftSkirt.position.set(0.92, 0.11, 0.0);
  const rightSkirt = leftSkirt.clone();
  rightSkirt.position.x = -0.92;
  bodyMeshGroup.add(leftSkirt, rightSkirt);

  // Thin Glowing Accent Lines along the lower rocker panel
  const sideAccentGeom = new THREE.BoxGeometry(0.016, 0.016, 2.12);
  const leftSideAccent = new THREE.Mesh(sideAccentGeom, accentMat);
  leftSideAccent.position.set(0.985, 0.12, 0.0);
  const rightSideAccent = leftSideAccent.clone();
  rightSideAccent.position.x = -0.985;
  bodyMeshGroup.add(leftSideAccent, rightSideAccent);

  // Aerodynamic Shoulder Accent Lines
  const shoulderAccentGeom = new THREE.BoxGeometry(0.012, 0.012, 1.5);
  const leftShoulderAccent = new THREE.Mesh(shoulderAccentGeom, accentMat);
  leftShoulderAccent.position.set(0.93, 0.58, 0.0);
  const rightShoulderAccent = leftShoulderAccent.clone();
  rightShoulderAccent.position.x = -0.93;
  bodyMeshGroup.add(leftShoulderAccent, rightShoulderAccent);

  // -------------------------------------------------------------
  // 5. AERODYNAMIC SIDE MIRRORS
  // -------------------------------------------------------------
  const mirrorCapGeom = new THREE.BoxGeometry(0.16, 0.07, 0.10);
  const leftMirrorCap = new THREE.Mesh(mirrorCapGeom, carbonMat);
  leftMirrorCap.position.set(0.88, 0.72, 0.54);
  leftMirrorCap.rotation.set(0, 0.12, -0.05);

  const mirrorStemGeom = new THREE.CylinderGeometry(0.012, 0.016, 0.12, 6);
  const leftMirrorStem = new THREE.Mesh(mirrorStemGeom, carbonMat);
  leftMirrorStem.position.set(0.80, 0.68, 0.54);
  leftMirrorStem.rotation.z = Math.PI / 3;

  const leftMirrorAccent = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.012), accentMat);
  leftMirrorAccent.position.set(0.88, 0.72, 0.59);

  const leftMirrorGroup = new THREE.Group();
  leftMirrorGroup.add(leftMirrorCap, leftMirrorStem, leftMirrorAccent);

  const rightMirrorGroup = leftMirrorGroup.clone();
  rightMirrorGroup.scale.x = -1;
  bodyMeshGroup.add(leftMirrorGroup, rightMirrorGroup);

  // -------------------------------------------------------------
  // 6. COCKPIT INTERIOR DETAILS (Sports bucket seats & steering wheel)
  // -------------------------------------------------------------
  const interiorGroup = new THREE.Group();
  // Cockpit Tub
  const tubGeom = new THREE.BoxGeometry(1.22, 0.32, 1.4);
  const tub = new THREE.Mesh(tubGeom, interiorMat);
  tub.position.set(0, 0.38, -0.05);
  interiorGroup.add(tub);

  // Dual Sports Bucket Seats
  const seatGeom = new THREE.BoxGeometry(0.40, 0.48, 0.12);
  const leftSeat = new THREE.Mesh(seatGeom, interiorMat);
  leftSeat.position.set(0.30, 0.68, -0.28);
  leftSeat.rotation.x = -0.25;
  const rightSeat = leftSeat.clone();
  rightSeat.position.x = -0.30;

  const headrestGeom = new THREE.BoxGeometry(0.22, 0.16, 0.08);
  const leftHeadrest = new THREE.Mesh(headrestGeom, interiorMat);
  leftHeadrest.position.set(0.30, 0.94, -0.35);
  const rightHeadrest = leftHeadrest.clone();
  rightHeadrest.position.x = -0.30;

  // Steering Wheel
  const steeringWheelGeom = new THREE.TorusGeometry(0.13, 0.016, 8, 16);
  const steeringWheel = new THREE.Mesh(steeringWheelGeom, interiorMat);
  steeringWheel.position.set(0.30, 0.72, 0.25);
  steeringWheel.rotation.x = -0.45;

  // Dashboard
  const dashGeom = new THREE.BoxGeometry(1.15, 0.14, 0.32);
  const dash = new THREE.Mesh(dashGeom, interiorMat);
  dash.position.set(0, 0.66, 0.40);

  interiorGroup.add(leftSeat, rightSeat, leftHeadrest, rightHeadrest, steeringWheel, dash);
  bodyMeshGroup.add(interiorGroup);

  // -------------------------------------------------------------
  // 7. ACTIVE-STYLE CARBON FIBER REAR SPOILER / WING
  // -------------------------------------------------------------
  const spoilerShape = new THREE.Shape();
  spoilerShape.moveTo(-0.94, 0);
  spoilerShape.lineTo(0.94, 0);
  spoilerShape.lineTo(0.91, 0.20);
  spoilerShape.lineTo(-0.91, 0.20);
  spoilerShape.closePath();

  const spoilerGeom = new THREE.ExtrudeGeometry(spoilerShape, {
    depth: 0.024,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.01,
    bevelThickness: 0.01,
  });
  spoilerGeom.center();
  const spoiler = new THREE.Mesh(spoilerGeom, carbonMat);
  spoiler.rotation.x = Math.PI / 2 + 0.08;
  spoiler.position.set(0, 0.88, -2.10);

  // Endplates
  const endplateGeom = new THREE.BoxGeometry(0.016, 0.12, 0.26);
  const leftEndplate = new THREE.Mesh(endplateGeom, carbonMat);
  leftEndplate.position.set(0.94, 0.88, -2.10);
  const rightEndplate = leftEndplate.clone();
  rightEndplate.position.x = -0.94;

  // Aero Pylons / Stanchions
  const stanchionGeom = new THREE.BoxGeometry(0.03, 0.18, 0.12);
  const leftStanchion = new THREE.Mesh(stanchionGeom, carbonMat);
  leftStanchion.position.set(0.42, 0.78, -2.02);
  leftStanchion.rotation.x = 0.22;
  const rightStanchion = leftStanchion.clone();
  rightStanchion.position.x = -0.42;

  bodyMeshGroup.add(spoiler, leftEndplate, rightEndplate, leftStanchion, rightStanchion);

  // -------------------------------------------------------------
  // 8. REAR DIFFUSER WITH QUAD FINS & LIME ACCENT EDGES
  // -------------------------------------------------------------
  const diffuserBaseGeom = new THREE.BoxGeometry(1.68, 0.05, 0.60);
  const diffuserBase = new THREE.Mesh(diffuserBaseGeom, carbonMat);
  diffuserBase.position.set(0, 0.15, -2.08);
  diffuserBase.rotation.x = 0.16;
  bodyMeshGroup.add(diffuserBase);

  // 4 Diffuser Fins
  const finPositions = [-0.62, -0.21, 0.21, 0.62];
  finPositions.forEach((x, idx) => {
    const finGeom = new THREE.BoxGeometry(0.022, 0.14, 0.56);
    const fin = new THREE.Mesh(finGeom, carbonMat);
    fin.position.set(x, 0.14, -2.08);
    fin.rotation.x = 0.16;
    bodyMeshGroup.add(fin);

    // Outer fins with glowing lime-green pinstripe
    if (idx === 0 || idx === finPositions.length - 1) {
      const finAccentGeom = new THREE.BoxGeometry(0.01, 0.012, 0.54);
      const finAccent = new THREE.Mesh(finAccentGeom, accentMat);
      finAccent.position.set(x + (idx === 0 ? -0.014 : 0.014), 0.07, -2.08);
      finAccent.rotation.x = 0.16;
      bodyMeshGroup.add(finAccent);
    }
  });

  // Dual Twin Titanium Round Exhausts
  const exhaustGeom = new THREE.CylinderGeometry(0.046, 0.046, 0.22, 16, 1, true);
  const exhaustPositions = [-0.40, -0.30, 0.30, 0.40];
  exhaustPositions.forEach((x) => {
    const exhaust = new THREE.Mesh(exhaustGeom, exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(x, 0.29, -2.22);
    bodyMeshGroup.add(exhaust);
  });

  // -------------------------------------------------------------
  // 9. HEADLIGHTS & TAILLIGHTS (With Actual Light Emission)
  // -------------------------------------------------------------
  const headlightMeshes: THREE.Mesh[] = [];
  const taillightMeshes: THREE.Mesh[] = [];
  const headlightPointLights: THREE.PointLight[] = [];
  const headlightSpotLights: THREE.SpotLight[] = [];
  const taillightPointLights: THREE.PointLight[] = [];

  // Projector LED lenses (embedded flush into the front aerodynamic fascia)
  const lensGeom = new THREE.CylinderGeometry(0.034, 0.034, 0.04, 16);
  lensGeom.rotateX(Math.PI / 2);

  const leftLens1 = new THREE.Mesh(lensGeom, headlightLensMat);
  leftLens1.position.set(0.60, 0.42, 2.05);
  const leftLens2 = new THREE.Mesh(lensGeom, headlightLensMat);
  leftLens2.position.set(0.69, 0.40, 1.98);

  const rightLens1 = new THREE.Mesh(lensGeom, headlightLensMat);
  rightLens1.position.set(-0.60, 0.42, 2.05);
  const rightLens2 = new THREE.Mesh(lensGeom, headlightLensMat);
  rightLens2.position.set(-0.69, 0.40, 1.98);

  // Daytime Running Light (DRL) Razor Eyebrow Slash
  const drlGeom = new THREE.BoxGeometry(0.32, 0.014, 0.02);
  const leftDRL = new THREE.Mesh(drlGeom, accentMat);
  leftDRL.position.set(0.65, 0.45, 2.00);
  leftDRL.rotation.set(0.05, -0.30, -0.06);
  const rightDRL = leftDRL.clone();
  rightDRL.position.x = -0.65;
  rightDRL.rotation.set(0.05, 0.30, 0.06);

  // Sealed Aerodynamic Front Nose Cap
  const noseCapGeom = new THREE.CylinderGeometry(0.35, 0.48, 0.16, 16, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
  const noseCap = new THREE.Mesh(noseCapGeom, paintMat);
  noseCap.rotation.y = -Math.PI / 2;
  noseCap.position.set(0, 0.28, 2.24);
  noseCap.scale.set(0.9, 1.0, 0.4);

  bodyMeshGroup.add(leftLens1, leftLens2, rightLens1, rightLens2, leftDRL, rightDRL, noseCap);
  headlightMeshes.push(leftLens1, leftLens2, rightLens1, rightLens2, leftDRL, rightDRL);

  // Actual Headlight SpotLights (illuminate road forward)
  const leftHeadlightLight = new THREE.SpotLight(0xe8f8ff, initialHeadlightsOn ? 40 : 0, 30, Math.PI / 5, 0.35, 1.2);
  leftHeadlightLight.position.set(0.65, 0.42, 2.05);
  const leftTarget = new THREE.Object3D();
  leftTarget.position.set(0.65, 0.15, 10);
  bodyMeshGroup.add(leftHeadlightLight, leftTarget);
  leftHeadlightLight.target = leftTarget;

  const rightHeadlightLight = new THREE.SpotLight(0xe8f8ff, initialHeadlightsOn ? 40 : 0, 30, Math.PI / 5, 0.35, 1.2);
  rightHeadlightLight.position.set(-0.65, 0.42, 2.05);
  const rightTarget = new THREE.Object3D();
  rightTarget.position.set(-0.65, 0.15, 10);
  bodyMeshGroup.add(rightHeadlightLight, rightTarget);
  rightHeadlightLight.target = rightTarget;

  const leftHlPoint = new THREE.PointLight(0xafe8ff, initialHeadlightsOn ? 10 : 0, 5, 1.5);
  leftHlPoint.position.set(0.65, 0.42, 2.08);
  const rightHlPoint = new THREE.PointLight(0xafe8ff, initialHeadlightsOn ? 10 : 0, 5, 1.5);
  rightHlPoint.position.set(-0.65, 0.42, 2.08);
  bodyMeshGroup.add(leftHlPoint, rightHlPoint);

  headlightSpotLights.push(leftHeadlightLight, rightHeadlightLight);
  headlightPointLights.push(leftHlPoint, rightHlPoint);

  // Full-Width Cyber LED Taillight Bar
  const taillightBarGeom = new THREE.BoxGeometry(1.72, 0.045, 0.04);
  const taillightBar = new THREE.Mesh(taillightBarGeom, taillightLensMat);
  taillightBar.position.set(0, 0.64, -2.12);
  bodyMeshGroup.add(taillightBar);

  // Taillight end blades
  const tlBladeGeom = new THREE.BoxGeometry(0.04, 0.14, 0.04);
  const leftBlade = new THREE.Mesh(tlBladeGeom, taillightLensMat);
  leftBlade.position.set(0.86, 0.59, -2.10);
  const rightBlade = leftBlade.clone();
  rightBlade.position.x = -0.86;
  bodyMeshGroup.add(leftBlade, rightBlade);

  taillightMeshes.push(taillightBar, leftBlade, rightBlade);

  // Real Red Taillight Point Lights (glow onto ground & diffuser)
  const leftTlPoint = new THREE.PointLight(0xff0515, 6.0, 4.0, 1.8);
  leftTlPoint.position.set(0.68, 0.64, -2.18);
  const rightTlPoint = new THREE.PointLight(0xff0515, 6.0, 4.0, 1.8);
  rightTlPoint.position.set(-0.68, 0.64, -2.18);
  bodyMeshGroup.add(leftTlPoint, rightTlPoint);
  taillightPointLights.push(leftTlPoint, rightTlPoint);

  // -------------------------------------------------------------
  // 10. DETAILED WHEEL ASSEMBLIES (4 Separate Parts)
  // -------------------------------------------------------------
  // Wheel Specs:
  // Radius: 0.33m (Y=0.33m sits flush on ground Y=0)
  // Width: 0.28m
  // Rim Radius: 0.25m (20-inch rim)

  function createWheelAssembly(isFront: boolean, isLeft: boolean): {
    wheelGroup: THREE.Group;
    spinGroup: THREE.Group;
  } {
    const wheelGroup = new THREE.Group();
    wheelGroup.name = `${isFront ? 'Front' : 'Rear'}_${isLeft ? 'Left' : 'Right'}_Wheel`;

    const steerGroup = new THREE.Group();
    steerGroup.name = 'SteerGroup';
    wheelGroup.add(steerGroup);

    const spinGroup = new THREE.Group();
    spinGroup.name = 'SpinGroup';
    steerGroup.add(spinGroup);

    // 1. TIRE (Low profile sport tire with open ends)
    // Cylinder is open-ended so rim, spokes, and brake disc are visible inside
    const tireGeom = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 32, 2, true);
    tireGeom.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeom, tireMat);
    spinGroup.add(tireMesh);

    // Rounded tire shoulders (inner and outer)
    const shoulderGeom = new THREE.TorusGeometry(0.305, 0.026, 8, 32);
    shoulderGeom.rotateY(Math.PI / 2);
    const outerShoulder = new THREE.Mesh(shoulderGeom, tireMat);
    outerShoulder.position.x = isLeft ? 0.13 : -0.13;
    const innerShoulder = new THREE.Mesh(shoulderGeom, tireMat);
    innerShoulder.position.x = isLeft ? -0.13 : 0.13;
    spinGroup.add(outerShoulder, innerShoulder);

    // 2. RIM (Detailed 10-Spoke Forged Alloy Turbine Wheel)
    // Rim barrel
    const rimBarrelGeom = new THREE.CylinderGeometry(0.245, 0.245, 0.25, 28, 1, true);
    rimBarrelGeom.rotateZ(Math.PI / 2);
    const rimBarrel = new THREE.Mesh(rimBarrelGeom, rimMat);
    spinGroup.add(rimBarrel);

    // Outer machined rim lip
    const rimLipGeom = new THREE.TorusGeometry(0.245, 0.012, 8, 28);
    rimLipGeom.rotateY(Math.PI / 2);
    const rimLip = new THREE.Mesh(rimLipGeom, rimMat);
    const outwardX = isLeft ? 0.125 : -0.125;
    rimLip.position.x = outwardX;
    spinGroup.add(rimLip);

    // Center lock hub cap
    const centerHubGeom = new THREE.CylinderGeometry(0.065, 0.065, 0.06, 16);
    centerHubGeom.rotateZ(Math.PI / 2);
    const centerHub = new THREE.Mesh(centerHubGeom, rimMat);
    centerHub.position.x = outwardX - (isLeft ? 0.02 : -0.02);
    spinGroup.add(centerHub);

    // Center lock accent ring
    const centerRingGeom = new THREE.TorusGeometry(0.045, 0.007, 8, 16);
    centerRingGeom.rotateY(Math.PI / 2);
    const centerRing = new THREE.Mesh(centerRingGeom, accentMat);
    centerRing.position.x = outwardX + (isLeft ? 0.005 : -0.005);
    spinGroup.add(centerRing);

    // 10 Forged Alloy Spokes (Visible between hub and outer rim)
    const numSpokes = 10;
    const spokeGeom = new THREE.BoxGeometry(0.022, 0.19, 0.024);
    for (let s = 0; s < numSpokes; s++) {
      const angle = (s / numSpokes) * Math.PI * 2;
      const spoke = new THREE.Mesh(spokeGeom, rimMat);
      spoke.position.set(
        outwardX - (isLeft ? 0.015 : -0.015),
        Math.sin(angle) * 0.135,
        Math.cos(angle) * 0.135
      );
      spoke.rotation.x = -angle;
      spoke.rotation.y = isLeft ? 0.18 : -0.18;
      spinGroup.add(spoke);
    }

    // 3. BRAKE DISC (Spins with wheel, clearly visible behind spokes)
    const discGeom = new THREE.CylinderGeometry(0.20, 0.20, 0.018, 24);
    discGeom.rotateZ(Math.PI / 2);
    const brakeDisc = new THREE.Mesh(discGeom, brakeDiscMat);
    brakeDisc.position.x = outwardX - (isLeft ? 0.05 : -0.05);
    spinGroup.add(brakeDisc);

    // 4. PERFORMANCE BRAKE CALIPER (Stationary on SteerGroup, doesn't spin on X!)
    const caliperGeom = new THREE.BoxGeometry(0.068, 0.15, 0.09);
    const caliper = new THREE.Mesh(caliperGeom, caliperMat);
    const caliperAngle = isFront ? Math.PI * 0.25 : Math.PI * 0.75;
    caliper.position.set(
      outwardX - (isLeft ? 0.04 : -0.04),
      Math.sin(caliperAngle) * 0.165,
      Math.cos(caliperAngle) * 0.165
    );
    caliper.rotation.x = -caliperAngle;
    steerGroup.add(caliper);

    return { wheelGroup, spinGroup };
  }

  // Wheel positions (Front Z = +1.30m, Rear Z = -1.35m, Track = 1.76m/1.80m, Y = 0.33m)
  const frontZ = 1.30;
  const rearZ = -1.35;
  const frontTrackX = 0.88;
  const rearTrackX = 0.90;
  const wheelY = 0.33;

  const fl = createWheelAssembly(true, true);
  fl.wheelGroup.position.set(frontTrackX, wheelY, frontZ);

  const fr = createWheelAssembly(true, false);
  fr.wheelGroup.position.set(-frontTrackX, wheelY, frontZ);

  const rl = createWheelAssembly(false, true);
  rl.wheelGroup.position.set(rearTrackX, wheelY, rearZ);

  const rr = createWheelAssembly(false, false);
  rr.wheelGroup.position.set(-rearTrackX, wheelY, rearZ);

  root.add(fl.wheelGroup, fr.wheelGroup, rl.wheelGroup, rr.wheelGroup);

  const wheelAssemblies: WheelAssemblies = {
    frontLeft: fl.wheelGroup,
    frontRight: fr.wheelGroup,
    rearLeft: rl.wheelGroup,
    rearRight: rr.wheelGroup,
  };

  const spinGroups = [fl.spinGroup, fr.spinGroup, rl.spinGroup, rr.spinGroup];
  const frontSteerGroups = [
    fl.wheelGroup.getObjectByName('SteerGroup') as THREE.Group,
    fr.wheelGroup.getObjectByName('SteerGroup') as THREE.Group,
  ];

  // -------------------------------------------------------------
  // CONTROLS & UPDATES
  // -------------------------------------------------------------
  let currentSteeringAngle = 0;
  let currentWheelSpin = 0;
  let currentBodyRoll = 0;

  function update(params: {
    steeringAngle?: number;
    wheelSpin?: number;
    bodyRoll?: number;
  }) {
    if (params.steeringAngle !== undefined) {
      currentSteeringAngle = clampSteeringAngle(params.steeringAngle);
      for (const sg of frontSteerGroups) {
        if (sg) sg.rotation.y = currentSteeringAngle;
      }
    }

    if (params.wheelSpin !== undefined) {
      currentWheelSpin = params.wheelSpin;
      for (const spg of spinGroups) {
        spg.rotation.x = currentWheelSpin;
      }
    }

    if (params.bodyRoll !== undefined) {
      currentBodyRoll = clampBodyRoll(params.bodyRoll);
      bodyGroup.rotation.z = -currentBodyRoll;
      bodyGroup.rotation.x = -Math.abs(currentBodyRoll) * 0.10;
    }
  }

  function setPaintColor(color: string | number) {
    paintMat.color.copy(parseColor(color));
  }

  function setAccentColor(color: string | number) {
    const col = parseColor(color);
    accentMat.color.copy(col);
    accentMat.emissive.copy(col);
    caliperMat.color.copy(col);
  }

  function setHeadlights(on: boolean) {
    headlightLensMat.emissiveIntensity = on ? 3.0 : 0.05;
    for (const light of headlightSpotLights) {
      light.intensity = on ? 40 : 0;
    }
    for (const light of headlightPointLights) {
      light.intensity = on ? 10 : 0;
    }
  }

  function getTriangleCount(): number {
    return calculateObjectTriangles(root);
  }

  function dispose() {
    tireTreadTex.dispose();
    carbonTex.dispose();
    brakeDiscTex.dispose();
    grilleTex.dispose();

    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      }
    });

    Object.values(materials).forEach((mat) => {
      if (mat) mat.dispose();
    });
  }

  return {
    root,
    bodyGroup,
    frontLeft: fl.wheelGroup,
    frontRight: fr.wheelGroup,
    rearLeft: rl.wheelGroup,
    rearRight: rr.wheelGroup,
    wheels: wheelAssemblies,
    headlightMeshes,
    taillightMeshes,
    lights: {
      headlights: headlightMeshes,
      taillights: taillightMeshes,
      headlightMeshes,
      taillightMeshes,
      headlightPointLights,
      headlightSpotLights,
      taillightPointLights,
    },
    materials,
    paintMaterial: paintMat,
    accentMaterial: accentMat,
    glassMaterial: glassMat,
    rimMaterial: rimMat,
    tireMaterial: tireMat,
    update,
    setPaintColor,
    setAccentColor,
    setHeadlights,
    getTriangleCount,
    dispose,
  };
}
