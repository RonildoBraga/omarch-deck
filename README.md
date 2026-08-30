# omarch-deck

An independent, Omarchy-native controller for the Loupedeck CT. It talks to
the hardware directly over USB serial and does not need the official Loupedeck
software.

- Loupedeck CT USB IDs `2ec2:0003` and `2ec2:0007`, with automatic reconnect
- live workspace LEDs on the eight round buttons
- centre-wheel workspace navigation and a status display (workspace, app, branch)
- volume, DDC monitor brightness, window, tab, scroll, and zoom dials
- Main (app launchers) and Develop (project tasks) touch pages with icons
- hold-to-lock protection on the lock key
- allow-listed actions only: Omarchy, Hyprland dispatch, PipeWire, and `wtype`

## Run it

Requirements are Node.js 20 or newer and access to the CT serial device.

```sh
make setup       # npm ci + create config.yaml from the example
make udev-check  # confirm the serial device is readable; see below if not
make start       # build and run
```

To have it start with your desktop session:

```sh
make install-service   # user systemd unit, enabled and started now
make service-logs      # follow its output
make uninstall-service
```

Run `make build` again after pulling changes; the service runs the compiled
`dist/` and restarts on failure. It stops with the graphical session and
starts with the next login.

Other commands:

```sh
make help            # list commands
make dev             # run from TypeScript without building
make verify          # type-check, test, and build
make diagnose-lights # cycle the physical button LEDs (stop the controller first)
make clean           # remove generated output
```

Configuration is read from `OMARCH_DECK_CONFIG`, then `./config.yaml`, then
`~/.config/omarch-deck/config.yaml`, falling back to `config.example.yaml`.
`project.path` is the repository the Develop page runs `make` in; a relative
value is resolved against the config file's directory.

## Controls

The full binding map with an annotated diagram is at
<https://ronildobraga.github.io/omarch-deck/>; it is generated from the
control tables by `make docs`, and a test fails if `docs/` is stale.

Everything is red on black: dark red LEDs on the physical buttons, black touch
tiles with red outline icons.

**Touch screen — Main page**

| | | | |
|---|---|---|---|
| Terminal | VS Code (Omarchy editor) | Chrome (Omarchy browser) | Files |
| Lazygit | Docker (lazydocker) | btop | Develop → page 2 |
| Clipboard | Screenshot | 1Password | Hold Lock (hold 1.2 s) |

**Touch screen — Develop page**

| | | | |
|---|---|---|---|
| Build | Test | Check | Verify |
| Lazygit | Git Status | Docker | btop |
| Terminal | VS Code | Main → page 1 | Hold Lock |

Build/Test/Check/Verify run the matching `make` target in `project.path`; the
last line of output appears on the wheel screen.

**Round buttons 1–8** focus that workspace; hold either Fn while pressing to
move the active window there. Active is dark red, occupied is a dim ember, and
empty is off.

**Centre wheel** turns to the previous/next workspace. Its screen shows the
active workspace, focused app, and the project's git branch.

| Dial | Turn | Press |
|---|---|---|
| Top-left | Volume | Mute |
| Top-right | Monitor brightness (`ddcutil`) | Night light |
| Centre-left | Cycle windows | Next window |
| Centre-right | Next/previous tab | Next tab |
| Bottom-left | Page up/down | Page down |
| Bottom-right | Zoom in/out | Zoom reset |

**Square buttons**: Home returns to the Main page; Save, Undo, and Enter send
those keystrokes; Fn+Undo is Redo; Keyboard opens the clipboard menu.

| Key | Action |
|---|---|
| A | Open or attach the Work tmux session in a terminal |
| B | Toggle fullscreen on the focused window |
| C | Start / stop screen recording |
| D | Toggle do-not-disturb (notification silencing) |
| E | Toggle stay-awake (idle inhibit) |

Touch layouts live in `src/pages.ts`, dials and buttons in `src/layout.ts`,
and the command allow-list in `src/actions.ts`. Arbitrary shell commands are never
run from configuration.

## Hardware notes

The `2ec2:0007` CT revision (firmware 0.1.x) ignores the separate display IDs
the `loupedeck` library uses for the CT and only paints the touch strip when it
is addressed as a single 480×270 display, as on the Loupedeck Live.
`src/device.ts` applies that override; without it the touch screen stays blank
while everything else works.

The same firmware does not acknowledge `SET_COLOR`, so LED writes are sent
without awaiting a reply.

`make diagnose-lights` cycles every known LED through red, green, blue, white,
and off, then chases them one at a time while logging button presses, which is
useful for checking a second-hand unit.

## Troubleshooting

**Connection timed out / Invalid handshake response** on every attempt: the
device is wedged from an earlier unclean disconnect. After five failures the
controller says so and slows to one retry every 30 s. Unplug the CT's USB
cable and plug it back in; it reconnects on the next retry. Nothing else
recovers it.

`fonts.conf` is a minimal fontconfig passed to the worker; the fontconfig
bundled with `canvas` cannot parse parts of the system configuration and would
otherwise print warnings at every start.

**Permission denied** on `/dev/ttyACM*`: run `make udev-install`. It installs
`70-omarch-deck.rules`, which grants the `input` group access to serial devices
whose USB vendor is Loupedeck (`2ec2`), and prompts for administrator rights.
Reconnect the CT afterwards. Do not run omarch-deck as root.

**`/dev/ttyACM0` missing** while the CT shows in `lsusb`: reconnect the CT or
its USB hub.

Protocol support comes from the unofficial MIT-licensed
[`loupedeck`](https://github.com/foxxyz/loupedeck) Node.js library.
