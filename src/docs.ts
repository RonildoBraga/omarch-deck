import { BUTTONS, DIALS, WORKSPACE_FN, WORKSPACE_TAP, type DialLayout } from "./layout.js";
import { PAGES, THEME, type DeckKey, type PageName } from "./pages.js";

// Renders docs/index.html from the same tables the controller runs, so the
// page cannot drift from the firmware behaviour. `make docs` writes it and a
// test fails when the committed copy is stale.

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dial = (id: DialLayout["id"]): DialLayout => {
  const found = DIALS.find(candidate => candidate.id === id);
  if (!found) throw new Error(`No dial ${id}`);
  return found;
};

const PAGE_TITLES: Record<PageName, string> = { main: "Main page", development: "Develop page" };

function keyTitle(key: DeckKey): string {
  if (key.page) return `${key.label} — go to ${PAGE_TITLES[key.page]}`;
  if (key.holdMs) return `${key.label} — hold ${(key.holdMs / 1000).toFixed(1)} s`;
  return key.label;
}

// ---------- SVG schematic ----------

function svgTiles(page: PageName, x: number, y: number, size: number, gap: number): string {
  return PAGES[page].map((key, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const tx = x + col * (size + gap);
    const ty = y + row * (size + gap);
    const iconColor = key.iconColor ?? THEME.icon;
    return `<g class="tile"><title>${esc(keyTitle(key))}</title>` +
      `<rect x="${tx}" y="${ty}" width="${size}" height="${size}" rx="6" fill="#000" stroke="${iconColor}" stroke-width="1.5"/>` +
      `<text x="${tx + size / 2}" y="${ty + size / 2 + 4}" text-anchor="middle" font-size="11" fill="${THEME.text}">${esc(key.label)}</text></g>`;
  }).join("");
}

function svgDial(id: DialLayout["id"], cx: number, cy: number, r: number, side: "left" | "right"): string {
  const d = dial(id);
  const anchor = side === "left" ? "end" : "start";
  const tx = side === "left" ? cx - r - 8 : cx + r + 8;
  return `<g class="dial"><title>${esc(d.name)}: turn ${esc(d.counterClockwise.label)} / ${esc(d.clockwise.label)}; press ${esc(d.press.label)}</title>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a1a1a" stroke="#555" stroke-width="2"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.35}" fill="#333"/>` +
    `<text x="${tx}" y="${cy - 4}" text-anchor="${anchor}" font-size="11" fill="${THEME.accent}">${esc(d.counterClockwise.label)} / ${esc(d.clockwise.label)}</text>` +
    `<text x="${tx}" y="${cy + 12}" text-anchor="${anchor}" font-size="10" fill="${THEME.muted}">press: ${esc(d.press.label)}</text></g>`;
}

function svgSquare(id: string, label: string, sub: string | undefined, x: number, y: number, w: number, h: number): string {
  return `<g class="key"><title>${esc(label)}${sub ? ` — Fn: ${esc(sub)}` : ""}</title>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#1a1a1a" stroke="#7a0a0a" stroke-width="2"/>` +
    `<text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" font-size="10" fill="${THEME.muted}">${esc(id)}</text>` +
    `<text x="${x + w / 2}" y="${y + h - 10}" text-anchor="middle" font-size="10" fill="${THEME.text}">${esc(label)}</text></g>`;
}

export function renderSchematic(): string {
  const W = 900;
  const H = 520;
  const tile = 62;
  const gap = 5;
  const gridX = 320;
  const gridY = 40;
  const gridW = 4 * tile + 3 * gap;
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="24" fill="#0a0a0a" stroke="#2a2a2a" stroke-width="3"/>`);

  // Touch grid.
  parts.push(`<rect x="${gridX - 8}" y="${gridY - 8}" width="${gridW + 16}" height="${3 * tile + 2 * gap + 16}" rx="8" fill="#050505" stroke="#333"/>`);
  parts.push(svgTiles("main", gridX, gridY, tile, gap));
  parts.push(`<text x="${gridX + gridW / 2}" y="${gridY + 3 * tile + 2 * gap + 30}" text-anchor="middle" font-size="11" fill="${THEME.muted}">touch screen — Main page (Develop page below)</text>`);

  // Side dials.
  const dialR = 22;
  const dialX = { left: gridX - 70, right: gridX + gridW + 70 } as const;
  const dialYs = [gridY + 35, gridY + 110, gridY + 185];
  parts.push(svgDial("knobTL", dialX.left, dialYs[0]!, dialR, "left"));
  parts.push(svgDial("knobCL", dialX.left, dialYs[1]!, dialR, "left"));
  parts.push(svgDial("knobBL", dialX.left, dialYs[2]!, dialR, "left"));
  parts.push(svgDial("knobTR", dialX.right, dialYs[0]!, dialR, "right"));
  parts.push(svgDial("knobCR", dialX.right, dialYs[1]!, dialR, "right"));
  parts.push(svgDial("knobBR", dialX.right, dialYs[2]!, dialR, "right"));

  // Round workspace buttons.
  const roundY = gridY + 3 * tile + 2 * gap + 62;
  for (let i = 0; i < 8; i += 1) {
    const cx = gridX + 16 + i * ((gridW - 32) / 7);
    parts.push(`<g><title>Workspace ${i + 1}: tap ${esc(WORKSPACE_TAP)}; Fn ${esc(WORKSPACE_FN)}</title>` +
      `<circle cx="${cx}" cy="${roundY}" r="13" fill="#1a1a1a" stroke="${i === 0 ? "#b91c1c" : "#3f0d0d"}" stroke-width="3"/>` +
      `<text x="${cx}" y="${roundY + 4}" text-anchor="middle" font-size="10" fill="${THEME.text}">${i + 1}</text></g>`);
  }
  parts.push(`<text x="${gridX + gridW / 2}" y="${roundY + 30}" text-anchor="middle" font-size="11" fill="${THEME.muted}">workspaces 1–8 · tap to focus · Fn+tap to move window · LED: active / occupied / off</text>`);

  // Centre wheel.
  const wheel = dial("knobCT");
  const wcx = 150;
  const wcy = 380;
  parts.push(`<g><title>${esc(wheel.name)}</title>` +
    `<circle cx="${wcx}" cy="${wcy}" r="95" fill="#111" stroke="#444" stroke-width="4"/>` +
    `<circle cx="${wcx}" cy="${wcy}" r="62" fill="#000" stroke="#333"/>` +
    `<text x="${wcx}" y="${wcy - 10}" text-anchor="middle" font-size="30" font-weight="bold" fill="${THEME.accent}">1</text>` +
    `<text x="${wcx}" y="${wcy + 12}" text-anchor="middle" font-size="11" fill="${THEME.text}">app</text>` +
    `<text x="${wcx}" y="${wcy + 28}" text-anchor="middle" font-size="10" fill="${THEME.muted}">branch</text></g>`);
  parts.push(`<text x="${wcx}" y="${wcy + 118}" text-anchor="middle" font-size="11" fill="${THEME.accent}">turn: ${esc(wheel.counterClockwise.label)} / ${esc(wheel.clockwise.label)}</text>`);
  parts.push(`<text x="${wcx}" y="${wcy + 133}" text-anchor="middle" font-size="10" fill="${THEME.muted}">screen: workspace · focused app · git branch</text>`);

  // Square keys, two rows of five (schematic placement).
  const keyW = 88;
  const keyH = 44;
  const keyGap = 8;
  const keysX = 370;
  const rows: Array<Array<{ id: string; label: string; sub?: string }>> = [
    [
      { id: "Home", label: "Main page" },
      { id: "Undo", label: "Undo", sub: "Redo" },
      { id: "Keyboard", label: "Clipboard" },
      { id: "Enter", label: "Enter" },
      { id: "Save", label: "Save" },
    ],
    BUTTONS.filter(b => ["a", "b", "c", "d", "e"].includes(b.id)).map(b => ({ id: b.name, label: b.tap.label })),
  ];
  rows.forEach((row, r) => {
    row.forEach((key, c) => {
      parts.push(svgSquare(key.id, key.label, key.sub, keysX + c * (keyW + keyGap), 352 + r * (keyH + keyGap), keyW, keyH));
    });
  });
  parts.push(`<rect x="${keysX}" y="${352 + 2 * (keyH + keyGap)}" width="${keyW}" height="${keyH}" rx="6" fill="#1a1a1a" stroke="#7a0a0a" stroke-width="2"/>` +
    `<text x="${keysX + keyW / 2}" y="${352 + 2 * (keyH + keyGap) + 27}" text-anchor="middle" font-size="11" fill="${THEME.text}">Fn</text>` +
    `<text x="${keysX + keyW + 12}" y="${352 + 2 * (keyH + keyGap) + 27}" font-size="10" fill="${THEME.muted}">hold with Undo → Redo, with 1–8 → move window</text>`);

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" role="img" aria-label="Loupedeck CT layout with omarch-deck bindings">${parts.join("")}</svg>`;
}

// ---------- tables ----------

function pageTable(page: PageName): string {
  const rows: string[] = [];
  for (let r = 0; r < 3; r += 1) {
    const cells = PAGES[page].slice(r * 4, r * 4 + 4).map(key =>
      `<td class="${key.page ? "nav" : key.holdMs ? "danger" : ""}">${esc(keyTitle(key))}</td>`).join("");
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<table class="grid"><tbody>${rows.join("")}</tbody></table>`;
}

function dialTable(): string {
  const rows = DIALS.map(d =>
    `<tr><th>${esc(d.name)}</th><td>${esc(d.counterClockwise.label)} / ${esc(d.clockwise.label)}</td><td>${esc(d.press.label)}</td></tr>`).join("");
  return `<table><thead><tr><th>Dial</th><th>Turn (↺ / ↻)</th><th>Press</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buttonTable(): string {
  const rows = BUTTONS.map(b =>
    `<tr><th>${esc(b.name)}</th><td>${esc(b.tap.label)}</td><td>${b.fn ? esc(b.fn.label) : "—"}</td></tr>`).join("");
  return `<table><thead><tr><th>Button</th><th>Tap</th><th>Fn + tap</th></tr></thead>` +
    `<tbody><tr><th>1–8 (round)</th><td>${esc(WORKSPACE_TAP)}</td><td>${esc(WORKSPACE_FN)}</td></tr>${rows}</tbody></table>`;
}

export function renderDocs(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>omarch-deck — Loupedeck CT bindings</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #000; color: ${THEME.text}; font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { color: ${THEME.accent}; font-size: 28px; margin: 0 0 4px; }
  h2 { color: ${THEME.accent}; font-size: 18px; margin: 40px 0 12px; border-bottom: 1px solid #2a0505; padding-bottom: 6px; }
  p.lead { color: ${THEME.muted}; margin: 0 0 24px; }
  svg { width: 100%; height: auto; display: block; }
  .tile:hover rect, .dial:hover circle:first-of-type, .key:hover rect { stroke: ${THEME.accent}; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; }
  th, td { text-align: left; padding: 8px 10px; border: 1px solid #1f1f1f; vertical-align: top; }
  thead th { color: ${THEME.muted}; font-weight: 600; background: #0a0a0a; }
  tbody th { color: ${THEME.icon}; font-weight: 600; white-space: nowrap; }
  table.grid td { width: 25%; text-align: center; background: #060606; border-color: #3a0a0a; }
  table.grid td.nav { color: ${THEME.navIcon}; }
  table.grid td.danger { color: ${THEME.dangerIcon}; }
  code { background: #111; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  a { color: ${THEME.accent}; }
  footer { color: ${THEME.muted}; font-size: 13px; margin-top: 48px; }
</style>
</head>
<body>
<main>
<h1>omarch-deck</h1>
<p class="lead">Loupedeck CT bindings for Omarchy. Hover any control in the diagram for its full description. Generated from <code>src/layout.ts</code> and <code>src/pages.ts</code>.</p>

${renderSchematic()}

<h2>Touch screen — Main page</h2>
${pageTable("main")}
<h2>Touch screen — Develop page</h2>
<p>Build, Test, Check, and Verify run the matching <code>make</code> target in <code>project.path</code>; the result appears on the wheel screen.</p>
${pageTable("development")}

<h2>Dials</h2>
${dialTable()}

<h2>Buttons</h2>
${buttonTable()}

<h2>Wheel screen</h2>
<p>Shows the active workspace number, the focused application, and the git branch of <code>project.path</code>. Actions briefly replace it with their status.</p>

<h2>Lights</h2>
<p>Workspace buttons: dark red = active, dim red = has windows, off = empty. Other buttons are dark red while the controller runs and switch off when it stops.</p>

<footer>Source and setup: <a href="https://github.com/RonildoBraga/omarch-deck">github.com/RonildoBraga/omarch-deck</a></footer>
</main>
</body>
</html>
`;
}
