# omarch-deck

An independent, Omarchy-native controller for the Loupedeck CT. It talks to
the hardware directly and does not require the official Loupedeck software.

This first milestone supports:

- Loupedeck CT USB IDs `2ec2:0003` and `2ec2:0007`
- reconnecting discovery over the device's USB serial interface
- button, dial, wheel, and touch event logging
- custom labels on the center touch keys
- a startup title on the center display
- allow-listed Omarchy, Hyprland, and PipeWire actions
- YAML configuration

## Run it

Requirements are Node.js 20 or newer and access to the CT serial device.

```sh
npm install
cp config.example.yaml config.yaml
npm run dev
```

For normal use after building, run `npm run build && npm start`.

The Makefile provides the usual project commands:

```sh
make help        # list commands
make setup       # install dependencies and create config.yaml
make dev         # development mode
make start       # build and run
make verify      # type-check, test, and build
make clean       # remove generated output
make udev-check  # inspect hardware permissions
```

`make udev-install` installs the included Loupedeck-only permission rule and
opens a graphical administrator prompt. It is optional when the rule is already
installed.

Press controls and watch the terminal output. Stop with `Ctrl+C`.

The program checks `OMARCH_DECK_CONFIG`, then `./config.yaml`, then
`~/.config/omarch-deck/config.yaml`. It falls back to the example config for
development.

## Built-in actions

Configuration refers to named, allow-listed actions rather than arbitrary
shell commands:

- `terminal`, `browser`
- `lock-screen`
- `previous-workspace`, `next-workspace`
- `volume-down`, `volume-up`, `volume-mute`

Add new trusted actions in `src/actions.ts`.

## Troubleshooting

If the CT is present in `/sys` but `/dev/ttyACM0` is absent, unplug and reconnect
the CT or its USB hub, then check:

```sh
ls -l /dev/ttyACM*
```

If the node exists but access is denied, inspect its group with `ls -l` and add
an appropriate udev rule rather than running omarch-deck as root.

This machine has `/etc/udev/rules.d/70-omarch-deck.rules` installed. It grants
the existing `input` group access only to serial devices whose USB vendor is
Loupedeck (`2ec2`). The source copy is `70-omarch-deck.rules` in this project.

The underlying protocol support comes from the unofficial MIT-licensed
[`loupedeck`](https://github.com/foxxyz/loupedeck) Node.js library.
