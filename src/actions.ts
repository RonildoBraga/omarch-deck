import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);

// Actions that open or focus a GUI/TUI app. They are started detached with no
// stdio: awaiting them would block until the app closes, and inheriting pipes
// makes terminals such as foot exit non-zero even though they launched.
const LAUNCHERS = new Set([
  "terminal", "editor", "browser", "files", "lazygit", "docker", "processes",
  "clipboard", "screenshot", "passwords", "lock-screen", "nightlight",
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

export async function executeCommand(command: string, args: readonly string[], cwd?: string): Promise<ActionResult> {
  try {
    const { stdout, stderr } = await runFile(command, [...args], { cwd, timeout: 120_000 });
    const output = `${stdout}${stderr}`.trim();
    return { message: stdout.trim().split("\n").at(-1) || "Done", ...(output ? { output } : {}) };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim().split("\n").at(-1);
    throw new Error(stderr || (error instanceof Error ? error.message : String(error)));
  }
}

export function launchCommand(command: string, args: readonly string[]): Promise<ActionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve({ message: "Launched" }); });
  });
}

export async function executeAction(name: string, projectPath?: string): Promise<ActionResult> {
  if (name.startsWith("project:")) {
    const target = name.slice("project:".length);
    if (!["build", "test", "check", "verify"].includes(target)) throw new Error(`Unknown project task '${target}'`);
    const result = await executeCommand("make", [target], projectPath);
    return { ...result, message: "Passed" };
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

export function cycleWindow(next: boolean): Promise<ActionResult> {
  return executeCommand("hyprctl", ["dispatch", `hl.dsp.window.cycle_next({ next = ${next} })`]);
}
