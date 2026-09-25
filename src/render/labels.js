import * as THREE from 'three';

const FONT = '500 64px "Helvetica Neue", Helvetica, Arial, sans-serif';

/** A heading drawn onto an architectural surface. Returns a plane mesh `h` units tall. */
export function createLabel(text, h, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const content = text.toUpperCase();
  ctx.font = FONT;
  const spacing = 10;
  const width = Math.ceil(measure(ctx, content, spacing)) + 24;
  canvas.width = Math.min(4096, width);
  canvas.height = 96;

  ctx.font = FONT;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  let x = 12;
  for (const ch of content) {
    ctx.fillText(ch, x, canvas.height / 2);
    x += ctx.measureText(ch).width + spacing;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, depthWrite: false });
  const geometry = new THREE.PlaneGeometry((canvas.width / canvas.height) * h, h);
  return new THREE.Mesh(geometry, material);
}

function measure(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w;
}
