import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderDocs } from "../src/docs.js";
import { BUTTONS, DIALS } from "../src/layout.js";
import { PAGES } from "../src/pages.js";

test("docs/index.html matches the current layout (run `make docs`)", async () => {
  const committed = await readFile(new URL("../docs/index.html", import.meta.url), "utf8");
  assert.equal(committed, renderDocs(), "docs/index.html is stale: run `make docs` and commit the result");
});

test("the docs mention every binding", () => {
  const html = renderDocs();
  for (const keys of Object.values(PAGES)) for (const key of keys) assert.ok(html.includes(key.label), key.label);
  for (const dial of DIALS) for (const step of [dial.counterClockwise, dial.clockwise, dial.press]) assert.ok(html.includes(step.label), step.label);
  for (const button of BUTTONS) assert.ok(html.includes(button.tap.label), button.tap.label);
});
