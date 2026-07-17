# STARWEFT — UI/UX Architecture

## 1. Design language: "Threadglass"

Original visual identity: a dark, glassy HUD threaded with luminous weftline motifs.
- **Layout metaphor:** the screen is a loom — persistent thin "threads" (rails) anchor
  dockable panels; active states glow along threads (subtle motion, no bloom soup).
- **Faction theming:** accent color + iconography swap by player allegiance (Accord
  cyan, Combine ochre, Covenant ember, Freeholds teal); neutral "Surveyor slate"
  default. All themes AA contrast minimum.
- **Type:** dense tabular numerics with tabular-lining figures; three size steps only;
  no text under 11 px at 1080p reference.

## 2. Information architecture

The game is a decision engine; the UI is its instrument panel. Primary surfaces:

| Surface | Content | Notes |
|---|---|---|
| **The Overview** | THE core combat/space table: filterable, sortable entity list (type, distance, velocity, angular, standing color) | user-defined tab presets shareable as strings (fleet doctrine UX) |
| Ship HUD | layered shield/armor/hull arcs, flux bar, speed dial, module rack with cycle timers, lock stack | keyboard-first: F1–F8 modules, tab-lock cycling |
| System map / Reach map | 3D-lite system view; galaxy graph with data lenses (warding, activity heat, market volume, kills) | lens data from public telemetry API |
| Market | order book depth, candles, regional compare, quick-order with fee preview | every number copyable; export CSV |
| Fitting hall | drag-fit with live derived stats (uses the same `@starweft/core` engine as server) | saved fits shareable as strings |
| Industry | job queues with timelines, input sourcing helper (shopping list vs hangar/market) | |
| Hangar/cargo | multi-pane inventory, filters, bulk ops | |
| Social | chat multiplexer, syndicate manager (roles matrix UI), fleet window with broadcasts | broadcast buttons ≤ 1 click |
| Sounding | probe placement 3D widget + signal list with deviation | |

Window manager: every panel dockable/floatable/stackable; layouts saved per activity
("mining layout", "fleet layout") and hot-swappable (`Ctrl+1..9`).

## 3. Client architecture

- **Stack:** custom client shell; **UI layer in web tech (TypeScript/React) embedded in
  the game client** — same typed protocol SDK as tools/tests (`@starweft/client-sdk`);
  space scene rendered by the 3D engine layer beneath.
- **State model:** unidirectional — protocol events → normalized client store
  (entities, wallet, orders, chat) → pure view components; commands go out through the
  SDK only (no view-layer sockets). Store is replayable (record protocol stream ⇒
  reproduce UI state — QA gold).
- **Renderer split:** 3D scene (ships, belts, effects) and HUD/panels are separate
  processes/layers with a narrow bridge (selection, camera focus, screen-space anchors).

## 4. Accessibility & efficiency (P6)

- Full keyboard map, rebindable; every UI action reachable without mouse.
- Color-blind safe standing/damage palettes (shape + color double-coding everywhere).
- UI scale 80–200%; reduced-motion mode; screen-reader labels on all panels (web-tech
  layer makes this tractable).
- Latency honesty: every command shows pending/confirmed states (tick-aligned).

## 5. New-player UX

- Progressive disclosure: starter layout hides advanced panels; career arcs unlock
  panels contextually ("you've bought your first blueprint — meet the Industry panel").
- Every panel has an inline "explain this" popover (numbers → formulas; P6: show the math).

## 6. Implemented today (Milestone A)

The UI itself is Milestone D (doc 15). Foundations shipped now to guarantee the UI can
be built as specified: typed client SDK (`@starweft/client-sdk`) with the normalized
event stream, and fitting/market math exposed from `@starweft/core` for identical
client-side previews. The Threadglass design tokens (colors, spacing, type scale) are
specified here as the contract for Milestone D.
