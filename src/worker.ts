import { constants } from "node:fs";
import { access } from "node:fs/promises";
import type { LoupedeckCT } from "loupedeck";
import { loadConfig } from "./config.js";
import { DeckController } from "./controller.js";
import { createCt, findCt } from "./device.js";

const RETRY_DELAY_MS = 3_000;
const PERMISSION_RETRY_DELAY_MS = 15_000;
const CONNECT_TIMEOUT_MS = 5_000;
const CLOSE_TIMEOUT_MS = 2_000;
const RESTART_EXIT_CODE = 75;

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function connectWithTimeout(connect: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS);
  });
  try { await Promise.race([connect, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

// The library's close() writes a close frame first, which can hang on a wedged
// port. Closing matters — an abandoned port is what wedges the CT in the first
// place — but not enough to block shutdown on it.
async function closeQuietly(deck: LoupedeckCT): Promise<void> {
  try { await Promise.race([Promise.resolve(deck.close()), delay(CLOSE_TIMEOUT_MS)]); }
  catch { /* the port is going away regardless */ }
}

// LoupedeckDevice.list() enumerates through sysfs and succeeds without any
// access to the device node, so a missing udev rule does not surface until
// SerialPort emits EACCES and connect() hangs — which the handshake-recovery
// path below would then misreport as a wedged device.
async function isOpenable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// The retry branch below runs every 3s while the CT is unplugged. Logging it
// each time produced ~28,800 identical lines a day; log the state, not the tick.
function makeStateLogger(): (message: string) => void {
  let previous = "";
  return (message: string): void => {
    if (message === previous) return;
    previous = message;
    console.log(message);
  };
}

async function main(): Promise<void> {
  const { config, path } = await loadConfig();
  console.log(`[config] loaded ${path} (${config.profile.name}); project=${config.project.path}`);
  console.log("[device] looking for Loupedeck CT (USB 2ec2:0003 or 2ec2:0007)");

  let stopping = false;
  let controller: DeckController | undefined;
  const logState = makeStateLogger();
  const stop = (): void => { stopping = true; controller?.stop(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    let deck: LoupedeckCT | undefined;
    let connectError: Error | undefined;
    try {
      const info = await findCt(config.device.path);
      if (!info?.path) {
        logState(`[device] not available; retrying every ${RETRY_DELAY_MS / 1000}s`);
        await delay(RETRY_DELAY_MS);
        continue;
      }

      logState(`[device] found ${info.path} (${info.vendorId?.toString(16)}:${info.productId?.toString(16).padStart(4, "0")})`);
      if (!await isOpenable(info.path)) {
        console.error(`[device] cannot open ${info.path}: permission denied. ` +
          "Run 'make udev-install', then reconnect the CT. Do not run omarch-deck as root.");
        await delay(PERMISSION_RETRY_DELAY_MS);
        continue;
      }

      deck = createCt(info.path);
      // The serial connection reports open failures as a 'disconnect' while
      // connect() simply never settles, so keep the real cause for the log.
      deck.once("disconnect", (error?: Error) => { if (error) connectError = error; });
      await connectWithTimeout(deck.connect());
      const deviceInfo = await deck.getInfo();
      console.log(`[device] connected; serial=${deviceInfo.serial} firmware=${deviceInfo.version}`);
      // SIGTERM can land anywhere in the connect above, where `controller` is
      // still undefined and stop() has nothing to cancel. Without this check the
      // dashboard starts anyway and systemd SIGKILLs it — the hard kill that
      // wedges the CT.
      if (stopping) { await closeQuietly(deck); break; }
      controller = new DeckController(deck, config);
      await controller.start();
      await controller.close();
      controller = undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[device] ${message}${connectError ? ` (${connectError.message})` : ""}`);
      // Close before doing anything else: leaving the port open is the unclean
      // disconnect that wedges this firmware, and the restart below exists to
      // recover from exactly that.
      if (deck) await closeQuietly(deck);
      if (message.startsWith("Connection timed out")) {
        console.log("[device] restarting client to recover firmware 0.1.x handshake");
        process.exit(RESTART_EXIT_CODE);
      }
    }
    if (!stopping) await delay(RETRY_DELAY_MS);
  }
  console.log("[omarch-deck] stopped");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
