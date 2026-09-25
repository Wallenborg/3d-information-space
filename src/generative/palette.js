// Constrained generative palette. Hue, value and saturation each emerge from
// several characteristics plus a seeded value — never from a single metric,
// never from the article's subject.

import { clamp01, norm } from './math.js';

export function derivePalette(m, p, rng) {
  const baseHue = (rng.next() * 360 + m.sectionWords.gini * 140 + m.maxDepth * 37 + p.fragmentation * 50) % 360;

  // Pale or dark atmosphere: openness, imagery and chance negotiate.
  const light = 0.35 * p.openness + 0.25 * norm(m.imageDensity, 1, 5.5) + 0.4 * rng.next() > 0.5;

  const density = clamp01(0.5 * p.compression + 0.5 * norm(m.linkDensity, 2, 10));
  const atmoSat = 0.03 + 0.14 * clamp01(0.5 * p.rhythm + 0.5 * density);

  const atmosphere = light
    ? hsl(baseHue, atmoSat, 0.76 + 0.12 * p.openness)
    : hsl(baseHue, atmoSat * 1.3, 0.05 + 0.08 * p.openness);

  const primary = hsl(
    baseHue + (rng.next() - 0.5) * 24,
    0.03 + 0.2 * p.compression,
    light ? 0.4 + 0.22 * (1 - p.compression) : 0.26 + 0.16 * p.openness,
  );

  const secondaryShift = (p.asymmetry - 0.5) * 80 + (rng.next() - 0.5) * 24;
  const secondary = hsl(baseHue + secondaryShift, 0.05 + 0.18 * p.rhythm, light ? 0.64 + 0.1 * p.openness : 0.42 + 0.12 * p.rhythm);

  const accentShift = p.fragmentation > 0.55 ? 150 + p.asymmetry * 60 : 25 + p.verticality * 50;
  const accent = hsl(baseHue + accentShift, 0.32 + 0.22 * clamp01(0.6 * density + 0.4 * p.asymmetry), light ? 0.44 : 0.58);

  const surface = hsl(baseHue + secondaryShift * 0.5, 0.04, light ? 0.95 : 0.8);
  const surfaceInk = hsl(baseHue + secondaryShift * 0.5, 0.12, 0.13);
  const surfaceMuted = hsl(baseHue + accentShift, 0.2, 0.42);
  const linkInk = hsl(baseHue + accentShift, 0.5, 0.36);
  const line = hsl(baseHue, 0.08, light ? 0.22 : 0.72);
  const ink = light ? '#1a1a18' : '#ecebe6';

  return { light, atmosphere, primary, secondary, accent, surface, surfaceInk, surfaceMuted, linkInk, line, ink, baseHue: Math.round(baseHue) };
}

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp01(s);
  l = clamp01(l);
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}
