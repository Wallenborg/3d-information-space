// Generative design system.
//
// Normalized model + metrics + parameters → a spatial specification:
// a plain list of architectural elements (no three.js here).
//
// Structure of the composition:
//  - the lead becomes the threshold of the world, marked by a title monolith
//  - top-level sections form a spine whose path (ring, helix, meander, tower)
//    emerges from rhythm, asymmetry, verticality and seeded turn
//  - each section becomes a cluster whose arrangement (corridor, tower, ring,
//    scatter) is chosen from local structure weighted by global tendencies
//  - paragraphs become panels carrying (future) text surfaces
//  - subsections branch off their parent, rising or hanging, joined by bridges
//  - images reserve suspended frames with their own aspect ratio

import { createRng } from './random.js';
import { deriveParameters, arrangementTendencies } from './parameters.js';
import { derivePalette } from './palette.js';
import { TAU, add, clamp, direction, faceYaw, lerp, norm, rotateY, scale } from './math.js';

// Distance at which the composition starts to pack itself more tightly (soft, not a cap).
const SOFT_EXTENT = 260;

export function designWorld(model, metrics) {
  const rng = createRng(model.title);
  const params = deriveParameters(metrics, rng.fork('parameters'));
  const palette = derivePalette(metrics, params, rng.fork('palette'));
  const composer = new Composer(model, metrics, params, rng.fork('composition'));
  composer.compose();

  return {
    title: model.title,
    palette,
    params,
    elements: composer.elements,
    clusters: composer.clusters,
    entry: composer.entry,
    extent: composer.extent(),
    atmosphere: {
      fogDensity: params.fogDensity,
      light: direction(rng.fork('light').range(0, TAU), 0.9),
    },
  };
}

class Composer {
  constructor(model, metrics, params, rng) {
    this.model = model;
    this.m = metrics;
    this.p = params;
    this.rng = rng;
    this.sections = new Map(model.sections.map((s) => [s.id, s]));
    this.paragraphs = new Map(model.paragraphs.map((p) => [p.id, p]));
    this.images = new Map(model.images.map((i) => [i.id, i]));
    this.elements = [];
    this.clusters = [];
    this.entry = null;

    // Links: a separate random stream, so realizing links never reshapes the architecture.
    this.links = new Map(model.links.map((l) => [l.id, l]));
    this.linkRng = rng.fork('links');
    this.linkFrequency = new Map();
    for (const l of model.links) this.linkFrequency.set(l.target, (this.linkFrequency.get(l.target) || 0) + 1);
    this.realized = new Set();
    // How many links become spatial arms: open, uncompressed worlds extend further outward.
    const reach = 0.5 * params.openness + 0.5 * (1 - params.compression);
    this.linkBudget = Math.round(clamp(metrics.uniqueLinkCount * lerp(0.06, 0.2, reach), 10, 110));
    this.linkProbability = this.linkBudget / Math.max(1, model.links.length);
    this.linkStyle = this.linkRng.weighted({
      rod: params.fragmentation + 0.4,
      blade: params.compression + 0.2,
      dashed: params.rhythm * 0.9,
    });
  }

  compose() {
    const { p, rng } = this;
    const sequence = this.model.rootSectionIds.map((id) => this.sections.get(id));

    let yaw = rng.range(0, TAU);
    let position = [0, 0, 0];
    let previousRadius = 0;

    sequence.forEach((section, i) => {
      const local = this.buildLocal(section, 1);
      const title = section.isLead ? this.inscribeTitle(local, section) : null;

      if (i > 0) {
        yaw += p.turn + rng.range(-1, 1) * p.asymmetry * 0.9;
        const pitch = clamp(p.climb + rng.range(-1, 1) * p.fragmentation * 0.7, -1.1, 1.1);
        let gap = (previousRadius + local.radius) * p.spacing;
        if (rng.chance(p.fragmentation * 0.3)) gap *= rng.range(1.4, 2.4); // ruptures in the sequence
        // Soft limit: the further the sequence has travelled, the tighter it packs.
        gap /= 1 + Math.hypot(...position) / SOFT_EXTENT;
        position = add(position, scale(direction(yaw, pitch), gap));
      }

      const frameYaw = yaw + (p.rhythm < 0.4 ? rng.range(-0.7, 0.7) : 0);
      this.place(local, position, frameYaw, section, 1);
      this.placeChildren(section, local, position, frameYaw, 2);

      if (title) {
        // Approach the inscribed title from the direction it faces, slightly off-axis.
        const n = rotateY(title.n, frameYaw);
        const at = add(position, rotateY(title.p, frameYaw));
        const side = [-n[2], 0, n[0]];
        const dist = clamp(title.width * 1.2, 9, 32);
        const eye = add(add(add(at, scale(n, dist)), scale(side, dist * 0.25 * rng.sign())), [0, 1.2, 0]);
        this.entry = { position: eye, target: at, title: title.kind };
      }
      previousRadius = local.radius;
    });
  }

  /**
   * Subsections accrete onto their parent as a wing: each one adjacent to the
   * previous, the wing curling with twist and rising or hanging with verticality.
   * Hierarchy reads as growth of the structure, not as spokes from a hub.
   */
  placeChildren(section, parentLocal, parentPos, parentYaw, depth) {
    const { p, rng } = this;
    const kids = section.children.map((id) => this.sections.get(id));
    if (!kids.length) return;

    const side = p.rhythm > 0.5 ? (section.order % 2 ? 1 : -1) * (depth % 2 ? 1 : -1) : rng.sign();
    const vSign = rng.chance(p.lift) ? 1 : -1;
    let yaw = parentYaw + side * (Math.PI / 2) * lerp(1, 0.55, p.asymmetry);
    const pitch = vSign * lerp(0.05, 1.35, p.verticality);
    // Soft limit: long wings coil into helices instead of running off into the distance.
    const coil = kids.length > 8 ? TAU / Math.min(kids.length, 14) : 0;
    const curl = Math.sign(p.twist || 1) * Math.max(Math.abs(p.twist * lerp(0.15, 0.6, p.fragmentation)), coil);
    const wingPitch = coil ? pitch * 0.35 : pitch;

    let prevPos = parentPos;
    let prevRadius = parentLocal.radius;

    kids.forEach((child) => {
      const local = this.buildLocal(child, depth);
      const reach = (prevRadius + local.radius) * lerp(0.95, 0.65, p.compression) / (1 + Math.hypot(...prevPos) / (SOFT_EXTENT * 1.5));
      const position = add(prevPos, scale(direction(yaw, wingPitch + rng.range(-1, 1) * p.fragmentation * 0.35), reach));
      const childYaw = yaw - side * (Math.PI / 2) * lerp(1, 0.3, 1 - p.rhythm) + rng.range(-0.4, 0.4) * p.asymmetry;

      this.place(local, position, childYaw, child, depth);

      // A short structural joint between neighbours in the wing.
      const thickness = lerp(0.35, 0.9, p.compression);
      this.elements.push({
        type: 'beam',
        mat: 'primary',
        a: prevPos,
        b: position,
        w: thickness * lerp(2.5, 7, 1 - p.verticality),
        h: thickness,
      });

      this.placeChildren(child, local, position, childYaw, depth + 1);

      yaw += curl + rng.range(-0.25, 0.25) * p.asymmetry;
      prevPos = position;
      prevRadius = local.radius;
    });
  }

  // ---------------------------------------------------------------- cluster

  buildLocal(section, depth) {
    const L = new LocalBuilder();
    const units = this.unitsFor(section);
    const panels = units.map((u) => this.panelDims(u, depth));
    const arrangement = panels.length ? this.chooseArrangement(section, panels, depth) : 'void';

    this[arrangement](L, panels, section);

    const box = L.bounds();
    const radius = Math.max(3, box.radius);
    this.addMassing(L, radius, box, section);
    this.addImages(L, section, radius, box);
    this.addHeading(L, section, depth);

    const final = L.bounds();
    return { elements: L.elements, arrangement, radius: Math.max(3, final.radius), height: final.maxY - final.minY, units: units.length };
  }

  unitsFor(section) {
    const paras = section.paragraphIds.map((id) => this.paragraphs.get(id));
    let minWords = lerp(90, 35, this.p.fragmentation);
    let units = groupParagraphs(paras, minWords);
    while (units.length > 18) {
      minWords *= 1.5;
      units = groupParagraphs(paras, minWords);
    }
    return units;
  }

  panelDims(unit, depth) {
    const { p, rng } = this;
    const area = clamp(unit.words * lerp(0.06, 0.11, p.openness) * p.grain * lerp(1, 0.8, norm(depth, 1, 4)), 2.5, 42);
    let aspect = lerp(2.2, 0.55, p.verticality) * rng.range(0.8, 1.25);
    if (unit.kind === 'list') aspect *= 0.65;
    const w = Math.sqrt(area * aspect);
    return {
      w,
      h: area / w,
      t: lerp(0.2, 1.3, p.compression) * rng.range(0.7, 1.3),
      linkiness: (unit.links / Math.max(1, unit.words)) * 100,
      unit,
    };
  }

  chooseArrangement(section, panels, depth) {
    const { p, rng } = this;
    const n = panels.length;
    const meanWords = panels.reduce((s, d) => s + d.unit.words, 0) / n;
    const w = arrangementTendencies(p);
    w.corridor += norm(n, 3, 12) * 0.6;
    w.tower += norm(depth, 1, 3) * 0.3;
    w.ring += norm(meanWords, 60, 180) * 0.4;
    if (n <= 2) { w.ring *= 0.2; w.corridor *= 0.5; }
    w[p.dominant] *= 1 + 1.8 * p.coherence;
    return rng.weighted(w);
  }

  // ----------------------------------------------------------- arrangements

  corridor(L, panels) {
    const { p, rng } = this;
    const half = lerp(4.2, 1.8, p.compression) * lerp(0.9, 1.3, p.openness);
    const cursor = { '-1': 0, 1: 0 };
    const placed = [];
    let maxH = 0;
    let maxT = 0;
    let minY = Infinity;

    panels.forEach((d, i) => {
      const side = p.rhythm > 0.5 ? (i % 2 ? 1 : -1) : rng.sign();
      const gap = lerp(0.3, 2.8, p.openness) * (p.rhythm > 0.5 ? 1 : rng.range(0.4, 1.8));
      const drift = rng.range(-1, 1) * p.fragmentation * 2.5;
      const y = d.h / 2 + i * p.verticality * 0.35 + drift;
      placed.push({ d, p: [cursor[side] + d.w / 2, y, side * (half + d.t / 2)], ry: side > 0 ? Math.PI : 0 });
      cursor[side] += d.w + gap;
      maxH = Math.max(maxH, y + d.h / 2);
      maxT = Math.max(maxT, d.t);
      minY = Math.min(minY, y - d.h / 2);
    });

    const length = Math.max(cursor[-1], cursor[1]);
    const shift = -length / 2;
    placed.forEach(({ d, p: pos, ry }) => this.addPanel(L, d, [pos[0] + shift, pos[1], pos[2]], ry));

    // Repeated frames articulate the corridor's rhythm.
    const H = maxH + lerp(1, 3, p.verticality);
    const outer = half + maxT + 0.6;
    const col = lerp(0.3, 0.9, p.compression);
    if (p.rhythm > 0.3 || p.compression > 0.5) {
      const step = lerp(9, 3.5, p.rhythm);
      for (let x = 0; x <= length + 0.01; x += step) {
        const fx = x + shift;
        L.box('primary', [fx, (H + minY) / 2, -outer], [col, H - minY, col]);
        L.box('primary', [fx, (H + minY) / 2, outer], [col, H - minY, col]);
        L.box('primary', [fx, H, 0], [col, col, outer * 2 + col]);
      }
    }
    if (p.compression > 0.55 && p.openness < 0.65) {
      L.box('primary', [0, minY - 0.3, 0], [length + 2, 0.4, outer * 2 + 1]);
      if (p.compression > 0.78) L.box('primary', [0, H + 0.6, 0], [length + 2, 0.4, outer * 2 + 1]);
    }
  }

  tower(L, panels) {
    const { p, rng } = this;
    const r0 = lerp(2.6, 5.5, p.openness);
    const step = p.twist * lerp(0.5, 2.2, 1 - p.rhythm) + (p.rhythm > 0.6 ? Math.PI / 2 : 0);
    const plateEvery = Math.max(2, Math.round(lerp(5, 2, p.rhythm)));
    const placed = [];
    const plates = [];
    let angle = rng.range(0, TAU);
    let y = 0;

    panels.forEach((d, i) => {
      angle += step;
      const r = r0 + d.t / 2 + p.fragmentation * rng.range(0, 2);
      placed.push({ d, p: [Math.cos(angle) * r, y + d.h / 2, Math.sin(angle) * r], ry: faceYaw(Math.cos(angle), Math.sin(angle)) });
      if (p.compression > 0.4 && i % plateEvery === 0) plates.push({ y: y - 0.2, ry: angle });
      y += d.h * lerp(0.4, 1.02, p.compression) + lerp(0.2, 1.6, p.openness);
    });

    const shift = -y / 2;
    placed.forEach(({ d, p: pos, ry }) => this.addPanel(L, d, [pos[0], pos[1] + shift, pos[2]], ry));
    const core = lerp(0.8, r0 * 1.2, 1 - p.openness);
    L.box('primary', [0, 0, 0], [core, y + 2, core]);
    const span = (r0 + 2.2) * 2;
    plates.forEach((pl) => L.box('primary', [0, pl.y + shift, 0], [span, 0.3, span], pl.ry));
  }

  ring(L, panels) {
    const { p, rng } = this;
    const gap = lerp(0.4, 3, p.openness);
    const circumference = panels.reduce((s, d) => s + d.w + gap, 0);
    const rr = Math.max(4, circumference / TAU);
    const amp = p.fragmentation * 3 + p.verticality * 4;
    const freq = rng.int(1, 3);
    let angle = rng.range(0, TAU);
    let maxH = 0;

    panels.forEach((d) => {
      const da = (d.w + gap) / rr;
      angle += da / 2;
      const y = d.h / 2 + (p.rhythm > 0.55 ? 0 : Math.sin(angle * freq) * amp);
      this.addPanel(L, d, [Math.cos(angle) * rr, y, Math.sin(angle) * rr], faceYaw(-Math.cos(angle), -Math.sin(angle)));
      maxH = Math.max(maxH, y + d.h / 2);
      angle += da / 2;
    });

    if (p.openness < 0.45) {
      L.box('primary', [0, maxH * 0.4, 0], [rr * 0.7, maxH * 1.4, rr * 0.7], rng.range(0, TAU));
    } else {
      // An empty suspended frame marks the void at the centre.
      const s = rr * 0.8;
      const y = maxH + 3;
      const t = 0.25;
      L.box('accent', [0, y, -s / 2], [s, t, t]);
      L.box('accent', [0, y, s / 2], [s, t, t]);
      L.box('accent', [-s / 2, y, 0], [t, t, s]);
      L.box('accent', [s / 2, y, 0], [t, t, s]);
    }
  }

  scatter(L, panels) {
    const { p, rng } = this;
    const R = lerp(5, 9, p.openness) + Math.sqrt(panels.length) * 3;
    panels.forEach((d) => {
      const a = rng.range(0, TAU);
      const r = R * Math.sqrt(rng.next());
      const y = rng.range(-1, 1) * R * lerp(0.2, 0.8, p.verticality);
      this.addPanel(L, d, [Math.cos(a) * r, y, Math.sin(a) * r], rng.range(0, TAU));
    });
    const fragments = Math.round(panels.length * p.fragmentation * 1.6);
    for (let i = 0; i < fragments; i++) {
      const a = rng.range(0, TAU);
      const r = R * 1.1 * Math.sqrt(rng.next());
      const s = rng.range(0.2, 1.6);
      L.box('primary', [Math.cos(a) * r, rng.range(-1, 1) * R * 0.6, Math.sin(a) * r], [s, s * rng.range(0.3, 3), s * rng.range(0.3, 1)], rng.range(0, TAU));
    }
  }

  /** A section without prose: an empty frame, a placeholder of structure. */
  void(L) {
    const s = 3;
    const t = 0.22;
    L.box('primary', [0, s, 0], [t, t, s * 2]);
    L.box('primary', [0, -s, 0], [t, t, s * 2]);
    L.box('primary', [0, 0, s], [t, s * 2, t]);
    L.box('primary', [0, 0, -s], [t, s * 2, t]);
  }

  // ---------------------------------------------------------------- details

  addPanel(L, d, pos, ry) {
    const { p, rng } = this;
    const normal = [Math.sin(ry), 0, Math.cos(ry)];
    const right = [Math.cos(ry), 0, -Math.sin(ry)];

    // Paragraphs far more linked than the article average become porous.
    const porous = d.linkiness > this.m.linkDensity * 1.5 && p.fragmentation + p.openness > 0.8 && d.w > 2.5;
    if (porous) {
      const n = rng.int(2, 3);
      const gap = 0.3;
      const strip = (d.w - gap * (n - 1)) / n;
      for (let k = 0; k < n; k++) {
        const offset = -d.w / 2 + strip / 2 + k * (strip + gap);
        L.box('secondary', add(pos, scale(right, offset)), [strip, d.h, d.t], ry);
      }
    } else {
      L.box('secondary', pos, [d.w, d.h, d.t], ry);
    }

    L.push({
      type: 'surface',
      p: add(pos, scale(normal, d.t / 2 + 0.03)),
      s: [d.w * 0.88, d.h * 0.84],
      ry,
      paragraphIds: d.unit.paragraphIds,
      // Plain text for the renderer: one entry per paragraph, list items on separate lines.
      text: d.unit.paragraphIds.map((id) => {
        const para = this.paragraphs.get(id);
        const links = para.linkIds.map((lid) => this.links.get(lid)).map((l) => ({ target: l.target, label: l.label }));
        return { kind: para.kind, text: para.text, links };
      }),
      caption: this.sections.get(this.paragraphs.get(d.unit.paragraphIds[0]).sectionId).title,
    });

    this.addLinks(L, d, pos, normal, right);
  }

  /**
   * Hyperlinks as arms: a structural extension leaving the edge of the panel
   * that holds the text, bending outward and running into the fog, ending in
   * an aperture toward a space that does not exist yet.
   * Only some links are realized; the rest remain potential (still readable in the text).
   */
  addLinks(L, d, pos, normal, right) {
    const { p } = this;
    const lr = this.linkRng;
    const occurrences = d.unit.paragraphIds.flatMap((id) => this.paragraphs.get(id).linkIds.map((lid) => this.links.get(lid)));
    if (!occurrences.length) return;

    const expected = occurrences.length * this.linkProbability;
    let k = Math.floor(expected) + (lr.next() < expected % 1 ? 1 : 0);
    const seen = new Set();
    const candidates = occurrences
      // Unit symbols and abbreviations (e.g. "μm") stay in the text; they don't earn an arm.
      .filter((l) => l.target.length > 3 && !this.realized.has(l.target) && !seen.has(l.target) && seen.add(l.target))
      .sort((a, b) => this.linkFrequency.get(b.target) - this.linkFrequency.get(a.target));
    k = Math.min(k, 4, candidates.length, this.linkBudget - this.realized.size);

    const flat = Math.hypot(pos[0], pos[2]);
    const outward = flat > 0.5 ? [pos[0] / flat, 0, pos[2] / flat] : normal;

    for (let i = 0; i < k; i++) {
      const link = candidates[i];
      this.realized.add(link.target);
      const side = lr.sign();
      const anchor = add(add(pos, scale(right, (side * d.w) / 2)), [0, lr.range(-0.35, 0.35) * d.h, 0]);
      const elbow = add(anchor, scale(right, side * lerp(0.8, 3, p.openness) * lr.range(0.6, 1.4)));
      const tilt = lr.range(-1, 1) * lerp(0.25, 1.1, p.verticality) + p.climb * 0.4;
      const raw = add(add(add(scale(normal, 0.4), scale(outward, 0.6)), scale(right, side * 0.3)), [0, tilt, 0]);
      const len = Math.hypot(...raw) || 1;
      const dir = scale(raw, 1 / len);
      const end = add(elbow, scale(dir, lr.range(45, 130) * lerp(0.85, 1.35, p.openness)));
      L.push({
        type: 'link',
        target: link.target,
        label: link.label,
        points: [anchor, elbow, end],
        style: this.linkStyle,
        thickness: lerp(0.06, 0.16, p.compression),
      });
    }
  }

  addMassing(L, radius, box) {
    const { p, rng } = this;
    const count = Math.round(lerp(3.2, 0, p.openness) * lerp(0.5, 1.5, p.asymmetry) * rng.range(0.6, 1.2));
    const height = Math.max(2, box.maxY - box.minY);
    const midY = (box.maxY + box.minY) / 2;

    for (let k = 0; k < count; k++) {
      const horizontal = !rng.chance(p.verticality);
      const thick = lerp(0.6, 2.2, p.compression);
      const size = horizontal
        ? [rng.range(0.4, 1) * radius * 1.2, rng.range(0.4, 1.6) * thick, rng.range(0.3, 0.9) * radius]
        : [rng.range(0.8, 2.5) * thick, rng.range(0.5, 1.3) * Math.max(height, radius), rng.range(0.3, 0.8) * radius];
      const a = rng.range(0, TAU);
      const dist = horizontal ? radius * rng.range(0, 0.5) : radius * rng.range(0.8, 1.2);
      const y = horizontal
        ? midY + rng.sign() * (height / 2 + size[1] / 2 + rng.range(0.6, 3))
        : midY + rng.range(-0.3, 0.3) * height;
      const ry = p.rhythm > 0.5 ? Math.round(a / (Math.PI / 2)) * (Math.PI / 2) : rng.range(0, Math.PI);
      L.box('primary', [Math.cos(a) * dist, y, Math.sin(a) * dist], size, ry);
    }
  }

  addImages(L, section, radius, box) {
    const { p, rng } = this;
    const midY = (box.maxY + box.minY) / 2;
    const height = Math.max(2, box.maxY - box.minY);

    section.imageIds.slice(0, 4).forEach((id) => {
      const img = this.images.get(id);
      const aspect = clamp(img.width / img.height, 0.4, 2.6);
      const h = lerp(2.2, 4.5, p.openness) * rng.range(0.85, 1.2);
      const w = h * aspect;
      const a = rng.range(0, TAU);
      const dist = radius * rng.range(0.55, 0.95) + 1.5;
      const pos = [Math.cos(a) * dist, midY + rng.range(-0.5, 0.8) * height * 0.6, Math.sin(a) * dist];
      const ry = faceYaw(-pos[0], -pos[2]);
      const right = [Math.cos(ry), 0, -Math.sin(ry)];
      const f = 0.12;

      L.push({ type: 'image', p: pos, s: [w, h], ry, imageId: id, src: img.large || img.src, caption: img.caption });
      L.box('accent', add(pos, [0, h / 2 + f / 2, 0]), [w + 2 * f, f, f], ry);
      L.box('accent', add(pos, [0, -h / 2 - f / 2, 0]), [w + 2 * f, f, f], ry);
      L.box('accent', add(pos, scale(right, -w / 2 - f / 2)), [f, h, f], ry);
      L.box('accent', add(pos, scale(right, w / 2 + f / 2)), [f, h, f], ry);
    });
  }

  addHeading(L, section, depth) {
    if (section.isLead) return; // the lead is named by the inscribed title
    const box = L.bounds();
    const h = lerp(0.95, 0.5, norm(depth, 1, 3));
    const x = box.minX - 1.4;
    const y = clamp((box.minY + box.maxY) / 2 + 1.5, box.minY + h, box.maxY + h);
    const width = section.title.length * 0.66 * h;
    L.push({ type: 'label', text: section.title, p: [x, y, 0], h, ry: -Math.PI / 2 });
    L.box('accent', [x + 0.05, y - h * 0.8, 0], [0.14, 0.14, width + 0.6], 0);
  }

  /**
   * The article title is inscribed onto whichever generated mass of the lead
   * best faces the approach — a tower core, a drum, a slab — so where and how
   * large it appears depends on the architecture that emerged. If nothing
   * suitable exists, it falls back to a heading at the threshold.
   * Returns the title's local position, facing normal and width.
   */
  inscribeTitle(local, section) {
    const text = section.title;
    const charWidth = 0.56; // label width per character, in label heights
    let best = null;

    for (const e of local.elements) {
      if (e.type !== 'box' || e.mat !== 'primary') continue;
      const [w, h, d] = e.s;
      const ry = e.ry || 0;
      const s = Math.sin(ry);
      const c = Math.cos(ry);
      const faces = [
        { n: [s, 0, c], width: w, depth: d },
        { n: [-s, 0, -c], width: w, depth: d },
        { n: [c, 0, -s], width: d, depth: w },
        { n: [-c, 0, s], width: d, depth: w },
      ];
      for (const f of faces) {
        const facing = -f.n[0]; // toward the approach (local −x)
        if (facing < 0.3) continue;
        const labelH = Math.min(h * 0.28, 2.4, (f.width * 0.85) / (text.length * charWidth + 0.3));
        if (labelH < 0.45) continue;
        const score = labelH * (0.5 + facing);
        if (!best || score > best.score) best = { e, f, labelH, score };
      }
    }

    if (best) {
      const { e, f, labelH } = best;
      const p = add(e.p, scale(f.n, f.depth / 2 + 0.04));
      p[1] = e.p[1] + e.s[1] / 2 - labelH * 1.6;
      local.elements.push({ type: 'label', text, p, h: labelH, ry: faceYaw(f.n[0], f.n[2]), title: true });
      return { p, n: f.n, width: text.length * charWidth * labelH, kind: 'inscribed' };
    }

    // No suitable mass: the title gets its own lintel at the threshold, built in
    // the world's vocabulary — suspended in irregular worlds, a framed gateway in rhythmic ones.
    const { p: params } = this;
    const L = new LocalBuilder(local.elements);
    const box = L.bounds();
    const h = clamp(14 / (text.length * charWidth), 0.8, 1.6);
    const width = text.length * charWidth * h;
    const depth = lerp(0.35, 1.4, params.compression);
    const slabH = h * lerp(1.9, 2.6, params.compression);
    const x = box.minX - 2 - depth / 2;
    const y = (box.minY + box.maxY) / 2 + lerp(1, 4, params.verticality);
    const span = width + lerp(1, 4, params.openness);
    L.box('primary', [x, y, 0], [depth, slabH, span]);
    if (params.rhythm > 0.5) {
      const col = lerp(0.3, 0.8, params.compression);
      const bottom = Math.min(box.minY, y - 6);
      const colH = y - slabH / 2 - bottom;
      L.box('primary', [x, bottom + colH / 2, span / 2 - col / 2], [col, colH, col]);
      L.box('primary', [x, bottom + colH / 2, -span / 2 + col / 2], [col, colH, col]);
    }
    const p = [x - depth / 2 - 0.04, y, 0];
    L.push({ type: 'label', text, p, h, ry: -Math.PI / 2, title: true });
    local.radius = Math.max(local.radius, L.bounds().radius);
    return { p, n: [-1, 0, 0], width, kind: params.rhythm > 0.5 ? 'gateway' : 'lintel' };
  }

  // -------------------------------------------------------------- placement

  place(local, center, yaw, section, depth) {
    const toWorld = (pt) => add(center, rotateY(pt, yaw));
    for (const e of local.elements) {
      const world = { ...e, sectionId: section.id };
      if (e.type === 'beam') {
        world.a = toWorld(e.a);
        world.b = toWorld(e.b);
      } else if (e.type === 'link') {
        world.points = e.points.map(toWorld);
      } else {
        world.p = toWorld(e.p);
        world.ry = (e.ry || 0) + yaw;
      }
      this.elements.push(world);
    }
    this.clusters.push({
      sectionId: section.id,
      title: section.title,
      depth,
      arrangement: local.arrangement,
      units: local.units,
      center,
      radius: local.radius,
    });
  }

  extent() {
    let max = 0;
    for (const e of this.elements) {
      if (e.type === 'link') continue; // links reach into the fog by design
      const pt = e.p || e.a;
      max = Math.max(max, Math.hypot(pt[0], pt[1], pt[2]));
    }
    return max;
  }
}

class LocalBuilder {
  constructor(elements = []) {
    this.elements = elements;
  }

  push(e) {
    this.elements.push(e);
  }

  box(mat, p, s, ry = 0) {
    this.elements.push({ type: 'box', mat, p, s, ry });
  }

  bounds() {
    const b = { minX: 0, maxX: 0, minY: 0, maxY: 0, radius: 0 };
    for (const e of this.elements) {
      if (!e.p) continue;
      const w = e.s ? Math.max(e.s[0], e.s[2] || 0) / 2 : e.h ? e.text.length * 0.33 * e.h : 0;
      const h = e.s ? e.s[1] / 2 : e.h || 0;
      b.minX = Math.min(b.minX, e.p[0] - w);
      b.maxX = Math.max(b.maxX, e.p[0] + w);
      b.minY = Math.min(b.minY, e.p[1] - h);
      b.maxY = Math.max(b.maxY, e.p[1] + h);
      b.radius = Math.max(b.radius, Math.hypot(e.p[0], e.p[2]) + w);
    }
    return b;
  }
}

function groupParagraphs(paragraphs, minWords) {
  const units = [];
  let current = null;
  for (const para of paragraphs) {
    if (!current) current = { paragraphIds: [], words: 0, links: 0, kind: para.kind };
    current.paragraphIds.push(para.id);
    current.words += para.words;
    current.links += para.linkIds.length;
    if (current.words >= minWords) {
      units.push(current);
      current = null;
    }
  }
  if (current) {
    if (units.length && current.words < minWords * 0.5) {
      const last = units[units.length - 1];
      last.paragraphIds.push(...current.paragraphIds);
      last.words += current.words;
      last.links += current.links;
    } else {
      units.push(current);
    }
  }
  return units;
}
