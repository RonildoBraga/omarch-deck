import { spawn } from "node:child_process";

const COMMAND_TIMEOUT_MS = 120_000;
const KILL_GRACE_MS = 2_000;
// Keep only a tail of the output: `make verify` can emit megabytes, and the
// only consumers are a one-line wheel message and the log.
const MAX_OUTPUT_LINES = 200;

// The worker runs with FONTCONFIG_FILE pointed at the project's minimal
// fontconfig so node-canvas stops warning. Children here are real desktop apps
// and menus that must keep the system font configuration.
const CHILD_ENV: NodeJS.ProcessEnv = { ...process.env };
delete CHILD_ENV.FONTCONFIG_FILE;

// Actions that open or focus a GUI/TUI app. They are started detached with no
// stdio: awaiting them would block until the app closes, and inheriting pipes
// makes terminals such as foot exit non-zero even though they launched.
const LAUNCHERS = new Set([
  "terminal", "editor", "browser", "files", "lazygit", "docker", "processes",
  "clipboard", "screenshot", "passwords", "lock-screen", "nightlight",
  "tmux", "screenrecord", "dnd", "stay-awake",
]);

export const ACTIONS = {
  terminal: ["omarchy", "launch", "terminal"],
  editor: ["omarchy", "launch", "editor"],
  browser: ["omarchy", "launch", "browser"],
  files: ["omarchy", "launch", "nautilus"],
  lazygit: ["omarchy", "launch", "or", "focus", "tui", "--app-id=lazygit", "lazygit"],
  docker: ["omarchy", "launch", "or", "focus", "tui", "--app-id=lazydocker", "omarchy-launch-docker-tui"],
  processes: ["omarchy", "launch", "or", "focus", "tui", "--app-id=btop", "btop"],
  clipboard: ["omarchy", "menu", "clipboard"],
  screenshot: ["omarchy", "capture", "screenshot"],
  passwords: ["omarchy", "launch", "1password"],
  "lock-screen": ["omarchy", "system", "lock"],
  "volume-down": ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"],
  "volume-up": ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%+"],
  "volume-mute": ["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"],
  "brightness-down": ["omarchy", "brightness", "display", "5%-"],
  "brightness-up": ["omarchy", "brightness", "display", "+5%"],
  nightlight: ["omarchy", "toggle", "nightlight"],
  tmux: ["omarchy", "launch", "terminal", "tmux"],
  screenrecord: ["omarchy", "capture", "screenrecording"],
  dnd: ["omarchy", "toggle", "notification", "silencing"],
  "stay-awake": ["omarchy", "toggle", "idle"],
  save: ["wtype", "-M", "ctrl", "-P", "s", "-p", "s", "-m", "ctrl"],
  undo: ["wtype", "-M", "ctrl", "-P", "z", "-p", "z", "-m", "ctrl"],
  redo: ["wtype", "-M", "ctrl", "-M", "shift", "-P", "z", "-p", "z", "-m", "shift", "-m", "ctrl"],
  enter: ["wtype", "-P", "Return", "-p", "Return"],
  "tab-next": ["wtype", "-M", "ctrl", "-P", "Tab", "-p", "Tab", "-m", "ctrl"],
  "tab-previous": ["wtype", "-M", "ctrl", "-M", "shift", "-P", "Tab", "-p", "Tab", "-m", "shift", "-m", "ctrl"],
  "scroll-up": ["wtype", "-P", "Page_Up", "-p", "Page_Up"],
  "scroll-down": ["wtype", "-P", "Page_Down", "-p", "Page_Down"],
  "zoom-in": ["wtype", "-M", "ctrl", "-P", "plus", "-p", "plus", "-m", "ctrl"],
  "zoom-out": ["wtype", "-M", "ctrl", "-P", "minus", "-p", "minus", "-m", "ctrl"],
  "zoom-reset": ["wtype", "-M", "ctrl", "-P", "0", "-p", "0", "-m", "ctrl"],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type ActionName = keyof typeof ACTIONS;

export interface ActionResult {
  message: string;
  output?: string;
}

export function isActionName(value: string): value is ActionName {
  return Object.hasOwn(ACTIONS, value);
}

function lastLine(text: string): string {
  return text.trim().split("\n").at(-1)?.trim() ?? "";
}

// Buffer only the tail. execFile's default 1 MiB maxBuffer does not truncate —
// it kills the child — so a verbose `make verify` used to be reported as a
// build failure it had nothing to do with.
function collect(stream: NodeJS.ReadableStream, sink: string[]): void {
  let carry = "";
  const push = (line: string): void => {
    sink.push(line);
    if (sink.length > MAX_OUTPUT_LINES) sink.shift();
  };
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    const lines = (carry + chunk).split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) push(line);
  });
  stream.on("end", () => { if (carry) push(carry); });
}

interface CommandOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runCommand(command: string, args: readonly string[], cwd?: string): Promise<CommandOutcome> {
  return new Promise((resolve, reject) => {
    // Deliberately not `detached`: the child stays in this process group so a
    // terminal Ctrl-C still reaches a running `make`. That leaves the timeout
    // reliant on the child forwarding the signal to its own children, which
    // `make` was measured to do.
    const child = spawn(command, [...args], {
      ...(cwd ? { cwd } : {}),
      stdio: ["ignore", "pipe", "pipe"],
      env: CHILD_ENV,
    });
    const out: string[] = [];
    const err: string[] = [];
    if (child.stdout) collect(child.stdout, out);
    if (child.stderr) collect(child.stderr, err);

    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // execFile's timeout sent one SIGTERM and gave up. A build that ignores
      // it would otherwise keep running with nothing supervising it.
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    }, COMMAND_TIMEOUT_MS);
    const settle = (): void => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };

    child.once("error", error => { settle(); reject(error); });
    child.once("close", (code, signal) => {
      settle();
      resolve({ code, signal, stdout: out.join("\n"), stderr: err.join("\n"), timedOut });
    });
  });
}

export async function executeCommand(command: string, args: readonly string[], cwd?: string): Promise<ActionResult> {
  const result = await runCommand(command, args, cwd);
  if (result.timedOut) throw new Error(`Timed out after ${COMMAND_TIMEOUT_MS / 1000}s`);
  if (result.signal) throw new Error(`Killed by ${result.signal}`);
  if (result.code !== 0) {
    throw new Error(lastLine(result.stderr) || lastLine(result.stdout) || `${command} exited ${result.code}`);
  }
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return { message: lastLine(result.stdout) || "Done", ...(output ? { output } : {}) };
}

export function launchCommand(command: string, args: readonly string[]): Promise<ActionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { detached: true, stdio: "ignore", env: CHILD_ENV });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve({ message: "Launched" }); });
  });
}

export const PROJECT_TASKS = ["build", "test", "check", "verify"] as const;

// A tile is one touch away from a second `make` in the same tree while the
// first is still running, which corrupts node_modules/ and dist/.
let runningProjectTask: string | undefined;

export async function executeAction(name: string, projectPath?: string): Promise<ActionResult> {
  if (name.startsWith("project:")) {
    const target = name.slice("project:".length);
    if (!(PROJECT_TASKS as readonly string[]).includes(target)) throw new Error(`Unknown project task '${target}'`);
    if (runningProjectTask) throw new Error(`make ${runningProjectTask} is already running`);
    runningProjectTask = target;
    try {
      const result = await executeCommand("make", [target], projectPath);
      return { ...result, message: "Passed" };
    } finally {
      runningProjectTask = undefined;
    }
  }
  if (name === "git-status") return executeCommand("git", ["status", "--short", "--branch"], projectPath);
  if (!isActionName(name)) throw new Error(`Unknown action '${name}'. Allowed actions: ${Object.keys(ACTIONS).join(", ")}`);

  const [command, ...args] = ACTIONS[name];
  const withProject = name === "editor" && projectPath ? [...args, projectPath] : args;
  return LAUNCHERS.has(name) ? launchCommand(command, withProject) : executeCommand(command, withProject);
}

export function workspaceFocus(workspace: string | number): Promise<ActionResult> {
  return executeCommand("hyprctl", ["dispatch", `hl.dsp.focus({ workspace = "${workspace}" })`]);
}

export function workspaceMove(workspace: number): Promise<ActionResult> {
  return executeCommand("hyprctl", ["dispatch", `hl.dsp.window.move({ workspace = "${workspace}" })`]);
}

export function fullscreen(): Promise<ActionResult> {
  return executeCommand("hyprctl", ["dispatch", 'hl.dsp.window.fullscreen({ mode = "fullscreen" })']);
}

export function cycleWindow(next: boolean): Promise<ActionResult> {
  return executeCommand("hyprctl", ["dispatch", `hl.dsp.window.cycle_next({ next = ${next} })`]);
}
