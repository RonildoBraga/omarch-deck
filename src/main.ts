import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const RESTART_EXIT_CODE = 75;
const workerPath = fileURLToPath(new URL("worker.js", import.meta.url));

async function run(): Promise<void> {
  let stopping = false;
  let child: ReturnType<typeof spawn> | undefined;
  const stop = (signal: NodeJS.Signals): void => {
    stopping = true;
    child?.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  while (!stopping) {
    child = spawn(process.execPath, [workerPath], { stdio: "inherit", env: process.env });
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
      child?.once("exit", (code, signal) => resolve({ code, signal }));
    });
    child = undefined;

    if (stopping || result.signal) break;
    if (result.code !== RESTART_EXIT_CODE) {
      process.exitCode = result.code ?? 1;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

void run();
