// Touch navigation, mapped onto the same FlyControls as the keyboard and mouse.
//
//  left side   — press and drag: a floating joystick appears under the thumb (move)
//  anywhere else — drag to look, tap to interact with what is under the finger
//  ↑ / ↓       — hold to rise / sink
//  ≡           — leave the world (the equivalent of Esc)
//
// Kept deliberately quiet: hairline rings and small glyphs, no gamepad.

const JOYSTICK_RADIUS = 48; // px of thumb travel for full speed
const TAP_MOVE = 10; // px: more than this is a drag, not a tap
const TAP_TIME = 350; // ms
const LOOK_YAW = 2.6; // radians per full screen width dragged
const LOOK_PITCH = 1.8; // radians per full screen height dragged

export function setupTouchControls(controls, { onTap, onMenu }) {
  const layer = el('div', 'touch-layer');
  const stick = el('div', 'touch-stick');
  const knob = el('div', 'touch-knob');
  stick.appendChild(knob);
  const up = el('button', 'touch-btn touch-up', '↑');
  const down = el('button', 'touch-btn touch-down', '↓');
  const menu = el('button', 'touch-btn touch-menu', '≡');
  up.setAttribute('aria-label', 'Move up');
  down.setAttribute('aria-label', 'Move down');
  menu.setAttribute('aria-label', 'Menu');
  layer.append(stick, up, down, menu);
  document.body.appendChild(layer);

  const pointers = new Map(); // pointerId → { role, x0, y0, x, y, t0 }
  let moveId = null;

  const restStick = () => {
    stick.classList.remove('engaged');
    stick.style.left = '';
    stick.style.top = '';
    knob.style.transform = '';
  };

  layer.addEventListener('pointerdown', (e) => {
    if (e.target !== layer || !controls.touchActive) return;
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const joystickZone = e.clientX < w * 0.42 && e.clientY > h * 0.3;
    const role = joystickZone && moveId === null ? 'move' : 'look';
    pointers.set(e.pointerId, { role, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() });
    if (role === 'move') {
      moveId = e.pointerId;
      stick.classList.add('engaged');
      stick.style.left = `${e.clientX}px`;
      stick.style.top = `${e.clientY}px`;
    }
  });

  layer.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.role === 'move') {
      let dx = e.clientX - p.x0;
      let dy = e.clientY - p.y0;
      const d = Math.hypot(dx, dy);
      if (d > JOYSTICK_RADIUS) {
        dx *= JOYSTICK_RADIUS / d;
        dy *= JOYSTICK_RADIUS / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      controls.touch.x = dx / JOYSTICK_RADIUS;
      controls.touch.y = dy / JOYSTICK_RADIUS;
      // Pushing past the rim is the equivalent of Shift.
      controls.touch.boost = d > JOYSTICK_RADIUS * 1.9;
    } else {
      controls.look(((e.clientX - p.x) / window.innerWidth) * LOOK_YAW, ((e.clientY - p.y) / window.innerHeight) * LOOK_PITCH);
    }
    p.x = e.clientX;
    p.y = e.clientY;
  });

  const end = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.role === 'move') {
      moveId = null;
      Object.assign(controls.touch, { x: 0, y: 0, boost: false });
      restStick();
    } else if (e.type === 'pointerup') {
      const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
      if (moved < TAP_MOVE && performance.now() - p.t0 < TAP_TIME) onTap(e.clientX, e.clientY);
    }
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  const hold = (button, value) => {
    const release = (e) => {
      e.preventDefault();
      button.classList.remove('held');
      controls.touch.vertical = 0;
    };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      button.setPointerCapture(e.pointerId);
      button.classList.add('held');
      controls.touch.vertical = value;
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  };
  hold(up, 1);
  hold(down, -1);

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    onMenu();
  });

  // Visible only while inside a world.
  const setVisible = (on) => {
    layer.classList.toggle('hidden', !on);
    if (!on) {
      pointers.clear();
      moveId = null;
      restStick();
    }
  };
  setVisible(false);
  return { setVisible };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
