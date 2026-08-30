import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export const ACTIONS = {
  terminal: ["omarchy", "launch", "terminal"],
  browser: ["omarchy", "launch", "browser"],
  "lock-screen": ["omarchy", "system", "lock"],
  "previous-workspace": ["hyprctl", "dispatch", "workspace", "e-1"],
  "next-workspace": ["hyprctl", "dispatch", "workspace", "e+1"],
  "volume-down": ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"],
  "volume-up": ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%+"],
  "volume-mute": ["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type ActionName = keyof typeof ACTIONS;

export function isActionName(value: string): value is ActionName {
  return Object.hasOwn(ACTIONS, value);
}

export async function executeAction(name: string): Promise<void> {
  if (!isActionName(name)) {
    throw new Error(`Unknown action '${name}'. Allowed actions: ${Object.keys(ACTIONS).join(", ")}`);
  }

  const [command, ...args] = ACTIONS[name];
  await runFile(command, args, { timeout: 10_000 });
}
