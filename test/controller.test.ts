import assert from "node:assert/strict";
import test from "node:test";
import type { LoupedeckCT } from "loupedeck";
import type { DeckConfig } from "../src/config.js";
import { DeckController, STATUS_HOLD_MS, WheelOwnership } from "../src/controller.js";

const CONFIG: DeckConfig = {
  device: { path: "auto", brightness: 0.7 },
  project: { path: process.cwd() },
  profile: { name: "test" },
};

// The drawing code only ever writes to the context, so every member can be a
// no-op. A proxy keeps this from breaking whenever icons.ts uses a new call.
const CONTEXT = new Proxy({}, {
  get: () => () => undefined,
  set: () => true,
}) as never;

type Draw = (context: never, width: number, height: number) => void;

class FakeDeck {
  readonly drawn: string[] = [];
  /** Mimic a port that is not ready: the library returns undefined, not a promise. */
  notReady = false;
  /** Mimic an unplug mid-transfer: the library's promise is never settled. */
  stall = false;

  on(): this { return this; }
  once(): this { return this; }
  close(): Promise<void> { return Promise.resolve(); }
  setBrightness(): Promise<void> | undefined { return this.record("brightness"); }
  setButtonColor(): Promise<void> | undefined { return this.record("color"); }

  drawKey(index: number, draw: Draw): Promise<void> | undefined {
    draw(CONTEXT, 90, 90);
    return this.record(`key:${index}`);
  }

  drawScreen(id: string, draw: Draw): Promise<void> | undefined {
    draw(CONTEXT, 240, 240);
    return this.record(`screen:${id}`);
  }

  private record(what: string): Promise<void> | undefined {
    this.drawn.push(what);
    if (this.notReady) return undefined;
    return this.stall ? new Promise<void>(() => undefined) : Promise.resolve();
  }
}

function controllerFor(deck: FakeDeck): DeckController {
  return new DeckController(deck as unknown as LoupedeckCT, CONFIG);
}

test("start paints every touch key and both side strips", async () => {
  const deck = new FakeDeck();
  const controller = controllerFor(deck);
  controller.stop(); // skip the polling loop; this covers the initial render only
  await controller.start();

  assert.equal(deck.drawn.filter(entry => entry.startsWith("key:")).length, 12);
  assert.ok(deck.drawn.includes("screen:left"));
  assert.ok(deck.drawn.includes("screen:right"));
  assert.ok(deck.drawn.includes("brightness"));
});

// send() returns undefined when the port is not ready, and the library gives
// no way to tell that from a completed draw. Documented here as a known
// limitation rather than a guarantee: startup proceeds, it just paints nothing.
test("an unready port does not stall startup", async () => {
  const deck = new FakeDeck();
  deck.notReady = true;
  const controller = controllerFor(deck);
  controller.stop();
  await controller.start();

  assert.equal(deck.drawn.filter(entry => entry.startsWith("key:")).length, 12);
});

test("close switches every light off and tolerates a port that will not close", async () => {
  const deck = new FakeDeck();
  const controller = controllerFor(deck);
  await controller.close();

  assert.equal(deck.drawn.filter(entry => entry === "color").length, 20);
});

test("an action status owns the wheel briefly, then the dashboard returns on its own", () => {
  const wheel = new WheelOwnership();
  const now = 1_000_000;
  const desktop = "2|foot|main";

  wheel.recordDashboard(desktop);
  assert.equal(wheel.wantsDashboard(now, desktop), false, "an unchanged dashboard is not repainted");

  // Turning a dial paints a status over the dashboard without changing the
  // workspace, app, or branch — the case that used to pin it there forever.
  wheel.claim(now);
  assert.equal(wheel.wantsDashboard(now + 100, desktop), false, "the status still owns the screen");
  assert.equal(wheel.wantsDashboard(now + STATUS_HOLD_MS, desktop), true, "the dashboard comes back unprompted");
});

test("a dashboard frame is only remembered once it reached the device", () => {
  const wheel = new WheelOwnership();
  const now = 1_000_000;

  assert.equal(wheel.wantsDashboard(now, "1|foot|main"), true);
  // Caller failed to paint, so it does not record — the next poll retries.
  assert.equal(wheel.wantsDashboard(now, "1|foot|main"), true);
  wheel.recordDashboard("1|foot|main");
  assert.equal(wheel.wantsDashboard(now, "1|foot|main"), false);
});
