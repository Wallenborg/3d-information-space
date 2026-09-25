// Wikipedia HTML → normalized information model.
//
// The model preserves hierarchy and provenance:
//   article → section → subsection → paragraph → links / images
// Every paragraph knows its section, every link knows its paragraph and section,
// every image knows its section, every section knows its parent.

// Scholarly apparatus that carries no article prose — removed entirely.
const DROPPED_SECTIONS = /^(references|notes|citations|footnotes|sources|works cited|cited sources|notes and references|references and notes|explanatory notes|general and cited references|general references|informational notes)$/i;

// Kept (they hold relationships), but marked as apparatus, not article body.
const APPARATUS_SECTIONS = /^(see also|further reading|external links|bibliography|selected bibliography|selected works|gallery|discography|filmography)$/i;

const IGNORED = [
  'style', 'script', 'link', 'meta',
  '.mw-editsection', 'sup.reference', '.reference', '.mw-references-wrap', '.reflist', 'ol.references',
  '.navbox', '.navbox-styles', '.vertical-navbox', '.metadata', '.ambox', '.hatnote', '.shortdescription',
  '.mw-empty-elt', '.noprint', '.sistersitebox', '.side-box', '#toc', '.toc', '.authority-control',
  '.portal-bar', '.portalbox', '.mbox-small', '.sidebar', '.mw-cite-backlink', '.Inline-Template',
  '[style*="display:none"]', '[style*="display: none"]', '.mw-tracking-category',
].join(',');

const NAMESPACE = /^(file|image|media|category|help|wikipedia|wp|template|portal|special|talk|user|module|draft|mediawiki|book|timedtext|mos)(\s+talk)?:/i;

export function parseArticle({ title, pageId, html }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.mw-parser-output') || doc.body;
  root.querySelectorAll(IGNORED).forEach((node) => node.remove());

  const sections = [];
  const paragraphs = [];
  const links = [];
  const images = [];
  const rootSectionIds = [];
  const seenImages = new Set();

  const makeSection = (props) => {
    const section = {
      id: `s${sections.length}`,
      order: sections.length,
      children: [],
      paragraphIds: [],
      imageIds: [],
      linkIds: [],
      words: 0,
      apparatus: false,
      isLead: false,
      ...props,
    };
    sections.push(section);
    return section;
  };

  const lead = makeSection({ title, anchor: null, level: 1, depth: 1, parentId: null, isLead: true });
  rootSectionIds.push(lead.id);

  let current = lead;
  let stack = []; // open heading sections, by level
  let droppedLevel = null;

  function startSection(level, headingText, anchor) {
    if (droppedLevel !== null && level > droppedLevel) { current = null; return; }
    droppedLevel = null;
    if (DROPPED_SECTIONS.test(headingText)) { droppedLevel = level; current = null; return; }

    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1] || null;
    const section = makeSection({
      title: headingText,
      anchor,
      level,
      depth: parent ? parent.depth + 1 : 1,
      parentId: parent ? parent.id : null,
      apparatus: APPARATUS_SECTIONS.test(headingText) || Boolean(parent && parent.apparatus),
    });
    if (parent) parent.children.push(section.id);
    else rootSectionIds.push(section.id);
    stack.push(section);
    current = section;
  }

  function addParagraph(el, kind) {
    const text = kind === 'list' ? listText(el) : cleanText(el.textContent);
    const words = countWords(text);
    if (words < 3) return;

    const paragraph = {
      id: `p${paragraphs.length}`,
      sectionId: current.id,
      order: current.paragraphIds.length,
      kind,
      text,
      words,
      linkIds: [],
    };
    paragraphs.push(paragraph);
    current.paragraphIds.push(paragraph.id);
    current.words += words;

    for (const a of el.querySelectorAll('a[href]')) {
      const target = linkTarget(a);
      if (!target) continue;
      const link = {
        id: `l${links.length}`,
        target,
        label: cleanText(a.textContent) || target,
        paragraphId: paragraph.id,
        sectionId: current.id,
      };
      links.push(link);
      paragraph.linkIds.push(link.id);
      current.linkIds.push(link.id);
    }
    // Images embedded inside lists/galleries still belong to this section.
    collectImages(el);
  }

  function collectImages(el) {
    const imgs = el.tagName === 'IMG' ? [el] : el.querySelectorAll('img');
    for (const img of imgs) {
      if (img.classList.contains('mwe-math-fallback-image-inline') || img.classList.contains('mwe-math-fallback-image-display')) continue;
      const width = Number(img.getAttribute('width')) || 0;
      const height = Number(img.getAttribute('height')) || 0;
      if (width < 60 || height < 60) continue; // icons, flags, bullets
      const src = absolute(img.getAttribute('src') || '');
      if (!src || seenImages.has(src)) continue;
      seenImages.add(src);
      // The largest rendition Wikipedia already offers for this image (srcset 2x), else the thumbnail.
      const srcset = (img.getAttribute('srcset') || '').split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
      const large = srcset.length ? absolute(srcset[srcset.length - 1]) : src;

      const figure = img.closest('figure, .thumb, .gallerybox, .infobox');
      const captionEl = figure && figure.querySelector('figcaption, .thumbcaption, .gallerytext, .infobox-caption');
      const image = {
        id: `i${images.length}`,
        sectionId: current.id,
        src,
        large,
        width,
        height,
        fileWidth: Number(img.getAttribute('data-file-width')) || width,
        fileHeight: Number(img.getAttribute('data-file-height')) || height,
        caption: cleanText(captionEl ? captionEl.textContent : img.getAttribute('alt') || ''),
        inInfobox: Boolean(img.closest('.infobox')),
      };
      images.push(image);
      current.imageIds.push(image.id);
    }
  }

  function handle(el) {
    const tag = el.tagName;

    if (/^H[2-6]$/.test(tag)) {
      startSection(Number(tag[1]), cleanText(el.textContent), el.id || null);
      return;
    }
    if (el.classList.contains('mw-heading')) {
      const h = el.querySelector('h2, h3, h4, h5, h6');
      if (h) startSection(Number(h.tagName[1]), cleanText(h.textContent), h.id || null);
      return;
    }
    if (!current) {
      // Inside a dropped section: only look for the next heading.
      if (el.querySelector('h2, h3, h4, h5, h6')) visit(el);
      return;
    }

    if (tag === 'P') return addParagraph(el, 'text');
    if (tag === 'BLOCKQUOTE') return addParagraph(el, 'quote');
    if (tag === 'UL' || tag === 'OL' || tag === 'DL') {
      if (el.classList.contains('gallery')) return collectImages(el);
      return addParagraph(el, 'list');
    }
    if (tag === 'TABLE') return collectImages(el); // infoboxes and data tables: images only
    if (tag === 'FIGURE' || tag === 'IMG' || el.classList.contains('thumb')) return collectImages(el);

    visit(el);
  }

  function visit(el) {
    for (const child of Array.from(el.children)) handle(child);
  }

  visit(root);

  return {
    title,
    pageId,
    sections,
    rootSectionIds,
    paragraphs,
    links,
    images,
  };
}

function linkTarget(a) {
  if (a.classList.contains('mw-selflink') || a.classList.contains('new') || a.classList.contains('external')) return null;
  const href = a.getAttribute('href');
  let path = null;
  if (href.startsWith('/wiki/')) path = href.slice(6);
  else if (href.startsWith('./')) path = href.slice(2);
  if (!path) return null;

  let target;
  try { target = decodeURIComponent(path.split('#')[0]); } catch { return null; }
  target = target.replace(/_/g, ' ').trim();
  if (!target || NAMESPACE.test(target)) return null;
  return target;
}

function absolute(url) {
  return url.startsWith('//') ? `https:${url}` : url;
}

/** Lists keep one line per item, separated by newlines. */
function listText(el) {
  const items = Array.from(el.children).filter((c) => c.tagName === 'LI' || c.tagName === 'DT' || c.tagName === 'DD');
  if (!items.length) return cleanText(el.textContent);
  return items.map((li) => cleanText(li.textContent)).filter(Boolean).join('\n');
}

function cleanText(text) {
  return (text || '')
    .replace(/\[(\d+|[a-z]|citation needed|note \d+|\w+ \d+)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return matches ? matches.length : 0;
}
