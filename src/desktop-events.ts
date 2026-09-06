import { connect, type Socket } from "node:net";
import { join } from "node:path";

// Hyprland pushes desktop changes over `.socket2.sock` as `EVENT>>DATA` lines,
// so the deck does not have to ask. Polling cost four processes every 750ms
// whether or not anything had changed — about 460,000 child processes a day to
// display a workspace number, an app name and a branch.
//
// Most of that traffic is noise. Any window with a spinner in its title (a
// build, a download) emits windowtitle/activewindow several times a second, and
// Hyprland re-emits activewindowv2 alongside them, so reacting to every event
// would simply move the polling into the event handler. Only a change of
// workspace, of focused window, or of what exists at all can alter the display.
const OCCUPANCY_EVENTS = new Set([
  "openwindow",
  "closewindow",
  "movewindowv2",
  "createworkspacev2",
  "destroyworkspacev2",
  "focusedmon",
]);

const RECONNECT_DELAY_MS = 2_000;

export interface DesktopWatcher {
  close(): void;
}

/**
 * Calls `onChange` when something the dashboard shows may have changed.
 * Returns a watcher whose `close()` stops it. If the socket is unavailable the
 * watcher is inert and the caller's periodic refresh remains the only source of
 * updates, so the deck degrades to slower rather than to broken.
 */
export function watchDesktop(onChange: () => void): DesktopWatcher {
  const signature = process.env.HYPRLAND_INSTANCE_SIGNATURE;
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  if (!signature || !runtimeDir) {
    console.error("[state] no Hyprland event socket in the environment; using periodic refresh only");
    return { close() { /* nothing was opened */ } };
  }
  const path = join(runtimeDir, "hypr", signature, ".socket2.sock");

  let socket: Socket | undefined;
  let retry: NodeJS.Timeout | undefined;
  let closed = false;
  let lastWorkspace: string | undefined;
  let lastWindow: string | undefined;

  const handle = (line: string): void => {
    const separator = line.indexOf(">>");
    if (separator < 0) return;
    const event = line.slice(0, separator);
    const data = line.slice(separator + 2);

    if (event === "workspacev2") {
      const id = data.split(",")[0] ?? "";
      if (id === lastWorkspace) return;
      lastWorkspace = id;
    } else if (event === "activewindowv2") {
      // Re-emitted on every title change, so compare the address itself.
      if (data === lastWindow) return;
      lastWindow = data;
    } else if (!OCCUPANCY_EVENTS.has(event)) {
      return;
    }
    onChange();
  };

  const open = (): void => {
    if (closed) return;
    const connection = connect(path);
    socket = connection;
    connection.setEncoding("utf8");

    let carry = "";
    let reconnecting = false;
    const reconnect = (): void => {
      if (reconnecting) return;
      reconnecting = true;
      connection.destroy();
      if (socket === connection) socket = undefined;
      if (closed) return;
      retry = setTimeout(open, RECONNECT_DELAY_MS);
      retry.unref();
    };

    connection.on("data", (chunk: string) => {
      const lines = (carry + chunk).split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) if (line) handle(line);
    });
    connection.on("error", reconnect);
    connection.on("close", reconnect);
  };

  open();

  return {
    close(): void {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.destroy();
      socket = undefined;
    },
  };
}
