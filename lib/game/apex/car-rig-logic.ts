/**
 * Pure mathematical, kinematic, and dimensional calculations for the Car Rig.
 * Decoupled from UI rendering so it can be thoroughly unit-tested.
 */
import * as THREE from 'three';

export interface CarDimensions {
  length: number;    // meters
  width: number;     // meters
  height: number;    // meters
  wheelbase: number; // meters
  frontTrack: number;// meters
  rearTrack: number; // meters
  curbWeightKg: number;
}

export const CAR_SPECS: CarDimensions = {
  length: 4.66,
  width: 2.04,
  height: 1.18,
  wheelbase: 2.65,
  frontTrack: 1.76,
  rearTrack: 1.78,
  curbWeightKg: 1390,
};

/**
 * Clamps steering input to realistic mechanical lock limits (in radians).
 * Standard high-performance sports car max lock is ~35 degrees (~0.61 rad).
 */
export function clampSteeringAngle(angleRad: number, maxDegrees = 35): number {
  const maxRad = (maxDegrees * Math.PI) / 180;
  return Math.max(-maxRad, Math.min(maxRad, angleRad));
}

/**
 * Clamps body roll to realistic suspension deflection limits (in radians).
 * Sports car roll angle typically stays within ±8 degrees under cornering loads.
 */
export function clampBodyRoll(rollRad: number, maxDegrees = 8): number {
  const maxRad = (maxDegrees * Math.PI) / 180;
  return Math.max(-maxRad, Math.min(maxRad, rollRad));
}

/**
 * Normalizes an angle into the range [0, 2*PI).
 */
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

/**
 * Computes wheel spin rotation based on vehicle velocity (m/s) or angular speed,
 * delta time, and tire radius.
 * Tire radius is ~0.33m.
 */
export function computeWheelSpinDelta(linearSpeedMps: number, dtSeconds: number, tireRadiusMeters = 0.33): number {
  if (tireRadiusMeters <= 0 || dtSeconds <= 0) return 0;
  const angularSpeed = linearSpeedMps / tireRadiusMeters;
  return angularSpeed * dtSeconds;
}

/**
 * Recursively tallies triangle count for all BufferGeometry meshes in an Object3D hierarchy.
 */
export function calculateObjectTriangles(root: THREE.Object3D): number {
  let triangles = 0;

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const geom = mesh.geometry;
      if (geom) {
        // In 3D engine stats, draw triangle count is per mesh
        if (geom.index) {
          triangles += geom.index.count / 3;
        } else if (geom.attributes.position) {
          triangles += geom.attributes.position.count / 3;
        }
      }
    }
  });

  return Math.round(triangles);
}

/**
 * Converts a hex or string color into a normalized THREE.Color.
 */
export function parseColor(colorInput: string | number): THREE.Color {
  const c = new THREE.Color();
  if (typeof colorInput === 'number') {
    c.setHex(colorInput);
  } else if (typeof colorInput === 'string') {
    c.set(colorInput);
  }
  return c;
}
