import { type ActionResult, cycleWindow, fullscreen, workspaceFocus } from "./actions.js";
import type { PageName } from "./pages.js";

// What a physical control does. A string is a registered action name from
// actions.ts; `run` calls a typed helper; `page` switches the touch page;
// `note` only shows a hint on the wheel screen.
export type Invoke =
  | string
  | { run: () => Promise<ActionResult> }
  | { page: PageName }
  | { note: string };

export interface Step { label: string; invoke: Invoke }

export interface DialLayout {
  id: "knobTL" | "knobCL" | "knobBL" | "knobTR" | "knobCR" | "knobBR" | "knobCT";
  name: string;
  counterClockwise: Step;
  clockwise: Step;
  press: Step;
}

export interface ButtonLayout {
  id: "home" | "undo" | "keyboard" | "enter" | "save" | "a" | "b" | "c" | "d" | "e";
  name: string;
  tap: Step;
  /** Behaviour while either Fn key is held. */
  fn?: Step;
}

// This table is the single source of truth for the physical controls: the
// controller executes it and `make docs` renders it.
export const DIALS: readonly DialLayout[] = [
  {
    id: "knobCT", name: "Centre wheel",
    counterClockwise: { label: "Previous workspace", invoke: { run: () => workspaceFocus("e-1") } },
    clockwise: { label: "Next workspace", invoke: { run: () => workspaceFocus("e+1") } },
    press: { label: "Show hint", invoke: { note: "Turn to change workspace" } },
  },
  {
    id: "knobTL", name: "Top left",
    counterClockwise: { label: "Volume −", invoke: "volume-down" },
    clockwise: { label: "Volume +", invoke: "volume-up" },
    press: { label: "Mute", invoke: "volume-mute" },
  },
  {
    id: "knobTR", name: "Top right",
    counterClockwise: { label: "Brightness −", invoke: "brightness-down" },
    clockwise: { label: "Brightness +", invoke: "brightness-up" },
    press: { label: "Night light", invoke: "nightlight" },
  },
  {
    id: "knobCL", name: "Centre left",
    counterClockwise: { label: "Previous window", invoke: { run: () => cycleWindow(false) } },
    clockwise: { label: "Next window", invoke: { run: () => cycleWindow(true) } },
    press: { label: "Next window", invoke: { run: () => cycleWindow(true) } },
  },
  {
    id: "knobCR", name: "Centre right",
    counterClockwise: { label: "Previous tab", invoke: "tab-previous" },
    clockwise: { label: "Next tab", invoke: "tab-next" },
    press: { label: "Next tab", invoke: "tab-next" },
  },
  {
    id: "knobBL", name: "Bottom left",
    counterClockwise: { label: "Page up", invoke: "scroll-up" },
    clockwise: { label: "Page down", invoke: "scroll-down" },
    press: { label: "Page down", invoke: "scroll-down" },
  },
  {
    id: "knobBR", name: "Bottom right",
    counterClockwise: { label: "Zoom out", invoke: "zoom-out" },
    clockwise: { label: "Zoom in", invoke: "zoom-in" },
    press: { label: "Zoom reset", invoke: "zoom-reset" },
  },
];

export const BUTTONS: readonly ButtonLayout[] = [
  { id: "home", name: "Home", tap: { label: "Main page", invoke: { page: "main" } } },
  { id: "undo", name: "Undo", tap: { label: "Undo", invoke: "undo" }, fn: { label: "Redo", invoke: "redo" } },
  { id: "keyboard", name: "Keyboard", tap: { label: "Clipboard menu", invoke: "clipboard" } },
  { id: "enter", name: "Enter", tap: { label: "Enter", invoke: "enter" } },
  { id: "save", name: "Save", tap: { label: "Save", invoke: "save" } },
  { id: "a", name: "A", tap: { label: "tmux session", invoke: "tmux" } },
  { id: "b", name: "B", tap: { label: "Fullscreen", invoke: { run: fullscreen } } },
  { id: "c", name: "C", tap: { label: "Screen record", invoke: "screenrecord" } },
  { id: "d", name: "D", tap: { label: "Do not disturb", invoke: "dnd" } },
  { id: "e", name: "E", tap: { label: "Stay awake", invoke: "stay-awake" } },
];

export const WORKSPACE_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export const WORKSPACE_TAP = "Focus workspace N";
export const WORKSPACE_FN = "Move active window to workspace N";
