import { fileURLToPath } from "node:url";

// The supervisor spawns the worker as a sibling module and points node-canvas
// at the project's fontconfig. Both paths depend on whether it was started from
// the compiled tree (dist/src/main.js) or straight from TypeScript
// (`make dev` runs tsx src/main.ts), so derive them from the entry point rather
// than assuming one layout.
export interface RuntimePaths {
  /** Absolute path to the worker module to spawn. */
  worker: string;
  /** Argv for `node`, including the tsx loader when running from source. */
  workerArgs: string[];
  /** Absolute path to the repository's fonts.conf. */
  fontConfig: string;
}

export function resolveRuntimePaths(moduleUrl: string): RuntimePaths {
  const fromSource = moduleUrl.endsWith(".ts");
  const worker = fileURLToPath(new URL(fromSource ? "worker.ts" : "worker.js", moduleUrl));
  const fontConfig = fileURLToPath(new URL(fromSource ? "../fonts.conf" : "../../fonts.conf", moduleUrl));
  return {
    worker,
    workerArgs: fromSource ? ["--import", "tsx", worker] : [worker],
    fontConfig,
  };
}
