// A Wikipedia image as an independent spatial plane, suspended in its frame.

import * as THREE from 'three';
import { PERF } from '../device.js';

const PLANE = new THREE.PlaneGeometry(1, 1);
PLANE.userData.shared = true;
const loader = new THREE.TextureLoader().setCrossOrigin('anonymous');

// Load images a few at a time so a new world doesn't flood the network.
const queue = [];
let loading = 0;
const MAX_CONCURRENT = PERF.imageConcurrency;

function pump() {
  while (loading < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    if (job.cancelled) continue;
    loading++;
    loader.load(
      job.src,
      (texture) => { loading--; job.done(texture); pump(); },
      undefined,
      () => { loading--; job.done(null); pump(); },
    );
  }
}

export class ImageSurface {
  constructor(element, placeholderMaterial) {
    this.element = element;
    this.mesh = new THREE.Mesh(PLANE, placeholderMaterial);
    const normal = new THREE.Vector3(Math.sin(element.ry || 0), 0, Math.cos(element.ry || 0));
    this.mesh.position.set(...element.p).addScaledVector(normal, 0.03);
    this.mesh.rotation.y = element.ry || 0;
    this.mesh.scale.set(element.s[0], element.s[1], 1);
    this.mesh.userData.interactive = this;
    this.material = null;

    this.job = {
      src: element.src,
      done: (texture) => {
        if (!texture || this.job.cancelled) return texture?.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = PERF.anisotropy;
        this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        this.mesh.material = this.material;
      },
    };
    queue.push(this.job);
    pump();
  }

  describe() {
    return this.element.caption || null;
  }

  activateAt() {
    return false;
  }

  dispose() {
    this.job.cancelled = true;
    if (this.material) {
      this.material.map.dispose();
      this.material.dispose();
    }
  }
}
