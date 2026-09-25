// Hyperlinks as architecture: arms extending from their source text into the fog,
// ending in an open aperture — a threshold to a space that does not exist yet.

import * as THREE from 'three';
import { createLabel } from './labels.js';

const UP = new THREE.Vector3(0, 1, 0);
const LABEL_NEAR = 16; // destination becomes legible within this distance
const LABEL_FAR = 22;

/** Box transforms (position, quaternion, scale) that make up one link arm. */
export function linkPieces(e) {
  const pts = e.points.map((p) => new THREE.Vector3(...p));
  const t = e.thickness;
  const pieces = [];

  const beam = (a, b, w, h) => {
    const dir = b.clone().sub(a);
    const length = dir.length();
    if (length < 0.01) return;
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = -Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    pieces.push({
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')),
      scl: new THREE.Vector3(w, h, length),
    });
  };

  const [w, h] = e.style === 'blade' ? [t * 3.2, t * 0.5] : [t, t];

  // The short extension from the panel edge is always continuous: the link's origin stays attached.
  beam(pts[0], pts[1], w, h);

  if (e.style === 'dashed') {
    // Repetition thinning into the unknown: dashes grow sparser with distance.
    const dir = pts[2].clone().sub(pts[1]);
    const total = dir.length();
    dir.normalize();
    let s = 0;
    let dash = 2.4;
    let gap = 0.8;
    while (s < total) {
      const a = pts[1].clone().addScaledVector(dir, s);
      const b = pts[1].clone().addScaledVector(dir, Math.min(total, s + dash));
      beam(a, b, w * 1.4, h * 1.4);
      s += dash + gap;
      gap *= 1.12;
    }
  } else {
    beam(pts[1], pts[2], w, h);
  }

  // Aperture at the far end, facing back toward the source.
  const dir = pts[2].clone().sub(pts[1]).normalize();
  const right = new THREE.Vector3().crossVectors(dir, UP);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, dir));
  const size = 3.2;
  const f = Math.max(0.12, t * 1.5);
  const end = pts[2];
  const bar = (offset, sx, sy) => pieces.push({ pos: end.clone().add(offset), quat: basis.clone(), scl: new THREE.Vector3(sx, sy, f) });
  bar(up.clone().multiplyScalar(size / 2), size + f, f);
  bar(up.clone().multiplyScalar(-size / 2), size + f, f);
  bar(right.clone().multiplyScalar(size / 2), f, size);
  bar(right.clone().multiplyScalar(-size / 2), f, size);

  return { pieces, segments: [[pts[0], pts[1]], [pts[1], pts[2]]], dir };
}

/**
 * A link's destination title, inscribed along its arm. Created only when the
 * viewer is near, turned to face them, and faded with distance.
 */
export class LinkLabel {
  constructor(link, palette) {
    this.link = link;
    this.mesh = createLabel(link.target, 0.42, palette.ink);
    this.mesh.material.opacity = 0;
    this.anchor = link.segments[1][0].clone().addScaledVector(link.dir, 2.2).add(new THREE.Vector3(0, 0.35, 0));
    this.mesh.position.copy(this.anchor);
    // Shift so the text starts at the anchor and runs outward along the arm.
    this.mesh.geometry.translate(this.mesh.geometry.parameters.width / 2, 0, 0);
  }

  orient(cameraLocal, distance) {
    const x = this.link.dir.clone();
    const toCam = cameraLocal.clone().sub(this.anchor).normalize();
    const z = toCam.clone().addScaledVector(x, -toCam.dot(x));
    if (z.lengthSq() < 1e-3) z.copy(toCam);
    z.normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    if (y.y < 0) {
      // Keep text upright: flip across the arm.
      y.negate();
      x.negate();
    }
    this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.mesh.material.opacity = Math.min(1, Math.max(0, (LABEL_FAR - distance) / (LABEL_FAR - LABEL_NEAR)));
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.map.dispose();
    this.mesh.material.dispose();
  }
}

export { LABEL_NEAR, LABEL_FAR };

/** Closest approach between a ray (origin o, unit direction d) and segment ab. */
export function raySegmentDistance(o, d, a, b) {
  const u = b.clone().sub(a);
  const w0 = o.clone().sub(a);
  const B = d.dot(u);
  const C = u.dot(u);
  const D = d.dot(w0);
  const E = u.dot(w0);
  const den = C - B * B;
  let s = den > 1e-8 ? (E - B * D) / den : 0;
  s = Math.min(1, Math.max(0, s));
  const onSeg = a.clone().addScaledVector(u, s);
  const t = Math.max(0, onSeg.clone().sub(o).dot(d));
  const onRay = o.clone().addScaledVector(d, t);
  return { distance: onRay.distanceTo(onSeg), t };
}

/** Distance from a point to segment ab. */
export function pointSegmentDistance(p, a, b) {
  const u = b.clone().sub(a);
  const s = Math.min(1, Math.max(0, p.clone().sub(a).dot(u) / Math.max(1e-8, u.lengthSq())));
  return a.clone().addScaledVector(u, s).distanceTo(p);
}
