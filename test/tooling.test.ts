import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// npm runs scripts through sh, so an unquoted `test/**/*.test.ts` is expanded
// by the shell, which has no globstar: the moment a subdirectory exists under
// test/ it matches only that subdirectory and every root-level test file stops
// running, with the suite still reporting green. Quoted, node does the glob.
test("the test script leaves globbing to node, not the shell", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const script: string = manifest.scripts.test;
  assert.match(script, /--test '.*\*\*.*'/, `test script must quote its glob: ${script}`);
});
