// Spatial working memory: which article worlds currently exist, where, and in
// what order they were reached. At most `maxWorlds` exist at once; the oldest
// in the navigation history is forgotten first.

const ARRIVAL_GAP = 8; // distance between a link's aperture and the new world's entrance

export class WorldManager {
  constructor(renderer, { maxWorlds = 3 } = {}) {
    this.renderer = renderer;
    this.maxWorlds = maxWorlds;
    this.active = []; // { title, model, metrics, spec, object, position, rotation, from }
    this.history = [];
  }

  get current() {
    return this.active[this.active.length - 1] || null;
  }

  has(title) {
    return this.active.find((w) => w.title === title) || null;
  }

  /** Place a world at a position/rotation (the first world sits at the origin). */
  add(result, position = [0, 0, 0], rotation = 0, from = null) {
    while (this.active.length >= this.maxWorlds) this.unload(this.active[0]);
    const object = this.renderer.addWorld(result.spec, position, rotation);
    const world = { ...result, object, position, rotation, from };
    this.active.push(world);
    this.history.push(result.title);
    if (this.active.length === 1) this.renderer.setAtmosphere(result.spec);
    return world;
  }

  /**
   * Grow a new world beyond a point along a direction (a link's aperture).
   * The world is turned so its entrance faces the arriving traveller:
   * the link literally leads into it.
   */
  grow(result, anchor, direction, from) {
    const { entry } = result.spec;
    const localYaw = Math.atan2(entry.target[0] - entry.position[0], entry.target[2] - entry.position[2]);
    const arrivalYaw = Math.atan2(direction[0], direction[2]);
    const rotation = arrivalYaw - localYaw;

    // Rotate the entry position into world orientation, then offset so it sits just past the aperture.
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const e = entry.position;
    const rotated = [e[0] * c + e[2] * s, e[1], -e[0] * s + e[2] * c];
    const arrival = anchor.map((v, i) => v + direction[i] * ARRIVAL_GAP);
    const position = arrival.map((v, i) => v - rotated[i]);
    return this.add(result, position, rotation, from);
  }

  unload(world) {
    this.renderer.removeWorld(world.object);
    this.active = this.active.filter((w) => w !== world);
  }

  clear() {
    [...this.active].forEach((w) => this.unload(w));
    this.history = [];
  }
}
