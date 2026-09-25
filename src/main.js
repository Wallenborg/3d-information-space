import * as THREE from 'three';
import { SpaceRenderer } from './render/renderer.js';
import { FlyControls } from './render/controls.js';
import { WorldManager } from './world/worldManager.js';
import { generateWorld, STEPS } from './pipeline.js';
import { setupSearch } from './ui/search.js';
import { renderDebug } from './ui/debug.js';
import { Interaction } from './render/interaction.js';

const $ = (id) => document.getElementById(id);
const screens = { search: $('search'), loading: $('loading'), enter: $('enter') };

const renderer = new SpaceRenderer($('stage'));
const controls = new FlyControls(renderer.camera, renderer.canvas);
const worlds = new WorldManager(renderer, { maxWorlds: 3 });
const interaction = new Interaction(renderer.camera, renderer, $('focus'));

let mode = 'search'; // search | loading | world
const debugPanel = $('debug');

function show(name) {
  mode = name === 'enter' ? 'world' : name;
  screens.search.classList.toggle('hidden', name !== 'search');
  screens.loading.classList.toggle('hidden', name !== 'loading');
  screens.enter.classList.toggle('hidden', name !== 'enter');
}

const search = setupSearch({
  form: $('search-form'),
  input: $('search-input'),
  list: $('suggestions'),
  onSubmit: open,
});

async function open(query) {
  $('search-error').textContent = '';
  $('loading-title').textContent = query;
  $('loading-steps').innerHTML = STEPS.map((s) => `<li>${s}</li>`).join('');
  show('loading');

  try {
    const result = await generateWorld(query, (i) => {
      [...$('loading-steps').children].forEach((li, k) => {
        li.className = k < i ? 'done' : k === i ? 'active' : '';
      });
    });

    enterWorld(result);
    show('enter');
  } catch (err) {
    console.error(err);
    show('search');
    $('search-error').textContent = err.message || String(err);
    search.focus();
  }
}

function enterWorld(result) {
  // A search begins a new path: the working memory starts empty.
  worlds.clear();
  const world = worlds.add(result);
  controls.setPose(world.spec.entry.position, world.spec.entry.target);
  history.replaceState(null, '', `#${encodeURIComponent(result.title)}`);

  $('enter-title').textContent = result.title;
  document.documentElement.style.setProperty('--overlay-ink', result.spec.palette.ink);
  document.documentElement.style.setProperty('--overlay-veil', `${result.spec.palette.atmosphere}c8`);
  renderDebug(debugPanel, worlds);
  console.info('[3d-information-space]', result.title, { metrics: result.metrics, params: result.spec.params, elements: result.spec.elements.length });
}

// Following a link from inside a world: quiet status, no screen change.
// The new world grows beyond the link's aperture and emerges from the fog;
// the traveller flies there. The oldest world is forgotten beyond three.
let travelling = false;
async function travel(target, arm) {
  if (travelling) return;
  const status = $('status');
  status.classList.remove('hidden');
  if (worlds.has(target)) {
    status.textContent = `${target} is already present`;
    setTimeout(() => status.classList.add('hidden'), 2500);
    return;
  }
  travelling = true;
  status.textContent = `→ ${target}`;
  try {
    const result = await generateWorld(target, (i) => {
      status.textContent = `→ ${target} · ${STEPS[i]}`;
    }, { exact: true });
    if (worlds.has(result.title)) {
      status.textContent = `${result.title} is already present`;
      setTimeout(() => status.classList.add('hidden'), 2500);
      return;
    }

    let end;
    let dir;
    if (arm) {
      end = arm.end;
      dir = arm.dir;
    } else {
      // Followed from text: the world appears ahead, in the direction of view.
      dir = new THREE.Vector3(0, 0, -1).applyQuaternion(renderer.camera.quaternion);
      dir.y *= 0.3;
      dir.normalize();
      end = renderer.camera.position.clone().addScaledVector(dir, 40);
    }
    const from = worlds.current?.title ?? null;
    worlds.grow(result, end.toArray(), dir.toArray(), from);
    history.replaceState(null, '', `#${encodeURIComponent(result.title)}`);
    $('enter-title').textContent = worlds.active.map((w) => w.title).join('  ·  ');
    renderDebug(debugPanel, worlds);
    status.textContent = `${result.title} emerges ${arm ? 'at the end of the link' : 'ahead'}`;
    setTimeout(() => status.classList.add('hidden'), 3500);
  } catch (err) {
    console.error(err);
    status.textContent = `→ ${target} · ${err.message || 'unavailable'}`;
    setTimeout(() => status.classList.add('hidden'), 3000);
  } finally {
    travelling = false;
  }
}
interaction.onLink = travel;

function backToSearch() {
  controls.unlock();
  worlds.clear();
  renderDebug(debugPanel, worlds);
  history.replaceState(null, '', location.pathname);
  show('search');
  search.focus();
}

screens.enter.addEventListener('click', (e) => {
  if (e.target.closest('#back-to-search')) return;
  controls.lock();
});
$('back-to-search').addEventListener('click', backToSearch);

controls.onLockChange = (locked) => {
  if (mode !== 'world') return;
  screens.enter.classList.toggle('hidden', locked);
};

// Click while inside the world activates whatever is in focus (e.g. turns a page).
document.addEventListener('mousedown', (e) => {
  if (controls.locked && e.button === 0) interaction.activate();
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyI') {
    debugPanel.classList.toggle('hidden');
    renderDebug(debugPanel, worlds);
  }
  if (controls.locked && e.code === 'KeyE') interaction.turn(1);
  if (controls.locked && e.code === 'KeyQ') interaction.turn(-1);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'world') controls.update(dt);
  interaction.update(mode === 'world' && controls.locked);
  renderer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Direct entry: index.html#Article_title
const initial = decodeURIComponent(location.hash.slice(1));
if (initial) open(initial);
else search.focus();

window.__space = { worlds, renderer, controls, interaction, open };
