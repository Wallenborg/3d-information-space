// Spatial spec → three.js objects. Knows nothing about Wikipedia.

import * as THREE from 'three';
import { createLabel } from './labels.js';
import { TextSurface } from './textSurface.js';
import { ImageSurface } from './imageSurface.js';
import { linkPieces, LinkLabel, LABEL_NEAR, LABEL_FAR, pointSegmentDistance } from './linkArms.js';

// Text textures exist only near the viewer: information fades into fog and is forgotten in detail.
const DETAIL_RADIUS = 38;
const RELEASE_RADIUS = 50;
const MAX_ACTIVE_TEXT = 44;
const ACTIVATIONS_PER_TICK = 5;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const EMERGE_SPREAD = 3.2; // seconds over which the world grows outward from its threshold
const EMERGE_DURATION = 1.4; // seconds per element

// 12 edges of a unit cube, as pairs of corner indices.
const CORNERS = [];
for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) CORNERS.push(new THREE.Vector3(x, y, z));
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

export function buildWorldObject(spec) {
  const group = new THREE.Group();
  const { palette } = spec;
  const time = { value: 0 };

  const materials = {
    primary: new THREE.MeshLambertMaterial({ color: palette.primary }),
    secondary: new THREE.MeshLambertMaterial({ color: palette.secondary }),
    accent: new THREE.MeshLambertMaterial({ color: palette.accent }),
    surface: new THREE.MeshBasicMaterial({ color: palette.surface }),
    image: new THREE.MeshLambertMaterial({ color: palette.primary }),
    imagePlaceholder: new THREE.MeshBasicMaterial({ color: palette.secondary }),
    link: new THREE.MeshBasicMaterial({ color: '#ffffff' }), // tinted per instance
  };
  const textSurfaces = [];
  const imageSurfaces = [];
  const links = []; // { target, label, segments, dir, start, count, label3d }
  // At rest, arms sit partway toward the atmosphere; focused, they sharpen into the accent.
  const linkColor = new THREE.Color(palette.accent).lerp(new THREE.Color(palette.atmosphere), 0.35);
  const linkFocusColor = new THREE.Color(palette.accent).lerp(new THREE.Color(palette.light ? '#000000' : '#ffffff'), 0.3);

  // Convert elements into box transforms, grouped by material.
  const origin = new THREE.Vector3(...spec.entry.target);
  const maxDistance = Math.max(1, spec.extent);
  const buckets = {};
  const edgePositions = [];
  const edgeDelays = [];
  const animated = [];
  const tmpQ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  const delayFor = (pos, i) => (pos.distanceTo(origin) / maxDistance) * EMERGE_SPREAD + ((i * 0.618) % 1) * 0.35;

  spec.elements.forEach((e, i) => {
    let pos;
    let quat;
    let scl;
    let mat;
    let edges = true;

    if (e.type === 'box') {
      pos = new THREE.Vector3(...e.p);
      quat = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, e.ry || 0);
      scl = new THREE.Vector3(...e.s);
      mat = e.mat;
    } else if (e.type === 'beam') {
      const a = new THREE.Vector3(...e.a);
      const b = new THREE.Vector3(...e.b);
      const dir = b.clone().sub(a);
      const length = dir.length();
      if (length < 0.01) return;
      pos = a.clone().add(b).multiplyScalar(0.5);
      // Keep the beam's width horizontal: yaw first, then pitch.
      const yaw = Math.atan2(dir.x, dir.z);
      const pitch = -Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      scl = new THREE.Vector3(e.w, e.h, length);
      mat = e.mat;
    } else if (e.type === 'surface') {
      const surface = new TextSurface(e, palette, materials.surface);
      group.add(surface.mesh);
      textSurfaces.push(surface);
      animated.push({ object: surface.mesh, base: surface.mesh.scale.clone(), delay: delayFor(surface.mesh.position, i) + 0.4 });
      surface.mesh.scale.setScalar(0.0001);
      return;
    } else if (e.type === 'image') {
      // A thin backing slab, and the image plane suspended just in front of it.
      pos = new THREE.Vector3(...e.p);
      quat = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, e.ry || 0);
      scl = new THREE.Vector3(e.s[0], e.s[1], 0.04);
      mat = 'image';
      edges = false;
      const image = new ImageSurface(e, materials.imagePlaceholder);
      group.add(image.mesh);
      imageSurfaces.push(image);
      animated.push({ object: image.mesh, base: image.mesh.scale.clone(), delay: delayFor(pos, i) + 0.5 });
      image.mesh.scale.setScalar(0.0001);
    } else if (e.type === 'label') {
      const mesh = createLabel(e.text, e.h, palette.ink);
      mesh.position.set(...e.p);
      mesh.rotation.y = e.ry || 0;
      group.add(mesh);
      animated.push({ object: mesh, base: new THREE.Vector3(1, 1, 1), delay: delayFor(mesh.position, i) + 0.6 });
      mesh.scale.setScalar(0.0001);
      return;
    } else if (e.type === 'link') {
      const { pieces, segments, dir } = linkPieces(e);
      const bucket = (buckets.link ||= []);
      const delay = delayFor(segments[0][0], i) + 1.2; // arms extend after the architecture has formed
      links.push({ target: e.target, label: e.label, segments, dir, start: bucket.length, count: pieces.length, label3d: null });
      pieces.forEach((pc, k) => bucket.push({ ...pc, delay: delay + k * 0.02 }));
      return;
    } else {
      return;
    }

    (buckets[mat] ||= []).push({ pos, quat, scl, delay: delayFor(pos, i) });

    if (edges) {
      const m = new THREE.Matrix4().compose(pos, quat, scl);
      const delay = delayFor(pos, i) + EMERGE_DURATION * 0.6;
      for (const [ia, ib] of EDGES) {
        const va = CORNERS[ia].clone().applyMatrix4(m);
        const vb = CORNERS[ib].clone().applyMatrix4(m);
        edgePositions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
        edgeDelays.push(delay, delay);
      }
    }
  });

  const instanced = [];
  let linkMesh = null;
  for (const [mat, items] of Object.entries(buckets)) {
    const mesh = new THREE.InstancedMesh(UNIT_BOX, materials[mat], items.length);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (mat === 'link') {
      for (let k = 0; k < items.length; k++) mesh.setColorAt(k, linkColor);
      linkMesh = mesh;
    }
    group.add(mesh);
    instanced.push({ mesh, items, mat });
  }

  // All edges in one draw call; each vertex fades in on its own delay.
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(edgeDelays, 1));
  const edgeMaterial = new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.4, depthWrite: false });
  edgeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aDelay;\nvarying float vDelay;\nvoid main() {\n  vDelay = aDelay;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uTime;\nvarying float vDelay;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= clamp((uTime - vDelay) / 1.2, 0.0, 1.0);');
  };
  const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edgeLines.frustumCulled = false;
  group.add(edgeLines);

  const matrix = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const totalTime = EMERGE_SPREAD + EMERGE_DURATION + 1.5;
  let complete = false;

  function update(dt) {
    time.value += dt;
    if (complete) return;
    const t = time.value;

    for (const { mesh, items } of instanced) {
      items.forEach((it, i) => {
        const k = ease(Math.min(1, Math.max(0, (t - it.delay) / EMERGE_DURATION)));
        p.copy(it.pos);
        p.y -= (1 - k) * 4;
        s.copy(it.scl).multiplyScalar(Math.max(k, 0.0001));
        matrix.compose(p, it.quat, s);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const a of animated) {
      const k = Math.max(0.0001, ease(Math.min(1, Math.max(0, (t - a.delay) / EMERGE_DURATION))));
      a.object.scale.copy(a.base).multiplyScalar(k);
    }
    if (t > totalTime) {
      complete = true;
      for (const { mesh } of instanced) mesh.computeBoundingSphere(); // for raycasting at full size
    }
  }

  // Stream text textures: nearest surfaces within DETAIL_RADIUS get text, distant ones release it.
  const local = new THREE.Vector3();
  let detailTimer = 0;
  function updateDetail(dt, cameraPosition) {
    detailTimer -= dt;
    if (detailTimer > 0) return;
    detailTimer = 0.25;

    group.worldToLocal(local.copy(cameraPosition));
    const ranked = textSurfaces
      .map((s) => ({ s, d: s.mesh.position.distanceTo(local) }))
      .sort((a, b) => a.d - b.d);

    let activations = 0;
    ranked.forEach(({ s, d }, rank) => {
      if (s.active && (d > RELEASE_RADIUS || rank >= MAX_ACTIVE_TEXT)) s.deactivate();
      else if (!s.active && d < DETAIL_RADIUS && rank < MAX_ACTIVE_TEXT && activations < ACTIVATIONS_PER_TICK) {
        s.activate();
        activations++;
      }
    });
  }

  const interactive = [...textSurfaces, ...imageSurfaces].map((s) => s.mesh);
  const occluders = instanced.filter((i) => i.mat !== 'link').map((i) => i.mesh);

  // Destination titles appear along arms the viewer is near.
  function updateLinkLabels(cameraLocal) {
    for (const link of links) {
      const d = Math.min(...link.segments.map(([a, b]) => pointSegmentDistance(cameraLocal, a, b)));
      if (!link.label3d && d < LABEL_NEAR) {
        link.label3d = new LinkLabel(link, palette);
        group.add(link.label3d.mesh);
      } else if (link.label3d && d > LABEL_FAR + 2) {
        group.remove(link.label3d.mesh);
        link.label3d.dispose();
        link.label3d = null;
      }
      if (link.label3d) link.label3d.orient(cameraLocal, d);
    }
  }

  function highlightLink(link, on) {
    if (!linkMesh || !link) return;
    for (let k = link.start; k < link.start + link.count; k++) linkMesh.setColorAt(k, on ? linkFocusColor : linkColor);
    linkMesh.instanceColor.needsUpdate = true;
  }

  // Per-frame: orient nearby link labels.
  const cameraLocal = new THREE.Vector3();
  function updateFrame(camera) {
    group.worldToLocal(cameraLocal.copy(camera.position));
    updateLinkLabels(cameraLocal);
  }

  function dispose() {
    links.forEach((l) => l.label3d && l.label3d.dispose());
    textSurfaces.forEach((s) => s.deactivate());
    imageSurfaces.forEach((s) => s.dispose());
    group.traverse((o) => {
      if (o.geometry && o.geometry !== UNIT_BOX && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  update(0);
  return { group, update, updateDetail, updateFrame, interactive, occluders, links, highlightLink, dispose, spec };
}

function ease(k) {
  return 1 - (1 - k) ** 3;
}
