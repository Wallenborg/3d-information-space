// Free three-dimensional movement. No gravity, no ground: a camera moving through information.
// Two input sources feed the same movement model:
//  - desktop: pointer lock (mouse look) + keyboard
//  - touch: a virtual joystick vector, a vertical value and look drags (see touchControls.js)

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
    this.touchActive = false;
    this.touch = { x: 0, y: 0, vertical: 0, boost: false }; // joystick: x right, y down (screen space), each -1..1
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
      this.look(e.movementX * this.sensitivity, e.movementY * this.sensitivity);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** Inside the world and receiving input (pointer lock on desktop, entered on touch). */
  get active() {
    return this.locked || this.touchActive;
  }

  lock() {
    this.element.requestPointerLock();
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.setTouchActive(false);
  }

  setTouchActive(on) {
    if (this.touchActive === on) return;
    this.touchActive = on;
    if (!on) Object.assign(this.touch, { x: 0, y: 0, vertical: 0, boost: false });
    this.onLockChange?.(on);
  }

  /** Rotate the view by yaw/pitch deltas in radians (positive = right / down). */
  look(dYaw, dPitch) {
    this.yaw -= dYaw;
    this.pitch -= dPitch;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
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
    const { camera, keys, touch } = this;
    camera.rotation.set(this.pitch, this.yaw, 0);

    const has = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
    const f = has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown') - touch.y;
    const r = has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft') + touch.x;
    const u = has('Space') - has('KeyC') + touch.vertical;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const wish = new THREE.Vector3()
      .addScaledVector(forward, f)
      .addScaledVector(right, r)
      .addScaledVector(UP, u);
    // Keys give unit input (normalized, as before); a partly deflected joystick moves proportionally slower.
    const len = wish.length();
    if (len > 0) {
      const boosted = has('ShiftLeft', 'ShiftRight') || touch.boost;
      wish.multiplyScalar((this.speed * (boosted ? this.boost : 1)) / Math.max(1, len));
    }

    // Smooth, controlled acceleration and drift-to-rest.
    this.velocity.lerp(wish, 1 - Math.exp(-dt * 5));
    camera.position.addScaledVector(this.velocity, dt);
  }
}
