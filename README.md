# 3D Information Space

An experimental browser-based artwork.

Information becomes architecture.

Initial version developed during a two-hour Build Day session, September 2026.

## Run

No build step. Serve the folder over HTTP (ES modules need it) and open it:

```
python3 -m http.server 8765
open http://localhost:8765
```

Open an article directly with `http://localhost:8765/#Octopus`.

Controls: click to enter · WASD move · Space / C up / down · Shift faster · Mouse look · Click text (or Q / E) to turn pages · Click a link (arm or coloured word) to follow it · Esc release · I debug panel.

Touch (phones, tablets): tap to enter · left thumb = floating joystick (push past the rim to go faster) · drag elsewhere to look · ↑ / ↓ to rise and sink · tap text, images and links · ≡ to leave the world. `?touch=1` forces touch mode on desktop.

## Structure

```
src/wikipedia/api.js          MediaWiki API (raw data only)
src/wikipedia/parser.js       HTML → normalized information model (hierarchy + provenance)
src/information/metrics.js    model → descriptive metrics
src/generative/parameters.js  metrics → interacting spatial tendencies (seeded)
src/generative/palette.js     metrics + tendencies → constrained palette
src/generative/design.js      model + tendencies → spatial spec (plain data, no three.js)
src/world/worldManager.js     active worlds, history, max-three rule
src/render/                   three.js: spec → scene, free-flight controls
src/ui/                       search, debug panel
```
