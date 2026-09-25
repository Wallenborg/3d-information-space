// Metrics → generative parameters.
//
// Each parameter is a spatial *tendency* produced by several informational
// characteristics interacting (plus a seeded article-specific value).
// No parameter is a direct one-to-one mapping of a single metric.

import { TAU, clamp01, contrast, lerp, norm } from './math.js';

export function deriveParameters(m, rng) {
  const seed = () => rng.next();

  // Normalized descriptors (0..1). Intermediate values, not spatial yet.
  // Ranges are calibrated to roughly the 10th–90th percentile of real articles,
  // so typical articles spread across the range and outliers saturate.
  const depth = norm(m.maxDepth, 1.5, 3.5);
  const branching = norm(m.branching, 1, 4.5);
  const linkiness = norm(m.linkDensity, 3, 8);
  const imagery = norm(m.imageDensity, 1, 5.5);
  const paragraphLength = norm(m.paragraphWords.mean, 55, 115);
  const size = norm(Math.log10(Math.max(m.words, 10)), 3.3, 4.15); // ~2 000 … ~14 000 words
  const breadth = norm(m.sectionCount, 4, 12);
  const inequality = norm(m.sectionWords.gini, 0.25, 0.6);
  const paragraphVariation = norm(m.paragraphWords.cv, 0.4, 0.8);
  const linkUnevenness = norm(m.linkDistribution.gini, 0.2, 0.5);
  const leadWeight = norm(m.leadRatio, 0.02, 0.11);
  const listiness = norm(m.listRatio, 0, 0.3);

  // Deep, branching, narrow articles rise (or hang); broad flat ones spread out.
  const verticality = contrast(0.3 * depth + 0.25 * branching + 0.2 * (1 - breadth) + 0.25 * seed(), 1.5);

  // Densely linked, short-paragraph, long articles compress.
  const compression = contrast(0.32 * linkiness + 0.28 * (1 - paragraphLength) + 0.15 * size + 0.1 * listiness + 0.15 * seed(), 1.5);

  // Image-rich, uncompressed articles with a substantial lead open up.
  const openness = contrast(0.38 * imagery + 0.27 * (1 - compression) + 0.15 * leadWeight + 0.2 * seed(), 1.5);

  // Many flat sections, uneven paragraphs and unevenly distributed links fragment.
  const fragmentation = contrast(0.28 * paragraphVariation + 0.27 * breadth * (1 - depth * 0.5) + 0.2 * linkUnevenness + 0.25 * seed(), 1.7);

  // Uneven section sizes produce asymmetry.
  const asymmetry = contrast(0.5 * inequality + 0.2 * linkUnevenness + 0.3 * seed(), 1.5);

  // Regularity: evenly sized sections and paragraphs produce repetition.
  const rhythm = contrast(1 - (0.45 * inequality + 0.3 * paragraphVariation + 0.25 * seed()), 1.5);

  const twistSign = rng.sign();
  const twist = twistSign * (0.15 + 0.85 * clamp01(0.45 * asymmetry + 0.3 * fragmentation + 0.25 * seed()));

  // Whether hierarchy rises above its parent or hangs below it.
  const lift = clamp01(lerp(0.5, 0.88, verticality) * (seed() < 0.3 ? 0.35 : 1));

  // Spine behaviour: regular articles close into rings/helices, irregular ones meander.
  const sequenceLength = Math.max(3, m.sectionCount + 1);
  const turn = twistSign * (TAU / sequenceLength) * lerp(0.2, 1.1, rhythm) * lerp(0.6, 1.4, seed());
  const climb = (verticality - 0.35) * lerp(0.4, 1.1, depth) * (seed() < 0.25 ? -1 : 1);

  const spacing = lerp(1.15, 0.7, compression) * lerp(0.9, 1.15, openness);
  const grain = lerp(1.25, 0.65, compression);

  // Dominant spatial arrangement for the whole world (sections may deviate).
  const arrangementWeights = arrangementTendencies({ verticality, compression, openness, fragmentation, asymmetry, rhythm });
  const dominant = rng.weighted(arrangementWeights);
  const coherence = lerp(0.3, 1.2, rhythm);

  return {
    verticality,
    compression,
    openness,
    fragmentation,
    asymmetry,
    rhythm,
    twist,
    lift,
    turn,
    climb,
    spacing,
    grain,
    dominant,
    coherence,
    fogDensity: lerp(0.019, 0.009, openness) * lerp(1.1, 0.85, size),
  };
}

export function arrangementTendencies(p) {
  return {
    corridor: 0.3 + p.rhythm * (1 - p.verticality) + p.compression * 0.3,
    tower: p.verticality * 1.0 + p.compression * 0.3,
    ring: p.openness * 0.9 + p.rhythm * 0.5,
    scatter: p.fragmentation * 1.2 + p.asymmetry * 0.5 - p.rhythm * 0.3,
  };
}
