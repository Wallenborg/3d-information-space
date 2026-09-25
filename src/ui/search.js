import { suggestTitles } from '../wikipedia/api.js';

/** Minimal search field with title suggestions. Calls onSubmit(query). */
export function setupSearch({ form, input, list, onSubmit }) {
  let items = [];
  let active = -1;
  let controller = null;
  let timer = null;

  const renderList = () => {
    list.innerHTML = '';
    items.forEach((title, i) => {
      const li = document.createElement('li');
      li.textContent = title;
      if (i === active) li.className = 'active';
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        submit(title);
      });
      list.appendChild(li);
    });
  };

  const clear = () => {
    items = [];
    active = -1;
    renderList();
  };

  const submit = (query) => {
    query = query.trim();
    if (!query) return;
    clear();
    onSubmit(query);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return clear();
    timer = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        items = await suggestTitles(q, controller.signal);
        active = -1;
        renderList();
      } catch (err) {
        if (err.name !== 'AbortError') clear();
      }
    }, 160);
  });

  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; renderList(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; renderList(); e.preventDefault(); }
    if (e.key === 'Escape') clear();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(active >= 0 ? items[active] : input.value);
  });

  return {
    focus: () => { input.focus(); input.select(); },
    clear,
  };
}
