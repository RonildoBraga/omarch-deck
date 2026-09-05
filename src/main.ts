import { spawn } from "node:child_process";
import { resolveRuntimePaths } from "./paths.js";

const RESTART_EXIT_CODE = 75;
// After this many back-to-back handshake failures the device is wedged and
// only a USB replug recovers it; keep trying, but slowly and with a hint.
const FAST_RESTART_LIMIT = 5;
const FAST_RESTART_DELAY_MS = 500;
const SLOW_RESTART_DELAY_MS = 30_000;
const { worker: workerPath, workerArgs, fontConfig: fontConfigPath } = resolveRuntimePaths(import.meta.url);

async function run(): Promise<void> {
  let stopping = false;
  let restarts = 0;
  let child: ReturnType<typeof spawn> | undefined;
  // FONTCONFIG_FILE last so it wins: node-canvas ships a fontconfig that cannot
  // parse the system configuration and warns on every start.
  const env = { ...process.env, FONTCONFIG_FILE: fontConfigPath };
  const stop = (signal: NodeJS.Signals): void => {
    stopping = true;
    child?.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  while (!stopping) {
    const startedAt = Date.now();
    const started = spawn(process.execPath, workerArgs, { stdio: "inherit", env });
    child = started;
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
      // A failed spawn emits 'error' and may never emit 'exit'; without this the
      // supervisor would wait forever instead of reporting the failure.
      started.once("error", error => {
        console.error(`[worker] failed to start ${workerPath}: ${error.message}`);
        resolve({ code: 1, signal: null });
      });
      started.once("exit", (code, signal) => resolve({ code, signal }));
    });
    child = undefined;

    if (stopping) break;
    // A signal we did not send means the worker crashed — a native fault in
    // node-canvas or serialport, or the OOM killer. That is precisely what this
    // supervisor exists for, so restart rather than exiting 0 and letting
    // systemd's Restart=on-failure treat the crash as a clean shutdown.
    const crashed = result.signal !== null;
    if (crashed) {
      console.error(`[worker] killed by ${result.signal}; restarting`);
    } else if (result.code !== RESTART_EXIT_CODE) {
      process.exitCode = result.code ?? 1;
      break;
    }
    // A worker that stayed up for a while had connected; count from scratch.
    restarts = Date.now() - startedAt > 60_000 ? 1 : restarts + 1;
    if (restarts === FAST_RESTART_LIMIT && !crashed) {
      console.error(`[device] ${restarts} handshake failures in a row: the CT is probably wedged. ` +
        "Unplug its USB cable and plug it back in; retrying every 30s.");
    }
    await new Promise(resolve => setTimeout(resolve, restarts >= FAST_RESTART_LIMIT ? SLOW_RESTART_DELAY_MS : FAST_RESTART_DELAY_MS));
  }
}

void run();
