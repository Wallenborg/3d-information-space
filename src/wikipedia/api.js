// Wikipedia / MediaWiki API access. Returns raw data only — no interpretation.

const ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const TIMEOUT_MS = 25000;

async function call(params, signal) {
  const url = new URL(ENDPOINT);
  const all = { format: 'json', formatversion: '2', origin: '*', ...params };
  for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);

  // Never hang silently on a slow network.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(url, { signal: combined });
  } catch (err) {
    if (timeout.aborted || err.name === 'TimeoutError') throw new Error('Wikipedia is not responding — try again');
    throw err;
  }
  if (!response.ok) throw new Error(`Wikipedia request failed (${response.status})`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.info || 'Wikipedia returned an error');
  return data;
}

/** Title suggestions while typing. */
export async function suggestTitles(query, signal) {
  const data = await call({ action: 'opensearch', search: query, limit: '7', namespace: '0' }, signal);
  return data[1] || [];
}

/** Resolve free text to the most likely article title. */
export async function resolveTitle(query) {
  const titles = await suggestTitles(query);
  if (titles.length) return titles[0];

  const data = await call({ action: 'query', list: 'search', srsearch: query, srlimit: '1', srnamespace: '0', srprop: '' });
  const hit = data.query?.search?.[0];
  if (!hit) throw new Error(`No Wikipedia article found for “${query}”`);
  return hit.title;
}

/** Fetch the rendered article HTML. */
export async function fetchArticle(title) {
  const data = await call({
    action: 'parse',
    page: title,
    prop: 'text|displaytitle',
    redirects: '1',
    disableeditsection: '1',
    disabletoc: '1',
  });
  return { title: data.parse.title, pageId: data.parse.pageid, html: data.parse.text };
}
