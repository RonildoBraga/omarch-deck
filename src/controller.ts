import type { DrawContext, LoupedeckCT, Touch } from "loupedeck";
import { cycleWindow, executeAction, workspaceFocus, workspaceMove } from "./actions.js";
import type { DeckConfig } from "./config.js";
import { drawIcon } from "./icons.js";
import { PAGES, THEME, type DeckKey, type PageName } from "./pages.js";
import { readDesktopState, type DesktopState } from "./state.js";

const WORKSPACE_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const PHYSICAL_COLORS: Record<string, string> = {
  home: "#7a0a0a", undo: "#7a0a0a", keyboard: "#7a0a0a", enter: "#7a0a0a",
  save: "#7a0a0a", fnL: "#7a0a0a", fnR: "#7a0a0a",
  a: "#7a0a0a", b: "#7a0a0a", c: "#7a0a0a", d: "#7a0a0a", e: "#7a0a0a",
};

interface TouchStart { at: number; key: number; page: PageName }

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class DeckController {
  private page: PageName = "main";
  private readonly touchStarts = new Map<number, TouchStart>();
  private readonly held = new Set<string>();
  private workspaceColors = new Map<number, string>();
  private lastWheelState = "";
  private stopped = false;
  private disconnected = false;
  private rendering: Promise<void> = Promise.resolve();

  constructor(private readonly deck: LoupedeckCT, private readonly config: DeckConfig) {}

  async start(): Promise<void> {
    this.bindEvents();
    await this.deck.setBrightness(this.config.device.brightness);
    await this.renderStrips();
    await this.renderPage("main");
    this.initializePhysicalLights();
    console.log("[device] dashboard active: main page, workspace LEDs, and global dials ready");

    while (!this.stopped && !this.disconnected) {
      await this.updateDesktopState();
      await delay(750);
    }
  }

  stop(): void { this.stopped = true; }

  async close(): Promise<void> {
    for (const id of WORKSPACE_BUTTONS) void this.deck.setButtonColor({ id, color: "#000000" });
    for (const id of Object.keys(PHYSICAL_COLORS)) void this.deck.setButtonColor({ id, color: "#000000" });
    await delay(100);
    await this.deck.close();
  }

  private bindEvents(): void {
    this.deck.on("disconnect", error => {
      this.disconnected = true;
      console.error(`[device] disconnected${error ? `: ${error.message}` : ""}`);
    });
    this.deck.on("down", ({ id }) => {
      const name = String(id);
      this.held.add(name);
      console.log(`[input] down ${name}`);
      void this.onButtonDown(name);
    });
    this.deck.on("up", ({ id }) => {
      const name = String(id);
      this.held.delete(name);
      console.log(`[input] up ${name}`);
    });
    this.deck.on("rotate", ({ id, delta }) => {
      console.log(`[input] rotate ${id} delta=${delta}`);
      void this.onRotate(id, delta);
    });
    this.deck.on("touchstart", ({ changedTouches }) => {
      for (const touch of changedTouches) this.onTouchStart(touch);
    });
    this.deck.on("touchend", ({ changedTouches }) => {
      for (const touch of changedTouches) void this.onTouchEnd(touch);
    });
  }

  private async onButtonDown(id: string): Promise<void> {
    const numeric = Number(id);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < 8) {
      const workspace = numeric + 1;
      await this.run(
        this.held.has("fnL") || this.held.has("fnR") ? `Move to workspace ${workspace}` : `Workspace ${workspace}`,
        () => this.held.has("fnL") || this.held.has("fnR") ? workspaceMove(workspace) : workspaceFocus(workspace),
      );
      return;
    }

    switch (id) {
      case "home": await this.renderPage("main"); break;
      case "save": await this.runAction("save", "Save"); break;
      case "undo": await this.runAction(this.held.has("fnL") || this.held.has("fnR") ? "redo" : "undo", "Undo / Redo"); break;
      case "keyboard": await this.runAction("clipboard", "Clipboard"); break;
      case "enter": await this.runAction("enter", "Enter"); break;
      case "knobTL": await this.runAction("volume-mute", "Volume mute"); break;
      case "knobTR": await this.runAction("nightlight", "Night light"); break;
      case "knobCL": await this.run("Next window", () => cycleWindow(true)); break;
      case "knobCR": await this.runAction("tab-next", "Next tab"); break;
      case "knobBL": await this.runAction("scroll-down", "Page down"); break;
      case "knobBR": await this.runAction("zoom-reset", "Zoom reset"); break;
      case "knobCT": await this.showStatus("Workspace", "Use wheel to navigate"); break;
    }
  }

  private async onRotate(id: string, delta: number): Promise<void> {
    const negative = delta < 0;
    switch (id) {
      case "knobCT": await this.run(`Workspace ${negative ? "previous" : "next"}`, () => workspaceFocus(negative ? "e-1" : "e+1")); break;
      case "knobTL": await this.runAction(negative ? "volume-down" : "volume-up", `Volume ${negative ? "−" : "+"}`); break;
      case "knobTR": await this.runAction(negative ? "brightness-down" : "brightness-up", `Brightness ${negative ? "−" : "+"}`); break;
      case "knobCL": await this.run(`Window ${negative ? "previous" : "next"}`, () => cycleWindow(!negative)); break;
      case "knobCR": await this.runAction(negative ? "tab-previous" : "tab-next", `Tab ${negative ? "previous" : "next"}`); break;
      case "knobBL": await this.runAction(negative ? "scroll-up" : "scroll-down", `Page ${negative ? "up" : "down"}`); break;
      case "knobBR": await this.runAction(negative ? "zoom-out" : "zoom-in", `Zoom ${negative ? "−" : "+"}`); break;
    }
  }

  private onTouchStart(touch: Touch): void {
    if (touch.target.screen !== "center" || touch.target.key === undefined) return;
    this.touchStarts.set(touch.id, { at: Date.now(), key: touch.target.key, page: this.page });
  }

  private async onTouchEnd(touch: Touch): Promise<void> {
    const start = this.touchStarts.get(touch.id);
    this.touchStarts.delete(touch.id);
    if (!start) return;
    const binding = PAGES[start.page][start.key];
    if (!binding) return;
    const heldFor = Date.now() - start.at;
    if (binding.holdMs && heldFor < binding.holdMs) {
      await this.showStatus(binding.label, `Hold for ${(binding.holdMs / 1000).toFixed(1)}s`);
      return;
    }
    await this.activateKey(binding);
  }

  private async activateKey(binding: DeckKey): Promise<void> {
    if (binding.page) await this.renderPage(binding.page);
    else if (binding.action) await this.runAction(binding.action, binding.label);
  }

  private async runAction(action: string, label: string): Promise<void> {
    await this.run(label, () => executeAction(action, this.config.project.path));
  }

  private async run(label: string, action: () => Promise<{ message: string }>): Promise<void> {
    await this.showStatus(label, "Running…");
    try {
      const result = await action();
      console.log(`[action] ${label}: ${result.message}`);
      await this.showStatus(label, result.message);
    } catch (error) {
      console.error(`[action] ${label}: ${errorMessage(error)}`);
      await this.showStatus("Action failed", label);
    }
  }

  private renderPage(page: PageName): Promise<void> {
    this.page = page;
    this.rendering = this.rendering.then(async () => {
      const keys = PAGES[page];
      for (const [index, key] of keys.entries()) {
        await this.deck.drawKey(index, (context, width, height) => {
          context.fillStyle = key.color;
          context.fillRect(0, 0, width, height);
          const iconColor = key.iconColor ?? THEME.icon;
          context.strokeStyle = iconColor;
          context.fillStyle = iconColor;
          drawIcon(context, key.icon, width / 2, height * 0.4, width * 0.42);
          context.fillStyle = THEME.text;
          context.font = "bold 13px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(key.label, width / 2, height * 0.82, width - 8);
        });
      }
    }).catch(error => console.error(`[display] ${errorMessage(error)}`));
    return this.rendering;
  }

  // The 60px strips either side of the keys are never drawn otherwise and
  // would keep whatever the firmware last showed.
  private renderStrips(): Promise<void> {
    const paint = (context: DrawContext, width: number, height: number): void => {
      context.fillStyle = THEME.strip;
      context.fillRect(0, 0, width, height);
    };
    return Promise.all([this.deck.drawScreen("left", paint), this.deck.drawScreen("right", paint)]).then(() => undefined);
  }

  private initializePhysicalLights(): void {
    for (const [id, color] of Object.entries(PHYSICAL_COLORS)) void this.deck.setButtonColor({ id, color });
  }

  private async updateDesktopState(): Promise<void> {
    try {
      const state = await readDesktopState(this.config.project.path);
      this.updateWorkspaceLights(state);
      const signature = `${state.activeWorkspace}|${state.app}|${state.branch}`;
      if (signature !== this.lastWheelState) {
        this.lastWheelState = signature;
        await this.renderWheel(state);
      }
    } catch (error) {
      console.error(`[state] ${errorMessage(error)}`);
    }
  }

  private updateWorkspaceLights(state: DesktopState): void {
    for (const [index, id] of WORKSPACE_BUTTONS.entries()) {
      const workspace = index + 1;
      const color = state.activeWorkspace === workspace
        ? "#b91c1c"
        : state.occupiedWorkspaces.has(workspace) ? "#3f0d0d" : "#000000";
      if (this.workspaceColors.get(id) === color) continue;
      this.workspaceColors.set(id, color);
      void this.deck.setButtonColor({ id, color });
    }
  }

  private renderWheel(state: DesktopState): Promise<void> {
    return this.deck.drawScreen("knob", (context, width, height) => {
      context.fillStyle = THEME.screenBg;
      context.fillRect(0, 0, width, height);
      context.fillStyle = THEME.accent;
      context.font = "bold 76px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(state.activeWorkspace), width / 2, 82);
      context.fillStyle = THEME.text;
      context.font = "bold 22px sans-serif";
      context.fillText(state.app.slice(0, 16), width / 2, 150, width - 28);
      context.fillStyle = THEME.muted;
      context.font = "18px sans-serif";
      context.fillText(state.branch.slice(0, 20), width / 2, 190, width - 28);
    });
  }

  private showStatus(title: string, detail: string): Promise<void> {
    return this.deck.drawScreen("knob", (context, width, height) => {
      context.fillStyle = THEME.screenBg;
      context.fillRect(0, 0, width, height);
      context.fillStyle = THEME.accent;
      context.font = "bold 25px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(title.slice(0, 18), width / 2, 100, width - 24);
      context.fillStyle = THEME.text;
      context.font = "17px sans-serif";
      context.fillText(detail.slice(0, 26), width / 2, 145, width - 24);
    });
  }
}
