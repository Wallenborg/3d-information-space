// Development panel: exposes what the generative system is doing.

const f = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : String(v));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;

export function renderDebug(el, manager) {
  const world = manager.current;
  if (!world) {
    el.innerHTML = '<span class="muted">no active world</span>';
    return;
  }
  const { model, metrics: m, spec } = world;
  const p = spec.params;
  const clusterBySection = new Map(spec.clusters.map((c) => [c.sectionId, c]));

  const maxWords = Math.max(1, ...m.distribution.map((d) => d.words));
  const distribution = m.distribution
    .map((d) => `<div class="row"><span>${esc(d.title)}</span><span>${d.words}</span></div><div class="bar" style="width:${(d.words / maxWords) * 100}%"></div>`)
    .join('');

  const tree = model.sections
    .map((s) => {
      const c = clusterBySection.get(s.id);
      const indent = '&nbsp;&nbsp;'.repeat(s.depth - 1);
      const tag = c ? `${c.arrangement}·${c.units}` : '';
      return `<div class="${s.apparatus ? 'muted' : ''}">${indent}${esc(s.isLead ? '[lead]' : s.title)} <span class="muted">${s.words}w ${s.imageIds.length}i ${s.linkIds.length}l ${tag}</span></div>`;
    })
    .join('');

  const palette = ['atmosphere', 'primary', 'secondary', 'accent', 'surface']
    .map((k) => `<div class="swatch" style="background:${spec.palette[k]}">${k.slice(0, 4)}</div>`)
    .join('');

  el.innerHTML = `
    <h3>ARTICLE</h3>
    ${row('title', esc(model.title))}
    ${row('elements', spec.elements.length)}
    ${row('extent', f(spec.extent, 0))}

    <h3>STRUCTURE</h3>
    ${row('words', m.words)}
    ${row('sections / subsections', `${m.sectionCount} / ${m.subsectionCount}`)}
    ${row('hierarchy depth', m.maxDepth)}
    ${row('branching', f(m.branching))}
    ${row('paragraphs', `${m.paragraphCount} (μ ${f(m.paragraphWords.mean, 0)}w, cv ${f(m.paragraphWords.cv)})`)}
    ${row('links / unique', `${m.linkCount} / ${m.uniqueLinkCount}`)}
    ${row('link density /100w', f(m.linkDensity))}
    ${row('link unevenness (gini)', f(m.linkDistribution.gini))}
    ${row('images', m.imageCount)}
    ${row('image density /1000w', f(m.imageDensity))}
    ${row('image spread', f(m.imageSpread))}
    ${row('lead ratio', f(m.leadRatio))}
    ${row('list ratio', f(m.listRatio))}
    ${row('section size μ / cv', `${f(m.sectionWords.mean, 0)} / ${f(m.sectionWords.cv)}`)}
    ${row('section gini', f(m.sectionWords.gini))}
    ${row('largest', esc(m.sectionWords.largest ?? '–'))}
    ${row('smallest', esc(m.sectionWords.smallest ?? '–'))}

    <h3>SECTION DISTRIBUTION</h3>
    ${distribution || '<span class="muted">single section</span>'}

    <h3>GENERATIVE PARAMETERS</h3>
    ${['verticality', 'compression', 'openness', 'fragmentation', 'asymmetry', 'rhythm', 'twist', 'lift', 'turn', 'climb', 'spacing', 'grain', 'coherence', 'fogDensity']
      .map((k) => row(k, f(p[k], k === 'fogDensity' ? 4 : 2)))
      .join('')}
    ${row('dominant arrangement', p.dominant)}
    ${row('title', spec.entry.title)}
    ${row('text surfaces', spec.elements.filter((e) => e.type === 'surface').length)}
    ${row('images placed', spec.elements.filter((e) => e.type === 'image').length)}
    ${row('links realized / unique', `${spec.elements.filter((e) => e.type === 'link').length} / ${m.uniqueLinkCount}`)}
    ${row('link style', spec.elements.find((e) => e.type === 'link')?.style ?? '–')}

    <h3>PALETTE</h3>
    <div class="swatches">${palette}</div>
    ${row('mode / base hue', `${spec.palette.light ? 'pale' : 'dark'} / ${spec.palette.baseHue}°`)}

    <h3>SECTION HIERARCHY</h3>
    <div class="tree">${tree}</div>

    <h3>ACTIVE WORLDS</h3>
    ${manager.active.map((w, i) => row(i + 1, esc(w.title))).join('')}
    ${row('history', esc(manager.history.join(' → ')))}
  `;
}
