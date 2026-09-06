# Handover

State of the project as of **2026-09-07**, written for whoever picks it up next.
`README.md` says what the project *is*; this says what you need to know to
change it safely, what was done recently, and what is worth doing next.

`main` is clean, pushed, and running as the user's `omarch-deck.service`.
28 tests pass. Everything below was measured on the real device unless it says
otherwise.

---

## 1. The one rule

**`make verify` proves nothing about the hardware.**

On 2026-09-06 a change shipped with a green suite, a clean type-check and a
successful build, and it put the deck into a crash loop that repeatedly did the
exact thing the firmware wedges on. The tests could not see it because the only
honest test of this device is the device.

So: **if you touch anything that talks to the CT, plug it in and watch the
journal before you call it done.**

```sh
systemctl --user restart omarch-deck.service
journalctl --user -u omarch-deck.service -f
```

A healthy start looks like `connected` and `dashboard active` in the *same
second*, then silence. If startup takes ten seconds, or you see `[display]`
lines, or the worker PID keeps changing, you have broken something — revert and
diagnose rather than pressing on.

You can also render display output off-device and *look* at it, which is much
better than reasoning about a 60px strip you cannot see. `stripPainter` is
exported from `src/controller.ts` for exactly this; there are worked examples in
the commit messages for `395bf31` and `f115494`.

---

## 2. Hardware invariants — do not "fix" these

This unit is a Loupedeck CT, USB `2ec2:0007`, firmware `0.1.2`. It is not the
revision the `loupedeck` library targets, and several things about it are
deliberate workarounds. Each is commented where it lives; this is the index.

| Invariant | Where | Why |
|---|---|---|
| Touch strip is addressed as **one 480×270 "M" display** with x offsets, not the CT's separate A/L/R ids | `src/device.ts` | Without it the touch screen stays blank while everything else works |
| **LED writes are never awaited** (`void this.deck.setButtonColor(...)`) | `src/controller.ts` | This firmware never acknowledges `SET_COLOR`; awaiting it hangs forever |
| **Never put a timeout on a draw** | `src/controller.ts` | Draw acks are wildly variable — measured 8–20s for one `drawScreen`, ~5s for a first transfer after connect, against a normal case under 1s. A 5s deadline turned slow frames into forced reconnects and crash-looped the deck. React to the `disconnect` event instead |
| **Always close the port before exiting** | `src/worker.ts` | An abandoned port wedges the CT, and only a physical USB replug recovers it. The handshake-recovery path used to `exit(75)` *before* `deck.close()` and was self-inflicting ~22 wedges/day |
| **The three side dials sit at even thirds** of the 270px strip — band centres y=45/135/225 | `src/layout.ts`, `src/controller.ts` | Confirmed against the physical knobs. The repo's own SVG schematic (`src/docs.ts`) uses different fractions and is wrong about this; it is hand-drawn |
| **Strips are painted once per connect**, never on a state refresh | `src/controller.ts` | Each strip is a 32,400-byte transfer |
| **Never paint the wheel before an action** | `src/controller.ts` | The wheel is 240×240×2 = 115,200 bytes, ~700ms. Painting a "Running…" frame first made every dial notch feel dead |
| `sans-serif` resolves to **Adwaita Mono**, not a UI sans | `fonts.conf` | The file declares dirs but no `sans-serif` alias. Advance is exactly 0.6em, so text budgets are computable — 6 chars at bold 14px is 50.4px. Adding an alias would change every label on the device |
| Zoom goes through **the compositor, not `wtype`** | `src/actions.ts` | `wtype` synthesises its own keymap and must place `plus`/`minus`/`0` on spare keycodes; Chromium matches zoom accelerators on *hardware* keycodes, so the key arrives and is ignored. Use `hyprctl dispatch 'hl.dsp.send_shortcut({ mods = "CTRL", key = "equal" })'`. Note `mods` not `modifiers`, and `key = "plus"` errors — use `equal`. Keys with standard keycodes (Ctrl+Tab, Page_Up/Down) are fine on `wtype` |

If the deck will not connect at all, **ask the user to replug the USB cable
before debugging code.** That is usually the answer.

---

## 3. Architecture in one paragraph

`src/main.ts` is a supervisor that spawns `src/worker.ts` and restarts it
(exit code 75 means "handshake failed, try again"). The worker finds the device,
connects, and hands it to `DeckController` (`src/controller.ts`), which owns
input routing, rendering and state. Bindings are data: `src/pages.ts` holds the
12-key touch grid per page, `src/layout.ts` holds the dials and physical
buttons, and `src/actions.ts` is a closed allow-list of argv arrays — no shell,
anywhere, ever. `src/docs.ts` renders `docs/index.html` from those same tables,
and a test fails when the committed page is stale, so the published bindings
page cannot drift. `src/desktop-events.ts` subscribes to Hyprland's event socket
so the controller does not poll.

---

## 4. What changed on 2026-09-06

An audit (32 agents, adversarially verified) produced 51 findings. The
"actually broken" tier was fixed and merged; the structural tier is partly done.
The commit messages carry the measurements — read them before re-litigating a
decision.

| | before | after |
|---|---|---|
| Idle CPU | 2.64% of a core (~38 min/day) | **0.11%** (~1.5 min/day) |
| Dial latency, notch → action | 761ms median | **3–6ms** |
| Log volume | ~1,020 lines/hour | ~11 per 3 min |
| Handshake recoveries, unattended | 22/day | **1 in 14.5h**, recovered in 1s |
| Tests | 7 | 28 |

Fixed: the port-close-before-exit wedge cycle; SIGTERM landing mid-connect;
supervisor exiting 0 on a crash signal; the wheel dashboard being pinned forever
by an action's status; `make dev` (which had never worked); a shell-expanded
test glob that would have silently reduced the suite to one file; config errors
that printed a raw zod array with no filename; a 1 MiB `maxBuffer` that killed
builds rather than truncating; an Fn-modifier race; zoom not working at all.

Added: dial glyphs on the side strips, strip taps, event-driven desktop state,
logging discipline, CI, an MIT licence.

On the one handshake recovery in that soak: it is the *designed* path, not a
fault. This firmware sometimes fails a handshake on reconnect; what matters is
that the port is now closed before the restart, so it recovers in a second
unattended instead of wedging until someone replugs the cable. Judge it by
whether it loops, not by whether it happens.

---

## 5. Next, in the order I would do it

1. **Confirm strip taps work.** *(needs the user)* Committed in `95010e5` but
   unverified: it is not knowable from code whether this digitizer physically
   reports x<60. Ask the user to tap the speaker glyph at the top of the left
   strip — if audio mutes, it works. Enable coordinate logging with
   `systemctl --user set-environment OMARCH_DECK_LOG=debug` and restart. If it
   does not fire, remove the `kind: "dial"` branch in `onTouchEnd`.
2. **Retire `src/main.ts`.** It is a 58 MB Node process reimplementing
   systemd's `Restart=`, and three of the bugs fixed this week lived inside that
   reimplementation. `RestartForceExitStatus=75` plus `RestartSteps` /
   `RestartMaxDelaySec` covers it natively. Independently, the unit's rate limit
   is unreachable — `RestartSec=5` against `StartLimitIntervalSec=10` /
   `StartLimitBurst=5` means at most 2–3 starts fit in the window, so a
   permanent failure restarts forever instead of landing in `failed`. Worth
   doing *after* a few days of soak data on the current supervisor.
3. **Contrast.** The occupied-vs-empty workspace LED is 1.27:1 and the Hold Lock
   icon 1.83:1, both under the WCAG 3:1 non-text threshold. `setVibration`
   exists in the library and is unused — a free second output channel. **This is
   the user's approved aesthetic; ask before changing it.**
4. Smaller: `allowScripts` in `package.json` is dead config that nothing reads;
   `profile.name` is parsed, logged and never used; there is no linter.

---

## 6. Do not redo these

Two plausible-sounding changes were investigated and deliberately rejected.
Both cost real time to settle.

- **Per-transfer draw deadlines.** The audit's highest-severity finding — device
  I/O has no timeout — is real, but the obvious fix is not viable on this
  firmware. See the invariants table. What shipped instead is a watchdog gated
  on the `disconnect` event, which cannot misfire on a healthy-but-slow device.
  Its first version *did* misfire, because it only checked `stopped` and not
  whether the run loop had already unwound; `loopExited` is what makes it
  correct, and `test/controller.test.ts` fails without it.
- **`detached: true` on command spawns.** The audit claimed the 120s timeout
  orphans the build tree. It does not reproduce — a real `make verify` tree
  showed 3 descendants and 0 survivors on SIGTERM to `make` alone. Process-group
  spawning would cost terminal Ctrl-C propagation for no demonstrated gain.

---

## 7. Working notes

- `make verify` = type-check, test, build. `make docs` regenerates
  `docs/index.html`, which **must be committed in the same commit** as any
  change to `layout.ts` or `pages.ts` or the docs test fails.
- Do not hand-edit `docs/index.html`. GitHub Pages serves branch `main`, path
  `/docs`.
- `make dev` runs from TypeScript without building; `make start` builds and runs.
  Do not run either while the systemd service is up — the serial port is
  exclusive.
- Config is `OMARCH_DECK_CONFIG`, then `./config.yaml`, then
  `~/.config/omarch-deck/config.yaml`, then `config.example.yaml`.
  `config.yaml` is gitignored.
- The user's repo is `github.com/RonildoBraga/omarch-deck`.
