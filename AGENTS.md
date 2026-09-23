# Working on omarch-deck

Read `HANDOVER.md` before changing anything that talks to the device. It carries
the current state, the measurements behind past decisions, and what to do next.
The short version is below.

## The device is the only real test

This controls a physical Loupedeck CT (USB `2ec2:0007`, firmware `0.1.2`) that
is the user's daily driver. `make verify` passing tells you nothing about
whether the deck still works — a fully green suite once shipped a change that
crash-looped the hardware.

If you change anything touching the device, have the CT plugged in, restart the
service, and watch `journalctl --user -u omarch-deck.service -f`. A healthy
start shows `connected` and `dashboard active` in the same second, then goes
quiet. Prefer rendering display output to a PNG and looking at it over reasoning
about pixels you cannot see (`stripPainter` is exported for this).

Ask the user to replug the USB cable before debugging a device that will not
connect. That is usually the answer.

## Firmware invariants — these are workarounds, not bugs

- The touch strip is addressed as **one 480×270 display** with x offsets
  (`src/device.ts`). Without it the screen stays blank.
- **Never await an LED write.** `SET_COLOR` is never acknowledged.
- **Never put a timeout on a draw.** Draw acks vary from under 1s to 20s; a 5s
  deadline crash-looped the deck. React to the `disconnect` event instead.
- **Always close the serial port before exiting.** An abandoned port wedges the
  CT and only a physical replug recovers it.
- **Never paint the wheel screen before running an action** — it is 115,200
  bytes, roughly 700ms.
- Side-strip glyphs are painted **once per connect**, never on a state refresh.
- `sans-serif` resolves to **Adwaita Mono** (no alias in `fonts.conf`), so the
  advance is exactly 0.6em.
- Keyboard shortcuts whose keysym is not on the physical layout (`plus`,
  `minus`, `0`) do **not** trigger Chromium accelerators via `wtype` — they
  arrive and are ignored. Use `hl.dsp.send_shortcut`. Standard keys are fine.

## House style

- **No shell, ever.** `src/actions.ts` is a closed allow-list of argv arrays
  executed with `execFile`/`spawn`. Configuration must never become a command.
- Bindings are data: `src/pages.ts` (touch grid), `src/layout.ts` (dials and
  buttons), `src/actions.ts` (allow-list). `src/docs.ts` renders the published
  bindings page from those same tables — **run `make docs` and commit
  `docs/index.html` in the same commit** as any change to them, or the test
  fails. Never hand-edit that file.
- Comments explain *why*, especially for hardware workarounds, and cite the
  measurement where there is one. Match that when you add code.
- The red-on-black theme and the A–E button mapping are user-approved. Do not
  re-theme or re-map without being asked.
