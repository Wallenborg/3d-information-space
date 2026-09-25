// Free three-dimensional movement. No gravity, no ground: a camera moving through information.

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class FlyControls {
  constructor(camera, element) {
    this.camera = camera;
    this.element = element;
    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.keys = new Set();
    this.locked = false;
    this.speed = 7;
    this.boost = 3.2;
    this.sensitivity = 0.0021;
    this.onLockChange = null;

    camera.rotation.order = 'YXZ';

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  lock() {
    this.element.requestPointerLock();
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setPose(position, target) {
    this.camera.position.set(...position);
    const dir = new THREE.Vector3(...target).sub(this.camera.position);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this.velocity.set(0, 0, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  update(dt) {
    const { camera, keys } = this;
    camera.rotation.set(this.pitch, this.yaw, 0);

    const has = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
    const f = has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown');
    const r = has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft');
    const u = has('Space') - has('KeyC');

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const wish = new THREE.Vector3()
      .addScaledVector(forward, f)
      .addScaledVector(right, r)
      .addScaledVector(UP, u);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(this.speed * (has('ShiftLeft', 'ShiftRight') ? this.boost : 1));

    // Smooth, controlled acceleration and drift-to-rest.
    this.velocity.lerp(wish, 1 - Math.exp(-dt * 5));
    camera.position.addScaledVector(this.velocity, dt);
  }
}
