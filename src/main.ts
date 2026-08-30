import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const RESTART_EXIT_CODE = 75;
// After this many back-to-back handshake failures the device is wedged and
// only a USB replug recovers it; keep trying, but slowly and with a hint.
const FAST_RESTART_LIMIT = 5;
const FAST_RESTART_DELAY_MS = 500;
const SLOW_RESTART_DELAY_MS = 30_000;
const workerPath = fileURLToPath(new URL("worker.js", import.meta.url));
const fontConfigPath = fileURLToPath(new URL("../../fonts.conf", import.meta.url));

async function run(): Promise<void> {
  let stopping = false;
  let restarts = 0;
  let child: ReturnType<typeof spawn> | undefined;
  const env = { FONTCONFIG_FILE: fontConfigPath, ...process.env };
  const stop = (signal: NodeJS.Signals): void => {
    stopping = true;
    child?.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  while (!stopping) {
    const startedAt = Date.now();
    child = spawn(process.execPath, [workerPath], { stdio: "inherit", env });
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
      child?.once("exit", (code, signal) => resolve({ code, signal }));
    });
    child = undefined;

    if (stopping || result.signal) break;
    if (result.code !== RESTART_EXIT_CODE) {
      process.exitCode = result.code ?? 1;
      break;
    }
    // A worker that stayed up for a while had connected; count from scratch.
    restarts = Date.now() - startedAt > 60_000 ? 1 : restarts + 1;
    if (restarts === FAST_RESTART_LIMIT) {
      console.error(`[device] ${restarts} handshake failures in a row: the CT is probably wedged. ` +
        "Unplug its USB cable and plug it back in; retrying every 30s.");
    }
    await new Promise(resolve => setTimeout(resolve, restarts >= FAST_RESTART_LIMIT ? SLOW_RESTART_DELAY_MS : FAST_RESTART_DELAY_MS));
  }
}

void run();
