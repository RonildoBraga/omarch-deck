import type { DrawContext, LoupedeckCT, Touch } from "loupedeck";
import { executeAction, workspaceFocus, workspaceMove } from "./actions.js";
import type { DeckConfig } from "./config.js";
import { watchDesktop, type DesktopWatcher } from "./desktop-events.js";
import { drawIcon } from "./icons.js";
import { BUTTONS, DIALS, STRIP_DIALS, WORKSPACE_BUTTONS, type DialLayout, type Step } from "./layout.js";
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
// The run loop no longer polls the desktop; it waits for Hyprland to say
// something changed. This tick only re-checks flags, so it costs a timer rather
// than four processes.
const IDLE_TICK_MS = 200;
// Backstop: catches the git branch, which Hyprland knows nothing about, and any
// event the watcher missed while reconnecting.
const SAFETY_REFRESH_MS = 30_000;

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

// Larger than the 37.8px key-tile icons: a strip glyph sits alone in a 60x90
// band, so it can afford the width.
export const STRIP_ICON_SIZE = 40;

// Exported so the rendering can be inspected off-device: this paints onto a
// 60x270 surface no test rig can see, and eyeballing a PNG beats guessing.
export function stripPainter(side: "left" | "right") {
  return (context: DrawContext, width: number, height: number): void => {
    context.fillStyle = THEME.strip;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = THEME.icon;
    context.fillStyle = THEME.icon;
    const ids = STRIP_DIALS[side];
    const band = height / ids.length;
    for (const [index, id] of ids.entries()) {
      const glyph = DIALS.find(candidate => candidate.id === id)?.strip;
      if (!glyph) continue;
      drawIcon(context, glyph, width / 2, band * (index + 0.5), STRIP_ICON_SIZE);
    }
  };
}

// The side strips are touch-sensitive — the library routes x<60 to screen
// "left" and x>=420 to "right" — and each strip names three dials whose press
// action is otherwise undiscoverable. Tapping a glyph fires its dial's press.
const STRIP_HEIGHT = 270;

export function stripDialAt(side: "left" | "right", y: number, height = STRIP_HEIGHT): DialLayout["id"] | undefined {
  const ids = STRIP_DIALS[side];
  const band = Math.floor((y / height) * ids.length);
  return ids[Math.min(Math.max(band, 0), ids.length - 1)];
}

type TouchTarget =
  | { kind: "key"; key: number; page: PageName }
  | { kind: "dial"; id: DialLayout["id"] };

interface TouchStart { at: number; target: TouchTarget }

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// send() returns undefined when the port is not ready. Awaiting that is a
// silent no-op rather than a painted frame, but it is what this firmware does;
// normalise it so it cannot leak into a Promise<void>.
function settled(pending: Promise<void> | undefined): Promise<void> {
  return pending ?? Promise.resolve();
}

// Per-input logging is useful when mapping a new device and pure noise
// afterwards; the deck emitted tens of thousands of lines a day with it on.
const DEBUG = process.env.OMARCH_DECK_LOG === "debug";

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
  // Result of a dial action, held back until its rotation queue drains.
  private queuedStatus: { title: string; detail: string } | undefined;
  private refreshDue = true;
  private statusRestore: NodeJS.Timeout | undefined;
  private watcher: DesktopWatcher | undefined;
  private stopped = false;
  private disconnected = false;
  private loopExited = false;
  private rendering: Promise<void> = Promise.resolve();

  constructor(
    private readonly deck: LoupedeckCT,
    private readonly config: DeckConfig,
    // Overridable so the escalation can be tested without a five second wait.
    private readonly disconnectGraceMs: number = POST_DISCONNECT_GRACE_MS,
  ) {}

  async start(): Promise<void> {
    this.bindEvents();
    await this.deck.setBrightness(this.config.device.brightness);
    await this.renderStrips();
    await this.renderPage("main");
    this.initializePhysicalLights();
    console.log("[device] dashboard active: main page, workspace LEDs, and global dials ready");

    this.watcher = watchDesktop(() => { this.refreshDue = true; });
    let nextSafetyRefresh = Date.now() + SAFETY_REFRESH_MS;
    try {
      while (!this.stopped && !this.disconnected) {
        if (this.refreshDue || Date.now() >= nextSafetyRefresh) {
          this.refreshDue = false;
          nextSafetyRefresh = Date.now() + SAFETY_REFRESH_MS;
          await this.updateDesktopState();
        }
        await delay(IDLE_TICK_MS);
      }
    } finally {
      this.loopExited = true;
      this.watcher?.close();
      this.watcher = undefined;
      if (this.statusRestore) clearTimeout(this.statusRestore);
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
      // Normally the loop notices `disconnected` and unwinds within a tick, and
      // the worker reconnects in-process — so only escalate if it is genuinely
      // still stuck, never merely because a disconnect happened.
      setTimeout(() => {
        if (this.stopped || this.loopExited) return;
        console.error("[device] still blocked on the device after disconnect; restarting");
        process.exit(RESTART_EXIT_CODE);
      }, this.disconnectGraceMs).unref();
    });
    this.deck.on("down", ({ id }) => {
      const name = String(id);
      this.held.add(name);
      if (DEBUG) console.log(`[input] down ${name}`);
      void this.onButtonDown(name).catch(error => console.error(`[input] ${name}: ${errorMessage(error)}`));
    });
    this.deck.on("up", ({ id }) => {
      const name = String(id);
      this.held.delete(name);
      if (DEBUG) console.log(`[input] up ${name}`);
    });
    this.deck.on("rotate", ({ id, delta }) => {
      if (DEBUG) console.log(`[input] rotate ${id} delta=${delta}`);
      this.queueRotate(id, delta);
    });
    this.deck.on("touchstart", ({ changedTouches }) => {
      for (const touch of changedTouches) {
        if (DEBUG) console.log(`[input] touchstart x=${touch.x} y=${touch.y} screen=${touch.target.screen} key=${touch.target.key}`);
        this.onTouchStart(touch);
      }
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

  // `announce` paints a "Running…" frame before the action. That frame is a
  // 240x240x2 = 115,200-byte transfer costing roughly 700ms on this firmware —
  // several times the action itself — so dial rotations skip it and report
  // once the spin settles instead. A button press keeps it: those actions are
  // slow enough that the acknowledgement is worth more than the latency.
  private async perform(step: Step, announce = true): Promise<void> {
    const { invoke } = step;
    if (typeof invoke === "string") await this.runAction(invoke, step.label, announce);
    else if ("run" in invoke) await this.run(step.label, invoke.run, announce);
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
        // The spin has settled; now spend one frame saying what it did.
        const status = this.queuedStatus;
        this.queuedStatus = undefined;
        if (status) await this.showStatus(status.title, status.detail);
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
    if (dial) await this.perform(delta < 0 ? dial.counterClockwise : dial.clockwise, false);
  }

  private onTouchStart(touch: Touch): void {
    const target = this.touchTarget(touch);
    if (!target) return;
    this.touchStarts.set(touch.id, { at: Date.now(), target });
  }

  private touchTarget(touch: Touch): TouchTarget | undefined {
    const screen = touch.target.screen;
    if (screen === "center") {
      if (touch.target.key === undefined) return undefined;
      return { kind: "key", key: touch.target.key, page: this.page };
    }
    if (screen !== "left" && screen !== "right") return undefined;
    const id = stripDialAt(screen, touch.y);
    return id ? { kind: "dial", id } : undefined;
  }

  private async onTouchEnd(touch: Touch): Promise<void> {
    const start = this.touchStarts.get(touch.id);
    this.touchStarts.delete(touch.id);
    if (!start) return;
    const { target } = start;
    if (target.kind === "dial") {
      const dial = DIALS.find(candidate => candidate.id === target.id);
      if (dial) await this.perform(dial.press);
      return;
    }
    const binding = PAGES[target.page][target.key];
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

  private async runAction(action: string, label: string, announce = true): Promise<void> {
    await this.run(label, () => executeAction(action, this.config.project.path), announce);
  }

  private async run(label: string, action: () => Promise<{ message: string }>, announce = true): Promise<void> {
    if (announce) await this.showStatus(label, "Running…");
    try {
      const result = await action();
      console.log(`[action] ${label}: ${result.message}`);
      if (announce) await this.showStatus(label, result.message);
      else this.queuedStatus = { title: label, detail: result.message };
    } catch (error) {
      console.error(`[action] ${label}: ${errorMessage(error)}`);
      if (announce) await this.showStatus("Action failed", label);
      else this.queuedStatus = { title: "Action failed", detail: label };
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

  // The 60px strips either side of the keys name the three dials beside them —
  // without this the dials are unlabelled, and the strips would also keep
  // whatever the firmware last showed. Painted once per connect only: each
  // strip is a 32,400-byte transfer and this firmware's draw acknowledgements
  // are slow and highly variable, so this must never run on the state poll.
  private renderStrips(): Promise<void> {
    return Promise.all([
      this.deck.drawScreen("left", stripPainter("left")),
      this.deck.drawScreen("right", stripPainter("right")),
    ]).then(() => undefined);
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
    if (this.statusRestore) clearTimeout(this.statusRestore);
    this.statusRestore = setTimeout(() => { this.refreshDue = true; }, STATUS_HOLD_MS + 100);
    this.statusRestore.unref();
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
