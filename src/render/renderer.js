import * as THREE from 'three';
import { buildWorldObject } from './worldObject.js';
import { PERF } from '../device.js';

/**
 * Landscape keeps the original vertical field of view. In portrait the
 * vertical FOV opens up (capped) so the horizontal view doesn't collapse
 * into a narrow slit.
 */
function fovFor(aspect) {
  if (aspect >= 1) return BASE_FOV;
  const hHalf = (BASE_FOV * Math.PI) / 360; // keep the horizontal view of a square screen
  const v = (2 * Math.atan(Math.tan(hHalf) / aspect) * 180) / Math.PI;
  return Math.min(MAX_PORTRAIT_FOV, v);
}

function atmosphereOf(spec) {
  const { palette, atmosphere } = spec;
  const bg = new THREE.Color(palette.atmosphere);
  return {
    bg,
    sky: bg.clone().lerp(new THREE.Color('#ffffff'), palette.light ? 0.6 : 0.75),
    ground: bg.clone().lerp(new THREE.Color(palette.primary), 0.5).multiplyScalar(palette.light ? 0.8 : 0.6),
    density: atmosphere.fogDensity,
  };
}

const BASE_FOV = 68;
const MAX_PORTRAIT_FOV = 88;

export class SpaceRenderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio, PERF.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0e0e0d');
    this.scene.fog = new THREE.FogExp2('#0e0e0d', 0.012);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1500);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1.7);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.6);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.worlds = new Set();
    this.frameTimes = [];

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.fov = fovFor(this.camera.aspect);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    resize();
  }

  /**
   * Mobile budget: if frames stay slow, step the pixel ratio down (never below
   * the minimum). The architecture itself is never simplified.
   */
  adapt(dt) {
    if (!PERF.adaptive || this.pixelRatio <= PERF.minPixelRatio) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 34) {
      this.pixelRatio = Math.max(PERF.minPixelRatio, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  get canvas() {
    return this.renderer.domElement;
  }

  addWorld(spec, offset = [0, 0, 0], rotationY = 0) {
    const world = buildWorldObject(spec);
    world.group.position.set(...offset);
    world.group.rotation.y = rotationY;
    world.group.updateMatrixWorld(true);
    world.atmo = atmosphereOf(spec);
    this.scene.add(world.group);
    this.worlds.add(world);
    return world;
  }

  removeWorld(world) {
    this.scene.remove(world.group);
    world.dispose();
    this.worlds.delete(world);
  }

  /** Atmosphere of the world currently inhabited. */
  setAtmosphere(spec) {
    const { palette, atmosphere } = spec;
    const atmo = new THREE.Color(palette.atmosphere);
    this.scene.background.copy(atmo);
    this.scene.fog.color.copy(atmo);
    this.scene.fog.density = atmosphere.fogDensity;

    const sky = atmo.clone().lerp(new THREE.Color('#ffffff'), palette.light ? 0.6 : 0.75);
    const ground = atmo.clone().lerp(new THREE.Color(palette.primary), 0.5).multiplyScalar(palette.light ? 0.8 : 0.6);
    this.hemi.color.copy(sky);
    this.hemi.groundColor.copy(ground);
    this.sun.position.set(...atmosphere.light).multiplyScalar(100);
  }

  /**
   * With several worlds present, the atmosphere is a blend weighted by
   * proximity: moving toward another world gradually takes on its air.
   */
  blendAtmosphere() {
    if (this.worlds.size < 2) return;
    const anchor = new THREE.Vector3();
    let total = 0;
    const bg = new THREE.Color(0, 0, 0);
    const sky = new THREE.Color(0, 0, 0);
    const ground = new THREE.Color(0, 0, 0);
    let density = 0;
    for (const w of this.worlds) {
      w.group.localToWorld(anchor.set(...w.spec.entry.target));
      const d = Math.max(10, anchor.distanceTo(this.camera.position));
      const weight = 1 / (d * d * d);
      total += weight;
      bg.add(w.atmo.bg.clone().multiplyScalar(weight));
      sky.add(w.atmo.sky.clone().multiplyScalar(weight));
      ground.add(w.atmo.ground.clone().multiplyScalar(weight));
      density += w.atmo.density * weight;
    }
    this.scene.background.copy(bg.multiplyScalar(1 / total));
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.density = density / total;
    this.hemi.color.copy(sky.multiplyScalar(1 / total));
    this.hemi.groundColor.copy(ground.multiplyScalar(1 / total));
  }

  /** The world whose threshold is nearest the viewer. */
  nearestWorld() {
    let best = null;
    const anchor = new THREE.Vector3();
    for (const w of this.worlds) {
      w.group.localToWorld(anchor.set(...w.spec.entry.target));
      const d = anchor.distanceTo(this.camera.position);
      if (!best || d < best.d) best = { w, d };
    }
    return best && best.w;
  }

  render(dt) {
    this.adapt(dt);
    this.blendAtmosphere();
    for (const world of this.worlds) {
      world.update(dt);
      world.updateDetail(dt, this.camera.position);
      world.updateFrame(this.camera);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
