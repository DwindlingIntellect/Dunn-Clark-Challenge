# Ashen Spire — development notes

These are the decisions I made without a designer available, the known issues, and what most needs
a human to play it. Organized by area.

## Environment and repository

- **Pushing was blocked during development.** `git push` returned HTTP 403 (no GitHub access for
  Claude) until GitHub access was fixed after Milestone 10. All milestones were committed locally,
  one commit each, and pushed together afterwards.
- **Headless screenshots worked.** I used the globally installed Playwright with Chromium and
  SwiftShader WebGL (`scripts/screenshot.mjs`, a dev-only helper that is not a project dependency).
  It was used to check every course, every menu and the PSX pipeline. SwiftShader runs on the CPU, so
  its frame rate (about 15 fps) says nothing about real hardware.

## Distribution

- **Single-file build instead of an .exe.** `npm run build:single` packs the production build into
  `release/AshenSpire.html`, with the JS and CSS inlined, so players can double-click it with no
  server or install. It works from `file://` because nothing loads at runtime: Rapier's WASM is
  already embedded as base64. An Electron .exe would add about 100 MB and per-platform builds for no
  gameplay benefit.
- **The built file is committed** (about 5 MB) so it can be downloaded straight from GitHub. Rebuild
  and recommit it after changes.

## Dependencies

- Runtime: `three` 0.186, `@dimforge/rapier3d-compat` 0.21 (collision queries only), `lil-gui` 0.21.
- Dev: `vite` 8, `vitest` 5, `typescript` 5.9, `@types/three`, `@types/node`.
  - TypeScript 7 (the native port) was the latest major. I pinned 5.9 for compatibility with
    Vite/Vitest tooling.
  - `@types/node` is dev-only, needed so the tests can read fixture files.
- No other runtime dependencies.
- Rapier's `world.step()` is called once after the colliders are created, purely to build the query
  acceleration structure. No rigid bodies exist.

## Simulation and controller

- **Timestep and feet position.** Fixed 120 Hz (`src/core/loop.ts`) with render interpolation of
  the camera. `PlayerController.pos` is the feet position.
- **Collide-and-slide.** Capsule casts stop at a 7.5 mm gap, then back off along the normal to a
  15 mm resting gap. Sweeps therefore never start in contact, which made Rapier report spurious hits
  at toi = 0. A depenetration pass runs before every move. Tunneling is impossible because every
  displacement is swept; tests cover 120 m/s horizontally and terminal velocity vertically.
- **Ground probing.**
  - The probe casts from a skin above the feet.
  - It uses a ray to refine the normal on flat faces, because contact normals from shape casts were
    noisy and kicked slides sideways.
  - It reads the face beyond the contact point for edge contacts, so you can stand on ledge corners.
- **Slopes and stairs.**
  - Slopes up to 50° are walkable. Running keeps horizontal speed on slopes.
  - Stairs collide as smooth ramps.
  - A 0.35 m step-up handles small lips.
- **Gravity integration** is trapezoidal, so jump arcs are exact parabolas. Jump height is
  v²/2g ≈ 1.50 m.
- **Ground movement.** Accelerate at 60 toward the input and decelerate at 40 without input. Above
  top speed (after a slide or jump) speed decays at a gentler 20 m/s² (`ground.overspeedDecel`), so
  momentum survives short ground contacts and bunny-hop chains.
- **Air control** ("preserves momentum"). Input may add speed only up to `air.controlSpeed`
  (10 m/s). Above that it only steers, and there is a hard 18 m/s air cap.
- **Jumping off upward slopes** adds 50% of the upward velocity (`jump.slopeInherit`). This creates
  ramp launches.
- **Slides.**
  - The +2 m/s entry boost has a 0.75 s cooldown (`slide.boostCooldown`); otherwise tapping crouch
    would gain unlimited speed.
  - Slides can steer slowly (1.2 rad/s) and are capped at 24 m/s.
  - Landing while holding crouch at speed starts a slide; buffered jumps take priority.
- **Wall run.**
  - Requires all of these:
    - airborne;
    - holding forward;
    - at least 6 m/s along the wall;
    - a surface tagged `wallrun` within 0.35 m;
    - falling slower than 9 m/s.
  - Approaching a wall within about 37° of head-on becomes a cling instead.
  - **Gravity.** It ramps from 0.25× to 1× along a curve with exponent 2. Sinking is also capped at
    4 m/s (`wallRun.maxSinkSpeed`).
    - With a plain linear 0.25→1 ramp, a 1.4 s run drops about 15 m, which makes wall runs useless
      for crossing gaps.
    - With the cap, a full run covers about 14 m and drops about 3 m, getting steeper near the end
      as specified.
  - Entry vertical speed is clamped to [0, 3] m/s.
  - Jumping off adds 7 m/s away from the wall and sets 8 m/s up, keeping the speed along the wall.
  - The same wall cannot be re-run for 0.6 s; a different wall can, which allows wall-to-wall
    chains.
  - Releasing forward or pressing crouch ends the run.
- **Cling and climb.**
  - Starts when airborne, holding forward and facing a wall within 50°.
  - You climb at 4 m/s for up to 0.4 s while holding forward, then hang until 0.6 s total.
  - Once per airborne period; the allowance resets on landing and after a mantle.
  - A cling cannot start during the coyote window after walking off a ledge. Without that rule,
    running into a wall on flat ground grabbed it by accident.
  - Jumping off a cling pushes 5 m/s away and 7.5 m/s up.
- **Mantle.**
  - Hands are 1.5 m above the feet; ledges up to 1.2 m above the hands qualify, and at least 0.5 m
    above the feet.
  - Works from the ground (a vault) as well as from the air and from a cling.
  - Takes 0.3 s: 60% rising, then forward.
  - Ends crouched when there is no standing room. Exits at max(5 m/s, 60% of the incoming speed).
- **Camera feel** (`src/game/cameraFeel.ts`) is render-side only and never affects the simulation:
  - FOV kick from 9 to 18 m/s;
  - head bob synced to the footstep stride;
  - spring-damped landing dip;
  - 7° wall-run tilt.
  Each can be toggled in `movement.camera`.
- **Body settings.** Movement config also includes a `body` group (capsule sizes, eye heights, step
  height), shown as an extra Body folder in the debug menu.

## Rendering (PSX)

- **Gamma space.** The whole pipeline works in display space. `THREE.ColorManagement` is off and the
  output colour space is linear, so no conversions happen, as on the original hardware. Leaving
  colour management on made everything far too dark.
- **Low-res target.**
  - The scene renders to a 240-line target, 320×240 in 4:3.
  - The image is letterboxed to 4:3; the debug menu can switch to window aspect.
  - The post pass upsamples with nearest filtering, then applies the vignette, the 4×4 Bayer dither
    and the 5-bit-per-channel quantisation (15-bit colour), all in low-res pixel space.
- **Lighting is per fragment**, not per vertex (Gouraud). Huge flat walls with only corner vertices
  would otherwise get no lantern light. The cost is negligible at 320×240.
  - Sources: hemisphere ambient, one moon light, and up to 8 point lights per course with a slight
    flicker. The bell, the checkpoint lanterns and then authored lights take the 8 slots in that
    order.
- **Affine mapping** uses the uv·w / w varying trick, since GLSL ES 3.00 has no `noperspective`.
  Large faces are tessellated: 3 m edges by default, 6 m on far-away window walls, coarser on thin
  details. This keeps warping in the PS1 range instead of unreadable.
- **Vertex snapping** rounds to a grid equal to the internal resolution divided by the snap
  strength.
- **Fog.** Distance fog plus height fog: everything below a course's pit height fades into fog, so
  death zones read as fog banks. The sky dome's horizon colour follows the fog colour.
- **Textures.** Ten procedural 64×64 canvas textures (`src/render/textures.ts`) use seeded RNG,
  nearest filtering and no mipmaps.
- **Merged geometry.** Static geometry is merged per material and per 48 m cell, so frustum culling
  works. Each course is about 30–115k triangles in at most about 150 draw calls.
- **Checkpoint lanterns** hang on chains above the running line. A post would sit in the path,
  because checkpoints sit on the route.

## Courses and validation

- **Format.**
  - A piece's `pos` is the centre of its bottom face. Platforms use 1 m slabs with top = pos y + 1.
  - Added a `repeat` field for colonnades (it keeps the files pure data).
  - Added a `boost-jump` move type: slide down a ramp, leap from its low edge.
  - For slopes as landing targets (and boost-jump take-offs), the low edge height is used.
- **Validation** (`tests/courses.test.ts`, `src/levels/validate.ts`).
  - What each move can reach is measured by running the real controller in small synthetic worlds
    (`src/sim/capabilities.ts`): run-jump, slide-jump, drop and wall-run envelopes, plus the maximum
    mantle and climb heights. A boost-jump envelope is simulated for the specific ramp of each link.
  - A link passes when the reach at the required height difference is at least 1.15× the gap, and
    rises are scaled by 1.15 before the lookup.
  - Gaps are measured between the pieces' footprints (AABBs in XZ). Links therefore avoid rotated
    pieces, whose AABBs over-estimate.
  - Measured with the defaults:
    - run-jump: 6.3 m flat;
    - slide-jump: 6.6 m;
    - wall run: 13.8 m flat;
    - mantle: 3.76 m;
    - climb: 5.36 m.
- **Autopilot routes** (`tests/routes.ts`). A waypoint bot drives the safe route and the shortcut
  route of every course headlessly. Each must finish with zero falls, and gold must sit between the
  two route times. This proves every course can be finished, not just that individual jumps are
  possible. I tuned geometry using these runs; for example, I enlarged course 2's shortcut island and
  made course 4's corridor ceilings solid after the bot found it could run on top of them.
- **Smoke test.** `tests/fixtures/narthex-safe.inputs.json` is the recorded (run-length encoded)
  input stream of course 1's safe route. The smoke test replays it from scratch and must reach the
  bell at the recorded time. Re-record with `npm run record`.
- **Fuzz test.** Random inputs for 15 s × 3 seeds on every course. Positions must stay finite and the
  capsule must never end a tick inside geometry.

### Medal times (estimates — need playtest tuning)

Medals come from the autopilot's near-optimal route times:

| Course | Safe route | Shortcut | Gold | Silver | Bronze |
| --- | --- | --- | --- | --- | --- |
| 1 The Narthex | 29.1 s | 22.0 s | 26 | 36 | 48 |
| 2 The Nave | 23.6 s | 21.1 s | 23 | 32 | 42 |
| 3 The Cloister Roofs | 14.5 s | 8.3 s | 10 | 19 | 26 |
| 4 The Ossuary | 18.4 s | 13.6 s | 15 | 24 | 32 |
| 5 The Bell Tower | 21.8 s | 9.1 s | 11 | 28 | 38 |
| 6 The Spire | 47.0 s | 42.5 s | 46 | 62 | 85 |

- Gold sits below the best possible safe-route time, so it needs the shortcut.
- Silver is about 1.3× the safe route; bronze is about 1.6–1.8×.
- Humans will be well behind the bot, which takes perfect lines and never hesitates. I expect a
  first run on course 1 to take about 45 s, and about 80–90 s on course 6, roughly matching the
  brief.
- Courses 3–5 are shorter than a smooth difficulty curve suggests; they are denser instead.
- Course 2's gold window is tight: the shortcut saves only about 2.5 s.

## Game flow and UI

- **Timer** starts on the first movement input (WASD, jump or crouch); looking around does not
  count. It runs in simulation ticks, so it is frame-rate independent.
- **Checkpoints and respawn.** Touching any lantern lights it and makes it the respawn point. A fall
  respawns there with the timer running. R resets everything instantly: there is no reload, because
  it only resets the run state and the player.
- **Pausing.**
  - Losing pointer lock (Esc) during a run opens the pause menu. Esc in the pause menu resumes.
  - The simulation only advances while the pointer is locked. If the browser refuses an immediate
    re-lock (some block it for about 1 s after Esc), the HUD says "Click to capture the mouse".
- **Results screen.** Enter goes to the next course if it is unlocked, otherwise to course select.
  R retries.
- **Saving.**
  - Each course's best time is saved, and medals are derived from it.
  - Settings (sensitivity, horizontal FOV, master volume) are saved too.
  - All localStorage access is in try/catch. Tests cover broken storage and corrupt JSON.
- **Debug runs.** A run becomes a debug run when the debug menu is opened or the debug course select
  is used, and it never saves. The debug course select ignores locks and includes the gray
  "Proving Ground" test course.
- **FOV slider** sets the horizontal FOV of the 4:3 image (default 90°). The FOV kick adds to it.
- **Title font.** Font files count as imported assets, so the gothic title uses a CSS font stack. It
  shows UnifrakturMaguntia, Old English Text MT or another blackletter face if installed, and falls
  back to Palatino with ✠ ornaments.

## Audio

- Synthesized with Web Audio:
  - footsteps by surface (stone, wood, iron, glass);
  - landing thumps;
  - wind rising with speed;
  - slide scrape;
  - per-course drone (root note in course data);
  - wall-run whoosh and mantle scuff;
  - lantern chime;
  - a church-bell toll from inharmonic partials (hum, prime, tierce, quint, nominal…) with long
    decays.
- A compressor on the master bus prevents clipping.
- Verified to run without errors in headless Chrome, but **never heard by anyone**.

## Known issues

- 60 fps on a mid-range laptop is *expected* but not measured on a real GPU. The triangle counts and
  draw calls are modest, and the simulation costs about 0.1 ms per tick in Node.
- Affine texture warping is still noticeable on big surfaces close to the camera. That is
  intentional PS1 character, but it can be strong on the ridge walks; reduce it with the "Affine
  textures" toggle.
- Mantles trigger automatically when pressing forward into any ledge between 0.5 m and about 2.7 m.
  Running into a waist-high wall vaults it (0.3 s) instead of jumping it, which can feel sticky.
- Clinging only works facing a wall face whose top is a real ledge. On course 5's central climb you
  must face the right block.
- Chained wall runs over long gaps usually need a wall-jump near the end of each run; the autopilot
  does the same. Most players will find this naturally, but it is not explained in-game.
- Validation measures gaps between AABB footprints, so a jump link between rotated pieces would be
  judged conservatively. The shipped links use axis-aligned pieces only.
- Decorative backdrop pieces are procedural and can intersect each other in the distance.
- The production bundle is about 5 MB (1.9 MB gzipped). Most of that is Rapier's WASM, which the
  `-compat` package embeds as base64. Code splitting would not help, because the game needs it at
  boot.

## Most needs human playtesting (in priority order)

1. **Movement feel.**
   - The wall-run gravity curve, sink cap and entry boost.
   - The cling auto-grab and its once-per-jump rule.
   - The mantle auto-trigger height range.
   - The slide boost cooldown and the overspeed decay on landing.
2. **Medal times and difficulty curve** across all six courses. Is gold achievable but demanding? Is
   course 2's gold window too tight? Are courses 3–5 too short?
3. **Course readability at speed.**
   - Course 2: the double wall-run shortcut.
   - Course 3: the slide off the north roof into the garth.
   - Course 5: the central masonry climb.
   - Course 6: the blind climb into the crossing tower.
4. **Audio mix and levels:** wind loudness at top speed, drone volume, bell length.
5. **PSX defaults:** vertex snap strength 1, dither strength 1, vignette 0.45, 240 lines.
6. **Real-hardware performance**, especially on integrated GPUs with large windows. The post pass
   runs at full window resolution.
