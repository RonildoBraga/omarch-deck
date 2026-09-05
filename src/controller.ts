import type { DrawContext, LoupedeckCT, Touch } from "loupedeck";
import { executeAction, workspaceFocus, workspaceMove } from "./actions.js";
import type { DeckConfig } from "./config.js";
import { drawIcon } from "./icons.js";
import { BUTTONS, DIALS, WORKSPACE_BUTTONS, type Step } from "./layout.js";
import { PAGES, THEME, type DeckKey, type PageName } from "./pages.js";
import { readDesktopState, type DesktopState } from "./state.js";

const RESTART_EXIT_CODE = 75;

const PHYSICAL_COLORS: Record<string, string> = {
  home: "#7a0a0a", undo: "#7a0a0a", keyboard: "#7a0a0a", enter: "#7a0a0a",
  save: "#7a0a0a", fnL: "#7a0a0a", fnR: "#7a0a0a",
  a: "#7a0a0a", b: "#7a0a0a", c: "#7a0a0a", d: "#7a0a0a", e: "#7a0a0a",
};

// How long an action's result owns the wheel screen before the dashboard
// returns. Without a deadline a status message stays until the workspace, app,
// or branch happens to change — which for most actions is never.
export const STATUS_HOLD_MS = 2_500;
const CLOSE_TIMEOUT_MS = 2_000;
// The library abandons every pending transaction on disconnect, and its
// promises are only ever resolved by an ack — so a transfer in flight when the
// CT goes away never settles and parks start() forever. Rather than policing
// each transfer (measured: draw latency on this firmware is far too variable
// to put a deadline on), give up only once a disconnect has actually fired.
const POST_DISCONNECT_GRACE_MS = 5_000;

// The wheel screen has two writers — the 750 ms dashboard poll and action
// status messages — and no arbitration between them: the poll only repaints
// when the desktop signature changes, so a status message painted over a
// dashboard that is still "current" became the permanent contents of the
// screen. This owns that decision for both of them.
export class WheelOwnership {
  private statusUntil = 0;
  private lastPainted = "";

  /** An action's status now owns the screen, and the dashboard is stale. */
  claim(now: number): void {
    this.statusUntil = now + STATUS_HOLD_MS;
    this.lastPainted = "";
  }

  /** Whether the dashboard should be painted with this desktop signature. */
  wantsDashboard(now: number, signature: string): boolean {
    return now >= this.statusUntil && signature !== this.lastPainted;
  }

  /** Record a dashboard frame that actually reached the device. */
  recordDashboard(signature: string): void {
    this.lastPainted = signature;
  }
}

interface TouchStart { at: number; key: number; page: PageName }

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// send() returns undefined when the port is not ready. Awaiting that is a
// silent no-op rather than a painted frame, but it is what this firmware does;
// normalise it so it cannot leak into a Promise<void>.
function settled(pending: Promise<void> | undefined): Promise<void> {
  return pending ?? Promise.resolve();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class DeckController {
  private page: PageName = "main";
  private readonly touchStarts = new Map<number, TouchStart>();
  private readonly held = new Set<string>();
  // Per-dial rotation queue: one command in flight, later notches are summed
  // into a pending delta and replayed as a single net step when it finishes.
  private readonly rotations = new Map<string, { running: boolean; pending: number }>();
  private workspaceColors = new Map<number, string>();
  private readonly wheel = new WheelOwnership();
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
    // A wedged port can leave close() pending; shutting down promptly matters
    // more than the close frame, and systemd only waits TimeoutStopSec.
    try { await Promise.race([Promise.resolve(this.deck.close()), delay(CLOSE_TIMEOUT_MS)]); }
    catch (error) { console.error(`[device] close: ${errorMessage(error)}`); }
  }

  private bindEvents(): void {
    this.deck.on("disconnect", error => {
      this.disconnected = true;
      console.error(`[device] disconnected${error ? `: ${error.message}` : ""}`);
      // start() may be parked on a transfer the CT will now never acknowledge.
      // Only reachable after a real disconnect, so it cannot fire on a healthy
      // but slow device.
      setTimeout(() => {
        if (this.stopped) return;
        console.error("[device] still blocked on the device after disconnect; restarting");
        process.exit(RESTART_EXIT_CODE);
      }, POST_DISCONNECT_GRACE_MS).unref();
    });
    this.deck.on("down", ({ id }) => {
      const name = String(id);
      this.held.add(name);
      console.log(`[input] down ${name}`);
      void this.onButtonDown(name).catch(error => console.error(`[input] ${name}: ${errorMessage(error)}`));
    });
    this.deck.on("up", ({ id }) => {
      const name = String(id);
      this.held.delete(name);
      console.log(`[input] up ${name}`);
    });
    this.deck.on("rotate", ({ id, delta }) => {
      console.log(`[input] rotate ${id} delta=${delta}`);
      this.queueRotate(id, delta);
    });
    this.deck.on("touchstart", ({ changedTouches }) => {
      for (const touch of changedTouches) this.onTouchStart(touch);
    });
    this.deck.on("touchend", ({ changedTouches }) => {
      for (const touch of changedTouches) {
        void this.onTouchEnd(touch).catch(error => console.error(`[input] touch: ${errorMessage(error)}`));
      }
    });
  }

  private async onButtonDown(id: string): Promise<void> {
    // Read the modifier once, before any await: showStatus writes a framebuffer
    // to the device, and an Fn release landing in that window would otherwise
    // make the label and the action disagree.
    const fnHeld = this.held.has("fnL") || this.held.has("fnR");
    const numeric = Number(id);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < 8) {
      const workspace = numeric + 1;
      await this.run(
        fnHeld ? `Move to workspace ${workspace}` : `Workspace ${workspace}`,
        () => fnHeld ? workspaceMove(workspace) : workspaceFocus(workspace),
      );
      return;
    }

    const button = BUTTONS.find(candidate => candidate.id === id);
    if (button) { await this.perform(fnHeld && button.fn ? button.fn : button.tap); return; }
    const dial = DIALS.find(candidate => candidate.id === id);
    if (dial) await this.perform(dial.press);
  }

  private async perform(step: Step): Promise<void> {
    const { invoke } = step;
    if (typeof invoke === "string") await this.runAction(invoke, step.label);
    else if ("run" in invoke) await this.run(step.label, invoke.run);
    else if ("page" in invoke) await this.renderPage(invoke.page);
    else await this.showStatus(step.label, invoke.note);
  }

  private queueRotate(id: string, delta: number): void {
    const entry = this.rotations.get(id) ?? { running: false, pending: 0 };
    this.rotations.set(id, entry);
    // Cap the backlog so a fast spin on a slow command (DDC brightness takes
    // ~0.7s per step) doesn't keep stepping for seconds after the dial stops.
    entry.pending = Math.max(-3, Math.min(3, entry.pending + delta));
    if (entry.running) return;
    entry.running = true;
    void (async () => {
      try {
        while (entry.pending !== 0) {
          const step = Math.sign(entry.pending);
          entry.pending -= step;
          await this.onRotate(id, step);
        }
      } catch (error) {
        console.error(`[input] rotate ${id}: ${errorMessage(error)}`);
      } finally {
        // Always release the dial: a stuck running flag would silently ignore
        // every later notch on it for the life of the process.
        entry.pending = 0;
        entry.running = false;
      }
    })();
  }

  private async onRotate(id: string, delta: number): Promise<void> {
    const dial = DIALS.find(candidate => candidate.id === id);
    if (dial) await this.perform(delta < 0 ? dial.counterClockwise : dial.clockwise);
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
      if (this.wheel.wantsDashboard(Date.now(), signature)) {
        await this.renderWheel(state);
        // Only record the frame once it actually reached the screen.
        this.wheel.recordDashboard(signature);
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
    return settled(this.deck.drawScreen("knob", (context, width, height) => {
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
    }));
  }

  private showStatus(title: string, detail: string): Promise<void> {
    // Claim the wheel for a moment and mark the dashboard dirty, so the poll
    // restores it once the status expires instead of assuming it is still up.
    this.wheel.claim(Date.now());
    return settled(this.deck.drawScreen("knob", (context, width, height) => {
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
    }))
      // A display failure must not take down the input handler that triggered it.
      .catch(error => console.error(`[display] ${errorMessage(error)}`));
  }
}
