// Minimal interaction: a center-screen ray finds the element in focus.
// A tiny indicator appears only when something can be read or activated.

import * as THREE from 'three';
import { raySegmentDistance } from './linkArms.js';

const UP = new THREE.Vector3(0, 1, 0);
const REACH = 24; // text and images
const LINK_REACH = 45; // arms are thin and long; they can be picked from further away

export class Interaction {
  constructor(camera, renderer, indicator) {
    this.camera = camera;
    this.renderer = renderer;
    this.indicator = indicator;
    this.ray = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.focus = null; // { kind: 'surface' | 'link', ... }
    this.highlighted = null;
    this.lastText = undefined;
    this.onLink = null; // (target, arm) => void
    this.onNote = null; // (text) => void — e.g. an image caption revealed by a tap
    this.every = 1; // run the centre-focus pick every n frames (mobile budget)
    this.frame = 0;
  }

  update(enabled) {
    if (enabled && this.every > 1 && this.frame++ % this.every) return;
    this.focus = null;
    if (enabled) this.focus = this.pick();
    this.highlight(this.focus && this.focus.kind === 'link' ? this.focus : null);
    this.render();
  }

  /**
   * Touch: interact with whatever is under the finger (NDC coordinates).
   * Thin link arms get a wider tolerance so they stay easy to hit.
   */
  tapAt(ndcX, ndcY) {
    const saved = this.center.clone();
    this.center.set(ndcX, ndcY);
    const f = this.pick(2.4);
    this.center.copy(saved);
    if (!f) return false;
    this.focus = f;
    if (this.activate()) return true;
    // Nothing to activate (an image, single-page text): reveal what it is instead.
    const note = f.kind === 'surface' ? f.target.describe(f.uv) : null;
    if (note) this.onNote?.(note);
    return Boolean(note);
  }

  pick(tolerance = 1) {
    this.ray.setFromCamera(this.center, this.camera);
    this.ray.far = Math.max(REACH, LINK_REACH);
    const targets = [];
    for (const world of this.renderer.worlds) targets.push(...world.interactive, ...world.occluders);
    const hit = this.ray.intersectObjects(targets, false)[0];
    const hitDistance = hit ? hit.distance : Infinity;

    // Link arms: closest approach of the view ray, with tolerance growing with distance.
    let best = null;
    const origin = this.ray.ray.origin;
    const dir = this.ray.ray.direction;
    for (const world of this.renderer.worlds) {
      const o = world.group.worldToLocal(origin.clone());
      const d = dir.clone().applyAxisAngle(UP, -world.group.rotation.y); // worlds may be rotated about Y
      for (const link of world.links) {
        for (const [a, b] of link.segments) {
          const { distance, t } = raySegmentDistance(o, d, a, b);
          if (t > LINK_REACH || t > hitDistance) continue; // too far, or hidden behind architecture/text
          const score = distance / (0.3 + t * 0.03);
          if (score < tolerance && (!best || score < best.score)) best = { kind: 'link', world, link, score, t };
        }
      }
    }
    const surface = hit && hit.distance < REACH && hit.object.userData.interactive
      ? { kind: 'surface', target: hit.object.userData.interactive, uv: hit.uv }
      : null;
    // Reading wins over an arm passing at the same depth (arms leave from panel edges).
    if (best && !(surface && hitDistance <= best.t + 0.6)) return best;
    return surface;
  }

  highlight(focus) {
    const h = this.highlighted;
    if (h && (!focus || h.link !== focus.link)) {
      h.world.highlightLink(h.link, false);
      this.highlighted = null;
    }
    if (focus && !this.highlighted) {
      focus.world.highlightLink(focus.link, true);
      this.highlighted = focus;
    }
  }

  /** Click: activate the focused element. */
  activate() {
    const f = this.focus;
    if (!f) return false;
    if (f.kind === 'link') {
      // Where the arm ends, in world space: the new world will grow beyond it.
      const g = f.world.group;
      const end = g.localToWorld(f.link.segments[1][1].clone());
      const dir = f.link.dir.clone().applyAxisAngle(UP, g.rotation.y).normalize();
      this.onLink?.(f.link.target, { end, dir });
      return true;
    }
    const result = f.target.activateAt(f.uv);
    if (result && result.link) this.onLink?.(result.link, null);
    this.lastText = undefined; // refresh indicator
    return Boolean(result);
  }

  turn(direction) {
    const f = this.focus;
    if (!f || f.kind !== 'surface' || !f.target.turn) return false;
    const changed = f.target.turn(direction);
    this.lastText = undefined;
    return changed;
  }

  describe() {
    const f = this.focus;
    if (!f) return null;
    if (f.kind === 'link') return `→ ${f.link.target}`;
    return f.target.describe(f.uv);
  }

  render() {
    const text = this.describe();
    if (text === this.lastText) return;
    this.lastText = text;
    this.indicator.classList.toggle('hidden', !text);
    this.indicator.querySelector('.focus-text').textContent = text || '';
  }
}
