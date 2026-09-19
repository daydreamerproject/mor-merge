# MOR MERGE

Small, local HTML/CSS/JavaScript core-game build, continuing the original physics prototype. Open `index.html` directly or use the LAN server below. No build, install, account, or deployment needed. Matter.js 0.20.0 is vendored in `vendor/` with its MIT license. The supplied PNGs are temporary artwork; their source files are unchanged.

## Modes and run rules

- **Doctor ×2:** create two Doctors through merges in the same run. The first counts immediately, stays physical and visible for 1.25 seconds of simulation time, then is collected to free space. The second creation immediately freezes play and shows CLEAR, keeping the second Doctor in the jar. If both are created within the collection delay, the first finishes its scheduled collection behind CLEAR. Direct debug drops do not count and are not collected.
- **High Score:** no clear condition; keep playing until Game Over. Doctors remain separate final-tier bodies in both modes.
- Only completed merges award points: creating tiers 2–11 awards 20, 30, 40, 50, 60, 70, 80, 90, 100, and 110 points respectively. Drops award nothing.
- The red Game Over line is at game-space y=180. An item must continuously extend above it for 1,800 ms of simulation time. Each item has its own grace timer, reset below the line. Fresh drops are exempt until they have entered the jar or touched another item/the floor. Removed/merged parents cannot leave stale timers behind. Play freezes on either ending; Retry/Play Again starts the same mode and Back returns to mode selection.
- High Score's best is saved after each new record in localStorage under `mor-merge.best.v1`. It is specific to this browser and origin (Local and Network URLs have different storage). If storage is blocked, the run still works with an in-memory best. Doctor ×2 does not overwrite the High Score record.

## Test on a phone over Wi-Fi

With Node.js installed, open a terminal in this project and run:

```sh
npm run dev
```

No `npm install` is needed; the server uses only Node's built-in modules. It listens on `0.0.0.0:3000` and prints:

```text
Local: http://localhost:3000
Network: http://<PC-LAN-IP>:3000 (adapter name)
```

Keep the terminal open. Connect the phone to the same Wi-Fi as the PC, then open the printed **Network** address in the phone browser. If several addresses appear, use the Wi-Fi/Ethernet adapter connected to that network, not a VPN/virtual adapter. `localhost` on the phone refers to the phone itself. Press Ctrl+C to stop the server.

If the phone cannot connect, allow Node.js through Windows Firewall on **Private** networks and check that the router's guest/client isolation is not separating devices. No deployment, paid service, or port forwarding is required. The server serves only the game's public assets and disables caching so a phone refresh picks up edits.

If port 3000 is already in use, stop the other app's server in its terminal, then run `npm run dev` again. MOR MERGE deliberately stays on port 3000.

Touch gestures on the game canvas aim/drop without scrolling, pinch zoom, or long-press menus. Mobile gameplay fits the visual viewport with `100dvh` fallback, safe-area spacing, compact previews, and a proportional canvas; the page does not vertically scroll during gameplay. Desktop retains the existing page flow.

## Controls

- Mouse: move horizontally, click to drop. Touch: drag to aim, release to drop.
- Keyboard: focus the jar, use arrow keys and Space.
- Doctor ×2's random queue draws Mint Candy 10%, Muffin 15%, Macaron Blue 20%, Macaron Pink 20%, Macaron Green 20%, and Popsicle 15%. It never randomly drops tiers 7–11. High Score keeps the original uniform tiers 1–5 pool (20% each).
- The compact **Debug** section contains the tier selector, Collision debug, elapsed wall-clock run time, accepted drop count, and creation times for Doctors #1 and #2. Wall time includes time spent thinking or backgrounding the page and freezes when the run ends; it is a measurement, not a limit. Reset/Retry/new modes clear these metrics. Selecting a tier updates both previews without clearing the jar. New mode selections return to the mode's random queue.
- Reset restarts the current mode, including score, queue, Doctor count and overflow timers. Collision debug shows actual polygon vertices and centres; pink bodies are awake, blue bodies are sleeping.
- A blocked spawn prevents dropping into an existing body. The grace timer still runs, so a pile blocking the top will end the run normally.

## Physics

`physics.js` owns shapes, contacts, and merging. `run.js` adds the shared scoring, mode state and overflow rules. `game.js` renders the supplied sprites, previews, HUD and input. `art.js` maps each PNG's transparent-padding crop to explicit game-space display sizes and offsets. Raw PNG dimensions never determine gameplay size. Round items use 32-sided circles/ellipses; the popsicle remains a vertical capsule; cake is a chamfered box; cups are tapered chamfered polygons. Small decorative details such as wrappers, steam, handles, toppings and straws are not separate colliders. The drawn popsicle is counter-rotated 0.38 radians to align its illustrated tilt with the existing capsule. Debug remains the guide for tuning these temporary approximations.

The exact chain is Mint Candy → Muffin → Macaron Blue → Macaron Pink → Macaron Green → Popsicle → Ice Cream → Cake → Coffee → Bubble Milk Tea → Doctor.

Art-alignment changes from the physics prototype (width × height, in unchanged 480 × 740 game coordinates):

| Tier | Previous collider | Current collider |
| --- | --- | --- |
| Muffin | cup 40 × 34 | cup 36 × 34 |
| Macaron Blue | oval 52 × 32 | oval 50 × 40 |
| Macaron Pink | pudding 50 × 50 | oval 58 × 46 |
| Macaron Green | oval 68 × 44 | oval 68 × 54 |
| Coffee | cup 88 × 112 | cup 104 × 84 |

All other collider sizes, the jar, gravity, restitution, friction, damping, capsule spawn motion, timestep and solver settings are unchanged. Collider area and visible sprite area increase at every tier. Only new-contact bookkeeping and a successful-merge callback were added to the simulation; the parent-claim protection and contact-based matching are retained.

The balance revision replaces Doctor artwork with `assets/11_doctor_final.png`: its transparent-padding crop is [212, 162, 1410, 1350], but display size stays 152×140 with y-offset −2, and its collider stays the same 146×132 oval. Collection removes only the first merged Doctor's body and wakes remaining bodies so unsupported pieces settle. It does not alter score, progress, Game Over thresholds, or physics settings. High Score never schedules collection.

The engine runs at a fixed 120 Hz with low restitution (0.06), friction (0.65), air damping (0.018), sleeping enabled, and extra solver iterations. Rotation is unrestricted. Merge candidates come only from active collision contacts; parents are immediately claimed to prevent re-use in simultaneous collisions. Removal and spawning happen after the solver finishes. A new tier appears at the average contact support point, shifted inside the jar if necessary. It inherits bounded parent velocity and averaged orientation. Sleeping neighbours wake after a merge so unsupported piles can settle. Tier 11 does not merge further.

Capsules alone use finer semicircular ends (24 segments per cap), friction 0.35, static friction 0.6, air damping 0.008, and a longer sleep threshold of 180. Each capsule spawns with a small random tilt (about 2.3–5.7° either way) and a tiny angular velocity (0.0005–0.0015 radians per Matter base timestep). This also applies when merging into a capsule, on top of the parents' inherited motion. The drop ghost shows the actual initial tilt. Gravity and contact forces decide how it tips; there is no forced horizontal orientation or repeated torque. Other tiers keep their original settings.

Run `node test-physics.cjs`, `node test-run.cjs`, and `node test-server.cjs`. These cover the existing physics (including 40 repeatable capsule drops), scoring/clear/overflow/storage rules, and HTTP serving of all 11 sprites. Server checks use a temporary port without changing the development server's port 3000.

Browser validation for this build: all 11 sprites loaded; Doctor ×2 reached CLEAR at 220 points with both Doctors retained; normal debug-tier drops reached Game Over in both modes; Retry and mode navigation worked; a 20-point High Score record survived refresh. The full canvas fit without document overflow at 320×480, 360×560, 390×664, 430×760 and 600×320. Desktop was checked at 1280×1100. No browser console warnings/errors were observed. Original PNG alpha areas, scaled to the display sizes, were also checked to increase at every tier.

Still manual: real iOS/Android touch and browser-toolbar/safe-area behavior, long-run difficulty in the random queue, and subjective sprite/contact alignment with a crowded pile. Decorative artwork intentionally extends beyond some collider edges. The browser smoke test may leave Best at 20 on the localhost origin.
