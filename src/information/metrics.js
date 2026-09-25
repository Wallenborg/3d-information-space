// Normalized information model → descriptive metrics.
// These describe the information. They do not prescribe architecture.

export function computeMetrics(model) {
  const byId = new Map(model.sections.map((s) => [s.id, s]));
  const content = model.sections.filter((s) => !s.apparatus);
  const contentIds = new Set(content.map((s) => s.id));
  const lead = model.sections.find((s) => s.isLead);
  const top = model.rootSectionIds.map((id) => byId.get(id)).filter((s) => !s.isLead && !s.apparatus);
  const subsections = content.filter((s) => s.depth > 1);

  const contentParagraphs = model.paragraphs.filter((p) => contentIds.has(p.sectionId));
  const words = sum(contentParagraphs.map((p) => p.words));
  const allWords = sum(model.paragraphs.map((p) => p.words));

  const subtreeWords = (s) => s.words + sum(s.children.map((id) => subtreeWords(byId.get(id))));
  const topWords = top.map(subtreeWords);

  const contentLinks = model.links.filter((l) => contentIds.has(l.sectionId));
  const uniqueLinks = new Set(model.links.map((l) => l.target));

  // How unevenly links concentrate: link density per section, for sections with real text.
  const linkDensities = content.filter((s) => s.words >= 30).map((s) => (s.linkIds.length / s.words) * 100);
  const imagesPerSection = content.map((s) => s.imageIds.length);

  const listWords = sum(contentParagraphs.filter((p) => p.kind === 'list').map((p) => p.words));
  const maxDepth = Math.max(1, ...content.map((s) => s.depth));

  const largest = top.length ? top[topWords.indexOf(Math.max(...topWords))] : null;
  const smallest = top.length ? top[topWords.indexOf(Math.min(...topWords))] : null;

  return {
    words,
    allWords,
    sectionCount: top.length,
    subsectionCount: subsections.length,
    totalSections: content.length,
    apparatusSections: model.sections.length - content.length,
    maxDepth,
    branching: subsections.length / Math.max(1, top.length),
    paragraphCount: contentParagraphs.length,
    paragraphsPerSection: contentParagraphs.length / Math.max(1, content.length),
    linkCount: contentLinks.length,
    uniqueLinkCount: uniqueLinks.size,
    linkDensity: (contentLinks.length / Math.max(1, words)) * 100, // links per 100 words
    imageCount: model.images.length,
    imageDensity: (model.images.length / Math.max(1, words)) * 1000, // images per 1000 words
    imageSpread: imagesPerSection.filter((n) => n > 0).length / Math.max(1, content.length),
    leadRatio: (lead ? lead.words : 0) / Math.max(1, words),
    listRatio: listWords / Math.max(1, words),
    apparatusRatio: 1 - words / Math.max(1, allWords),
    sectionWords: {
      ...describe(topWords),
      largest: largest ? largest.title : null,
      smallest: smallest ? smallest.title : null,
    },
    paragraphWords: describe(contentParagraphs.map((p) => p.words)),
    linkDistribution: describe(linkDensities),
    imageDistribution: describe(imagesPerSection),
    distribution: top.map((s, i) => ({ id: s.id, title: s.title, words: topWords[i] })),
  };
}

function describe(values) {
  if (!values.length) return { mean: 0, std: 0, cv: 0, gini: 0, min: 0, max: 0 };
  const m = sum(values) / values.length;
  const std = Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / values.length);
  return {
    mean: m,
    std,
    cv: m > 0 ? std / m : 0,
    gini: gini(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function gini(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sum(sorted);
  if (n < 2 || total === 0) return 0;
  let weighted = 0;
  sorted.forEach((v, i) => { weighted += (i + 1) * v; });
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

function sum(values) {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
