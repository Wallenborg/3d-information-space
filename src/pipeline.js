// Wikipedia article → spatial specification.
// Each stage only consumes the output of the previous one.

import { resolveTitle, fetchArticle } from './wikipedia/api.js';
import { parseArticle } from './wikipedia/parser.js';
import { computeMetrics } from './information/metrics.js';
import { designWorld } from './generative/design.js';

export const STEPS = [
  'retrieving article',
  'parsing information structure',
  'measuring structure',
  'generating architecture',
];

/**
 * `exact`: the query is already a Wikipedia title (e.g. a link target), so skip
 * resolving it; the parse API follows redirects itself.
 */
export async function generateWorld(query, onStep = () => {}, { exact = false } = {}) {
  onStep(0);
  const title = exact ? query : await resolveTitle(query);
  const raw = await fetchArticle(title);

  onStep(1);
  const model = parseArticle(raw);

  onStep(2);
  const metrics = computeMetrics(model);

  onStep(3);
  const spec = designWorld(model, metrics);

  return { title: model.title, model, metrics, spec };
}
