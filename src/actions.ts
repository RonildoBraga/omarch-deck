import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);

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
  "brightness-down": ["ddcutil", "setvcp", "10", "-", "5", "--noverify"],
  "brightness-up": ["ddcutil", "setvcp", "10", "+", "5", "--noverify"],
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
  const { stdout, stderr } = await runFile(command, [...args], { cwd, timeout: 120_000 });
  const output = `${stdout}${stderr}`.trim();
  return { message: output.split("\n").at(-1) || "Done", ...(output ? { output } : {}) };
}

export async function executeAction(name: string, projectPath?: string): Promise<ActionResult> {
  if (name.startsWith("project:")) {
    const target = name.slice("project:".length);
    if (!["build", "test", "check", "verify"].includes(target)) throw new Error(`Unknown project task '${target}'`);
    return executeCommand("make", [target], projectPath);
  }
  if (name === "git-status") return executeCommand("git", ["status", "--short", "--branch"], projectPath);
  if (!isActionName(name)) throw new Error(`Unknown action '${name}'. Allowed actions: ${Object.keys(ACTIONS).join(", ")}`);

  const [command, ...args] = ACTIONS[name];
  const withProject = name === "editor" && projectPath ? [...args, projectPath] : args;
  return executeCommand(command, withProject);
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
