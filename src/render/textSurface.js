// Text as part of the architecture: a display surface that lays out its
// paragraphs into pages and draws the current page onto a canvas texture.
// Turning the page redraws the texture; nothing about the architecture changes.

import * as THREE from 'three';

const PLANE = new THREE.PlaneGeometry(1, 1);
PLANE.userData.shared = true;
const PX_PER_UNIT = 230;
const MAX_PX = 1024;
const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export class TextSurface {
  constructor(element, palette, baseMaterial) {
    this.element = element;
    this.palette = palette;
    this.baseMaterial = baseMaterial;
    this.page = 0;
    this.pages = null; // computed on first activation
    this.canvas = null;
    this.texture = null;

    this.mesh = new THREE.Mesh(PLANE, baseMaterial);
    this.mesh.position.set(...element.p);
    this.mesh.rotation.y = element.ry || 0;
    this.mesh.scale.set(element.s[0], element.s[1], 1);
    this.mesh.userData.interactive = this;
  }

  get active() {
    return Boolean(this.texture);
  }

  get pageCount() {
    return this.pages ? this.pages.length : 0;
  }

  /** Create the texture (surface came near). */
  activate() {
    if (this.texture) return;
    const [w, h] = this.element.s;
    const ppu = Math.min(PX_PER_UNIT, MAX_PX / Math.max(w, h));
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(64, Math.round(w * ppu));
    this.canvas.height = Math.max(64, Math.round(h * ppu));
    this.layout(ppu);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh.material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.draw();
  }

  /** Release the texture (surface left behind). The page position is remembered. */
  deactivate() {
    if (!this.texture) return;
    this.texture.dispose();
    this.mesh.material.dispose();
    this.mesh.material = this.baseMaterial;
    this.texture = null;
    this.canvas = null;
  }

  turn(direction) {
    if (!this.pages || this.pages.length < 2) return false;
    this.page = (this.page + direction + this.pages.length) % this.pages.length;
    this.draw();
    return true;
  }

  /** The link word under a texture coordinate, if any. */
  linkAt(uv) {
    if (!uv || !this.hits || !this.canvas) return null;
    const x = uv.x * this.canvas.width;
    const y = (1 - uv.y) * this.canvas.height;
    const pad = this.metrics.fontPx * 0.25;
    return this.hits.find((h) => x >= h.x0 - pad && x <= h.x1 + pad && y >= h.y0 - pad && y <= h.y1 + pad) || null;
  }

  /** Describe the interaction for the focus indicator. */
  describe(uv) {
    const link = this.linkAt(uv);
    if (link) return `→ ${link.target}`;
    if (this.pageCount < 2) return null;
    return `‹ ${this.page + 1} / ${this.pageCount} ›`;
  }

  /** Click: follow a link word, otherwise turn the page. */
  activateAt(uv) {
    const link = this.linkAt(uv);
    if (link) return { link: link.target };
    return this.turn(uv && uv.x < 0.3 ? -1 : 1);
  }

  layout(ppu) {
    const [w, h] = this.element.s;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.canvas.getContext('2d');

    // Text scales gently with the surface: larger displays read from further away.
    // Narrow surfaces keep a readable measure (~25+ characters per line).
    const fontWorld = Math.max(0.09, Math.min(0.24, Math.sqrt(w * h) * 0.034, w * 0.06));
    const fontPx = fontWorld * ppu;
    const lineH = fontPx * 1.36;
    const margin = fontPx * (H > fontPx * 14 ? 1.5 : 0.9);
    const showCaption = H > lineH * 9;
    const header = showCaption ? lineH * 1.5 : 0;
    const footer = lineH * 1.3;
    const perPage = Math.max(1, Math.floor((H - margin * 2 - header - footer) / lineH));

    ctx.font = `400 ${fontPx}px ${FONT_FAMILY}`;
    const maxWidth = W - margin * 2;
    const space = ctx.measureText(' ').width;
    const lines = []; // each line is an array of words, or null for a paragraph gap
    for (const para of this.element.text) {
      for (const words of tokenize(para)) {
        if (lines.length && lines[lines.length - 1] !== null) lines.push(null);
        lines.push(...wrap(ctx, words, maxWidth, space));
      }
    }

    const pages = [];
    let current = [];
    for (const line of lines) {
      if (line === null && current.length === 0) continue; // never begin a page with a gap
      current.push(line);
      if (current.length === perPage) {
        pages.push(current);
        current = [];
      }
    }
    while (current.length && current[current.length - 1] === null) current.pop();
    if (current.length) pages.push(current);
    if (!pages.length) pages.push([]);

    this.pages = pages;
    this.page = Math.min(this.page, pages.length - 1);
    this.metrics = { fontPx, lineH, margin, header, showCaption, footer, space };
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    const { fontPx, lineH, margin, header, showCaption } = this.metrics;
    const { palette } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';

    if (showCaption && this.element.caption) {
      ctx.font = `500 ${fontPx * 0.62}px ${FONT_FAMILY}`;
      ctx.letterSpacing = `${fontPx * 0.12}px`;
      ctx.fillStyle = palette.surfaceMuted;
      ctx.fillText(this.element.caption.toUpperCase(), margin, margin + fontPx * 0.62);
      ctx.letterSpacing = '0px';
    }

    // Words that are links carry the link colour and a hairline; their boxes are kept for focusing.
    ctx.font = `400 ${fontPx}px ${FONT_FAMILY}`;
    const { space } = this.metrics;
    this.hits = [];
    this.pages[this.page].forEach((line, i) => {
      if (!line) return;
      const y = margin + header + fontPx + i * lineH;
      let x = margin;
      for (const word of line) {
        ctx.fillStyle = word.link ? palette.linkInk : palette.surfaceInk;
        ctx.fillText(word.t, x, y);
        if (word.link) {
          ctx.fillRect(x, y + fontPx * 0.14, word.w, Math.max(1, fontPx * 0.05));
          this.hits.push({ x0: x, x1: x + word.w, y0: y - fontPx, y1: y + fontPx * 0.3, target: word.link });
        }
        x += word.w + space;
      }
    });

    if (this.pages.length > 1) {
      const y = H - margin * 0.9;
      ctx.font = `500 ${fontPx * 0.8}px ${FONT_FAMILY}`;
      ctx.fillStyle = palette.surfaceMuted;
      ctx.textAlign = 'left';
      ctx.fillText('‹', margin, y);
      ctx.textAlign = 'right';
      ctx.fillText('›', W - margin, y);
      ctx.textAlign = 'center';
      ctx.fillText(`${this.page + 1} / ${this.pages.length}`, W / 2, y);
      ctx.textAlign = 'left';
    }

    if (this.texture) this.texture.needsUpdate = true;
  }
}

/**
 * Split a paragraph into blocks of words (list items become separate blocks),
 * marking each word that falls inside a link's label.
 */
function tokenize(para) {
  // Locate link labels in order of appearance.
  const ranges = [];
  let cursor = 0;
  for (const l of para.links || []) {
    const at = para.text.indexOf(l.label, cursor);
    if (at < 0) continue;
    ranges.push({ start: at, end: at + l.label.length, target: l.target });
    cursor = at + l.label.length;
  }

  const blocks = [];
  let offset = 0;
  const parts = para.kind === 'list' ? para.text.split('\n') : [para.text];
  for (const part of parts) {
    const words = para.kind === 'list' ? [{ t: '–', link: null }] : [];
    for (const m of part.matchAll(/\S+/g)) {
      const start = offset + m.index;
      const end = start + m[0].length;
      const range = ranges.find((r) => start < r.end && end > r.start);
      words.push({ t: m[0], link: range ? range.target : null });
    }
    blocks.push(words);
    offset += part.length + 1;
  }
  return blocks;
}

function wrap(ctx, words, maxWidth, space) {
  const lines = [];
  let line = [];
  let width = 0;
  for (const word of words) {
    word.w = ctx.measureText(word.t).width;
    const next = line.length ? width + space + word.w : word.w;
    if (next > maxWidth && line.length) {
      lines.push(line);
      line = [word];
      width = word.w;
    } else {
      line.push(word);
      width = next;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}
