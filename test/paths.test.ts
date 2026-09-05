import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimePaths } from "../src/paths.js";

test("the compiled supervisor spawns dist/src/worker.js with plain node", () => {
  const paths = resolveRuntimePaths("file:///opt/omarch-deck/dist/src/main.js");
  assert.equal(paths.worker, "/opt/omarch-deck/dist/src/worker.js");
  assert.deepEqual(paths.workerArgs, ["/opt/omarch-deck/dist/src/worker.js"]);
  assert.equal(paths.fontConfig, "/opt/omarch-deck/fonts.conf");
});

// `make dev` runs tsx against src/, where both a worker.js sibling and a
// ../../fonts.conf are one directory off. Getting this wrong made the
// documented dev workflow fail with MODULE_NOT_FOUND.
test("running from source spawns worker.ts through the tsx loader", () => {
  const paths = resolveRuntimePaths("file:///opt/omarch-deck/src/main.ts");
  assert.equal(paths.worker, "/opt/omarch-deck/src/worker.ts");
  assert.deepEqual(paths.workerArgs, ["--import", "tsx", "/opt/omarch-deck/src/worker.ts"]);
  assert.equal(paths.fontConfig, "/opt/omarch-deck/fonts.conf");
});

test("paths survive a checkout directory containing spaces", () => {
  const paths = resolveRuntimePaths("file:///home/me/my%20projects/omarch-deck/src/main.ts");
  assert.equal(paths.worker, "/home/me/my projects/omarch-deck/src/worker.ts");
  assert.equal(paths.fontConfig, "/home/me/my projects/omarch-deck/fonts.conf");
});
