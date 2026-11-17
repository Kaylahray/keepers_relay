import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * One shape per Crowns item, by the rules' item number, so each pad shows what it gives from far
 * down the road: 1 Ram an arrowhead, 2 Slick a drop, 3 Jolt a lightning bolt, 4 Barricade a road
 * block, 5 Crown Rush a crown, 6 Ward a shield, 7 Patch a plus, 8 Draft a double chevron.
 * Each is about 1.6 m tall, standing upright, centred on its middle.
 */
export function itemShape(item: number): THREE.BufferGeometry {
  switch (item) {
    case 1:
      return extrude(outline([[0, 0.85], [0.7, 0.05], [0.25, 0.05], [0.25, -0.8], [-0.25, -0.8], [-0.25, 0.05], [-0.7, 0.05]]));
    case 2:
      return drop();
    case 3:
      return extrude(outline([[0.15, 0.85], [-0.5, -0.05], [-0.05, -0.05], [-0.2, -0.85], [0.5, 0.15], [0.05, 0.15], [0.35, 0.85]]));
    case 4:
      return block();
    case 5:
      return crown();
    case 6:
      return extrude(outline([[0, 0.8], [0.65, 0.55], [0.6, -0.05], [0, -0.85], [-0.6, -0.05], [-0.65, 0.55]]));
    case 7:
      return extrude(outline([[-0.22, 0.7], [0.22, 0.7], [0.22, 0.22], [0.7, 0.22], [0.7, -0.22], [0.22, -0.22], [0.22, -0.7], [-0.22, -0.7], [-0.22, -0.22], [-0.7, -0.22], [-0.7, 0.22], [-0.22, 0.22]]));
    case 8: {
      const chevron = (dy: number) => outline([[0, 0.35 + dy], [0.7, -0.25 + dy], [0.7, -0.6 + dy], [0, 0 + dy], [-0.7, -0.6 + dy], [-0.7, -0.25 + dy]]);
      return merge([extrude(chevron(0.45)), extrude(chevron(-0.25))]);
    }
    default:
      return new THREE.OctahedronGeometry(0.8, 0);
  }
}

function outline(points: [number, number][]): THREE.Shape {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

function extrude(shape: THREE.Shape): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
  geometry.center();
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
  parts.forEach((part) => part.dispose());
  merged.center();
  return merged;
}

/** Slick: a fat drop of oil, round at the bottom and pointed on top. */
function drop(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const y = -0.8 + t * 1.65;
    const r = t < 0.55 ? Math.sin((t / 0.55) * (Math.PI / 2)) * 0.6 : 0.6 * (1 - (t - 0.55) / 0.45) ** 1.3;
    profile.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  return new THREE.LatheGeometry(profile, 20);
}

/** Barricade: a striped beam on two feet. */
function block(): THREE.BufferGeometry {
  const beam = new THREE.BoxGeometry(1.7, 0.55, 0.3);
  beam.translate(0, 0.25, 0);
  const left = new THREE.BoxGeometry(0.16, 0.9, 0.16);
  left.translate(-0.6, -0.35, 0);
  const right = left.clone();
  right.translate(1.2, 0, 0);
  const footLeft = new THREE.BoxGeometry(0.5, 0.1, 0.5);
  footLeft.translate(-0.6, -0.8, 0);
  const footRight = footLeft.clone();
  footRight.translate(1.2, 0, 0);
  return merge([beam, left, right, footLeft, footRight]);
}

/** Crown Rush: a band with five points. */
function crown(): THREE.BufferGeometry {
  const band = new THREE.CylinderGeometry(0.7, 0.62, 0.55, 20, 1, true);
  band.translate(0, -0.35, 0);
  const parts: THREE.BufferGeometry[] = [band];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const point = new THREE.ConeGeometry(0.2, 0.75, 8);
    point.translate(Math.cos(a) * 0.62, 0.3, Math.sin(a) * 0.62);
    parts.push(point);
    const jewel = new THREE.SphereGeometry(0.1, 8, 6);
    jewel.translate(Math.cos(a) * 0.62, 0.72, Math.sin(a) * 0.62);
    parts.push(jewel);
  }
  return merge(parts);
}
