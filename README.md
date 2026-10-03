# Ashen Spire

A gothic, PS1-styled first-person parkour time trial built with three.js. Sprint, slide, wall-run,
cling and mantle through six fog-drowned courses, from the narthex of a ruined cathedral to a bell
above the clouds. Every course has a safe route and at least one risky shortcut. Gold needs the shortcut.

Everything is generated in code: geometry, 64×64 textures, lighting and synthesized audio. There are
no model, image or sound files.

## Play (no install)

Download [`release/AshenSpire.html`](release/AshenSpire.html) and double-click it. The whole game is
in that single file and runs offline in Chrome, Edge or Firefox. Click **Begin**, then click into the
game to capture the mouse.

It is rebuilt automatically by GitHub Actions on every push to `main`; to rebuild it locally, run
`npm run build:single`.

## Edit levels with one double-click

The `tools/` folder has launchers that do all the terminal work for you. You need
[Git](https://git-scm.com/downloads) and [Node.js 20+](https://nodejs.org) installed once.

| Windows | macOS / Linux | What it does |
| --- | --- | --- |
| `AshenSpire-Editor.bat` | `AshenSpire-Editor.command` | Downloads the project the first time (into `AshenSpire` in your home folder), updates it from GitHub on later runs, installs dependencies, and opens the level editor in your browser. Keep its window open while you edit. |
| `AshenSpire-Publish.bat` | `AshenSpire-Publish.command` | Sends your saved level edits to GitHub. It commits only `src/levels`, runs the tests first (and asks before publishing if any fail), then pushes. |

You can download a launcher on its own from GitHub and run it from anywhere; once the project is
downloaded, the copies in its `tools/` folder use that project directly.
- **Windows** may show "Windows protected your PC" for a downloaded script. Choose *More info → Run
  anyway*.
- **macOS** drops the executable flag on files downloaded through a browser. Run
  `chmod +x AshenSpire-*.command` once, or start it with `bash AshenSpire-Editor.command`.
- The first publish asks for a name and email for the commit history, and Git may ask you to sign
  in to GitHub.

**After every push,** GitHub Actions (`.github/workflows/ci.yml`) runs the tests and rebuilds
`release/AshenSpire.html`, committing it if it changed. You never need to rebuild the release file
yourself; the launchers pull that commit before your next edit.

## Install and run (for development)

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # start the dev server, then open http://localhost:5173
npm run build      # type-check and produce a static build in dist/
npm run preview    # serve the production build
npm test           # run all tests (controller, course validation, routes, smoke, fuzz)
npm run record     # re-record the course 1 input sequence used by the smoke test
```

Click into the game to capture the mouse. Audio starts after your first click or key press, as
browsers require.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (click to capture the pointer) |
| W A S D | Move |
| Space | Jump (also wall-jump while wall running or clinging) |
| Shift or C | Crouch / slide |
| R | Restart the course instantly |
| Esc | Pause menu (resume, restart, course select, sensitivity, FOV, volume, quit) |
| ~ (Backquote) or F1 | Debug menu |
| Enter | On the results screen, go to the next course |

## How to play

- The timer starts on your first movement input and stops when you touch the bell, which tolls.
- Lanterns are checkpoints. Running past one lights it. If you fall below a course's kill height, you
  respawn at the last lantern you lit and the timer keeps running. R restarts the whole course.
- Courses unlock in order. Best times and medals are saved in your browser.

### The movement kit

| Move | How |
| --- | --- |
| Run | 10 m/s top speed with snappy acceleration. |
| Jump | About 1.5 m high. Coyote time and jump buffering forgive early or late presses. |
| Slide | Press crouch at 6 m/s or more for a speed boost. Friction is low; downhill slopes speed you up. Jump out of a slide to keep the momentum. |
| Wall run | Jump at a pale ivory, gold-trimmed wall while holding forward at speed. Lasts up to 1.4 s and sinks faster toward the end. Press Space to kick off it. |
| Cling and climb | Jump into any wall while facing it and holding forward. You climb briefly, then hang. Once per jump. |
| Mantle | Press forward into a ledge within reach of your hands (about 2.7 m above your feet when standing) and you pull yourself up. Candle-lined ledges mark the intended ones. |
| Air control | Steer freely in the air. Speed you already have is never lost to steering. |

**Visual language.** Ivory stone with gold trim is wall-runnable. Ledges lined with lit candles are
built for mantling and climbing. Anything that falls away into thick fog is a death pit.

## Tuning movement with the debug menu

1. Press **~** (or F1) during a run. The game pauses, the mouse is released, and the run is marked
   *debug*: it will never save a best time.
2. Open **Movement (movement.ts)**. Every value in `src/config/movement.ts` is live-editable, grouped
   into Ground, Air, Jump, Slide, Wall Run, Cling/Mantle, Camera and Body. Close the menu with ~ to
   try your changes.
3. **Save tuning (browser)** and **Load tuning (browser)** keep your work in localStorage between
   sessions. **Reset to defaults** restores the shipped values.
4. When you like the result, press **Copy config as code**. It copies a complete replacement for
   `src/config/movement.ts`, comments included (if the clipboard is blocked, a text box opens to copy
   from). Paste it over the file.
5. Run `npm test`. The course validation tests re-measure what the movement can do with the new
   values. If a jump on any course is no longer makeable with a 15% margin, the test names it. Re-run
   `npm run record` if you changed anything that affects course 1.

The debug menu also has the **PSX Effect** controls (master toggle, internal resolution, aspect,
vertex snap, affine textures, Bayer dither on/off and strength, colour depth, vignette, fog
near/far/colour, pit fog height). It also has **Course & Tools**: course select including a gray
test course, teleport to any lantern, a free-fly camera (WASD, Space/C, Shift for speed) and a
collider wireframe. Readouts show FPS, speed, move state and position.

## Level editor

Run `npm run dev`, open the game and press **F2** (from the title screen or during a run). The
editor opens on the current course; F2 again returns to the game. It exists only in dev builds and
saves straight into the course files.

| Input | Action |
| --- | --- |
| Hold right mouse + move | Look around |
| W A S D | Fly (Q / C down, E / Space up, Shift faster, mouse wheel changes fly speed) |
| Left click | Select a piece or marker (Shift/Ctrl+click to add or remove) |
| Left drag on empty space | Box select |
| 1 / 2 / 3 | Move / rotate / scale gizmo (rotation is yaw-only, scale is one piece at a time) |
| F | Frame the selection |
| Ctrl+D, Delete | Duplicate, delete |
| Ctrl+Z, Ctrl+Y (or Ctrl+Shift+Z) | Undo, redo |
| Ctrl+A, Esc | Select all, clear selection |
| Ctrl+S | Save to `src/levels/courses/<id>.json` |
| F5 / Shift+F5 | Play the course from its start / from the camera. Press F5 again to come back. |
| F2 | Leave the editor |

**Panels.**
- **Toolbar:** course picker, **New course** (creates a file from a template), save, undo/redo,
  gizmo modes, grid snap, plus **Fog** and **PSX** to preview the real atmosphere and the 240p look.
  The default editing view is clean and full resolution.
- **Left:** the piece palette (adds a piece where you are looking) and the outliner. Pieces are
  grouped into folders by their `group`; each folder can be collapsed or hidden. Hiding is
  editor-only and handy when cathedral walls are in the way.
- **Right:** the inspector, for the selection or, with nothing selected, the course settings
  (name, atmosphere, kill height, medals, backdrop, campaign membership). Below it is the jump-link
  list.

**Jump links.**
- Links are drawn in the world: green on the safe route, blue on a shortcut, red when the jump is
  not makeable with the current movement values.
- Selecting a piece shows the dashed jump arc for its links.
- To add a link, select the take-off piece, then the landing piece (then the wall, for wall runs),
  choose the move, and press **Link selected**. Hover a link in the list to see its numbers.

Play-tests are debug runs and never save times. The red plane is the kill height.

## Authoring a course

Courses are JSON files in `src/levels/courses/`, one per course; the editor writes them, and they
are also easy to edit by hand. `src/levels/campaign.json` lists the campaign courses in unlock
order. Any other course file is a draft, reachable from the editor and the debug menu's course
select. Files are written in a fixed layout (one piece per line) so diffs stay readable.

```json
{
  "id": "mycourse",
  "name": "My Course",
  "flavor": "One line of flavour text.",
  "atmosphere": "moonlit",
  "start": { "pos": [0, 0, 0], "yaw": 0 },
  "finish": { "pos": [0, 0, -60] },
  "checkpoints": [
    { "pos": [0, 0, -30], "yaw": 0 }
  ],
  "killY": -10,
  "medals": { "bronze": 30, "silver": 22, "gold": 15 },
  "pieces": [
    { "id": "a", "type": "block", "pos": [0, -1, -10], "size": [6, 1, 24], "group": "Start" },
    { "id": "wall", "type": "block", "pos": [-3.5, -10, -28], "size": [1, 14, 14], "tags": ["wallrun"] },
    { "id": "b", "type": "block", "pos": [0, -1, -45], "size": [6, 1, 24] }
  ],
  "jumpLinks": [
    { "from": "a", "to": "b", "move": "wallrun", "via": "wall" }
  ]
}
```

- `atmosphere` is a fog/lighting preset from `src/render/atmosphere.ts`.
- `yaw` is in degrees; 0 faces −Z.
- `finish.pos` is the floor position under the bell.

**Conventions.** Units are meters and +Y is up. A piece's `pos` is the centre of its bottom face, so
its top is at `pos[1] + size[1]`. `size` is `[width x, height y, depth z]` before rotation, and `rot`
is yaw in degrees. `repeat: { count, step }` stamps copies; their ids get `.0`, `.1` and so on.
`group` only affects the editor's outliner.

**Pieces.** `block`, `ramp` and `stairs` (both rise toward local −Z and collide as a smooth slope),
`roof` (gable along local Z), `walkway` (with balustrades unless tagged `norails`), `pillar`, `arch`
(the jambs and lintel collide), `windowwall`, and the decorative `buttress`, `rosewindow`, `spire`,
`lantern` and `candles`. Tag `solid` makes a decorative piece collide; `deco` turns collision off.

**Tags.** `wallrun` gives the ivory and gold look and makes the surface wall-runnable. `mantle` lines
the top edges with candles. `wood` and `iron` change footstep sounds; `mat` picks the texture.

**Jump links.** List every jump on the intended routes as `{ from, to, move, via?, route? }`. The
move is `run-jump`, `slide-jump`, `boost-jump` (slide down the `from`/`via` ramp and leap from its
low edge), `drop`, `mantle`, `climb`, or `wallrun` (with `via` set to the wall). Mark shortcut jumps
with `route: "shortcut"`. `npm test` checks that each link is physically makeable with the current
`movement.ts`, with a 15% margin on both distance and height; the editor shows the same check live.
Campaign courses also need at least one shortcut link.

**Hot reload.** In `npm run dev`, saving any course file (from the editor or a text editor) rebuilds
the level in place; new files are picked up automatically.

**Routes and medals.** Optionally add autopilot waypoints for the safe route and the shortcut in
`tests/routes.ts`. The route tests then drive the course headlessly. Both routes must finish with
zero falls, and gold must be faster than the safe route and slower than the shortcut. Run
`ROUTE_LOG=1 npx vitest run tests/routes.test.ts` to print the measured times and set the medals
from them.

## Project layout

```
src/config/      movement.ts (all movement tunables), render.ts (PSX settings)
src/sim/         deterministic simulation: controller, Rapier collision queries, capabilities, autopilot
src/game/        game flow, run rules (timer/checkpoints/respawn), camera feel
src/levels/      course JSON files (courses/), campaign order, collider builder, validation
src/render/      PSX pipeline and materials, procedural textures, gothic kit, level builder, sky
src/audio/       Web Audio synthesis
src/debug/       lil-gui debug menu, free-fly camera, config-to-code
src/editor/      dev-only level editor (F2)
src/ui/          HUD, menus, styles
tests/           Vitest suites (+ fixtures and autopilot routes)
scripts/         dev-only headless screenshot helper (uses a global Playwright install)
```

The simulation runs at a fixed 120 Hz and is deterministic for a given input stream, so it runs
headlessly in Node for the tests. Rendering interpolates the camera between simulation steps.
