import assert from "node:assert/strict";
import test from "node:test";
import { ICON_NAMES } from "../src/icons.js";
import { DIALS, STRIP_DIALS } from "../src/layout.js";

test("every side dial has a strip glyph that exists", () => {
  for (const [side, ids] of Object.entries(STRIP_DIALS)) {
    assert.equal(ids.length, 3, `${side} strip has three dials beside it`);
    for (const id of ids) {
      const dial = DIALS.find(candidate => candidate.id === id);
      assert.ok(dial, `${id} is missing from DIALS`);
      assert.ok(dial.strip, `${id} needs a strip glyph`);
      assert.ok(ICON_NAMES.includes(dial.strip), `${dial.strip} is not a drawable icon`);
    }
  }
});

// The strips sit 60px from the key grid, so a strip glyph that looks like a
// tile glyph misdirects rather than informs.
test("strip glyphs are not reused tile glyphs", () => {
  const stripGlyphs = DIALS.map(dial => dial.strip).filter(Boolean);
  assert.equal(new Set(stripGlyphs).size, stripGlyphs.length, "each dial has its own glyph");
});

test("the centre wheel has no side strip and so no glyph", () => {
  assert.equal(DIALS.find(candidate => candidate.id === "knobCT")?.strip, undefined);
});

test("the strips together cover all six side dials exactly once", () => {
  const labelled = Object.values(STRIP_DIALS).flat();
  assert.equal(new Set(labelled).size, 6);
  assert.equal(DIALS.filter(dial => dial.strip).length, 6);
});
