// Minimal vector glyphs for the 90x90 touch tiles. Each draws inside a box
// centred at (cx, cy) with the given size, using the current strokeStyle /
// fillStyle so the theme decides the colour.
export type IconName =
  | "terminal" | "code" | "browser" | "files" | "git" | "docker" | "processes"
  | "clipboard" | "camera" | "key" | "lock" | "wrench" | "hammer" | "check"
  | "search" | "home" | "back";

import type { DrawContext } from "loupedeck";

type Ctx = DrawContext;
type Drawer = (ctx: Ctx, cx: number, cy: number, s: number) => void;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, r = 3): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function dot(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

const ICONS: Record<IconName, Drawer> = {
  terminal(ctx, cx, cy, s) {
    rect(ctx, cx - s / 2, cy - s * 0.4, s, s * 0.8, 4);
    line(ctx, cx - s * 0.32, cy - s * 0.15, cx - s * 0.12, cy);
    line(ctx, cx - s * 0.12, cy, cx - s * 0.32, cy + s * 0.15);
    line(ctx, cx - s * 0.02, cy + s * 0.18, cx + s * 0.28, cy + s * 0.18);
  },
  code(ctx, cx, cy, s) {
    line(ctx, cx - s * 0.18, cy - s * 0.3, cx - s * 0.48, cy);
    line(ctx, cx - s * 0.48, cy, cx - s * 0.18, cy + s * 0.3);
    line(ctx, cx + s * 0.18, cy - s * 0.3, cx + s * 0.48, cy);
    line(ctx, cx + s * 0.48, cy, cx + s * 0.18, cy + s * 0.3);
    line(ctx, cx + s * 0.1, cy - s * 0.4, cx - s * 0.1, cy + s * 0.4);
  },
  browser(ctx, cx, cy, s) {
    const r = s * 0.42;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    line(ctx, cx - r, cy, cx + r, cy);
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2); ctx.stroke();
  },
  files(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy - s * 0.3);
    ctx.lineTo(cx - s * 0.1, cy - s * 0.3);
    ctx.lineTo(cx, cy - s * 0.18);
    ctx.lineTo(cx + s * 0.45, cy - s * 0.18);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.32);
    ctx.lineTo(cx - s * 0.45, cy + s * 0.32);
    ctx.closePath(); ctx.stroke();
  },
  git(ctx, cx, cy, s) {
    line(ctx, cx - s * 0.2, cy - s * 0.3, cx - s * 0.2, cy + s * 0.3);
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.2, cy - s * 0.3);
    ctx.quadraticCurveTo(cx + s * 0.2, cy, cx - s * 0.2, cy + s * 0.05);
    ctx.stroke();
    dot(ctx, cx - s * 0.2, cy - s * 0.3, s * 0.09);
    dot(ctx, cx - s * 0.2, cy + s * 0.3, s * 0.09);
    dot(ctx, cx + s * 0.2, cy - s * 0.3, s * 0.09);
  },
  docker(ctx, cx, cy, s) {
    const b = s * 0.17;
    const cells: Array<[number, number]> = [[-1.5, 0], [-0.5, 0], [0.5, 0], [-0.5, -1], [0.5, -1], [0.5, -2]];
    for (const [x, y] of cells) {
      rect(ctx, cx + x * b, cy - s * 0.1 + y * b, b - 2, b - 2, 1);
    }
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy + s * 0.15);
    ctx.quadraticCurveTo(cx, cy + s * 0.5, cx + s * 0.45, cy + s * 0.15);
    ctx.stroke();
  },
  processes(ctx, cx, cy, s) {
    const w = s * 0.18;
    for (const [i, h] of [0.35, 0.7, 0.5, 0.85].entries()) {
      const x = cx - s * 0.45 + i * (w + s * 0.06);
      ctx.fillRect(x, cy + s * 0.4 - s * 0.8 * h, w, s * 0.8 * h);
    }
  },
  clipboard(ctx, cx, cy, s) {
    rect(ctx, cx - s * 0.32, cy - s * 0.35, s * 0.64, s * 0.8, 4);
    rect(ctx, cx - s * 0.14, cy - s * 0.44, s * 0.28, s * 0.16, 2);
    line(ctx, cx - s * 0.18, cy, cx + s * 0.18, cy);
    line(ctx, cx - s * 0.18, cy + s * 0.18, cx + s * 0.1, cy + s * 0.18);
  },
  camera(ctx, cx, cy, s) {
    rect(ctx, cx - s * 0.45, cy - s * 0.25, s * 0.9, s * 0.6, 5);
    rect(ctx, cx - s * 0.15, cy - s * 0.38, s * 0.3, s * 0.13, 2);
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.05, s * 0.17, 0, Math.PI * 2); ctx.stroke();
  },
  key(ctx, cx, cy, s) {
    ctx.beginPath(); ctx.arc(cx - s * 0.22, cy, s * 0.18, 0, Math.PI * 2); ctx.stroke();
    line(ctx, cx - s * 0.05, cy, cx + s * 0.45, cy);
    line(ctx, cx + s * 0.3, cy, cx + s * 0.3, cy + s * 0.15);
    line(ctx, cx + s * 0.42, cy, cx + s * 0.42, cy + s * 0.12);
  },
  lock(ctx, cx, cy, s) {
    rect(ctx, cx - s * 0.33, cy - s * 0.05, s * 0.66, s * 0.48, 4);
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.1, s * 0.2, Math.PI, 0); ctx.stroke();
    dot(ctx, cx, cy + s * 0.18, s * 0.06);
  },
  wrench(ctx, cx, cy, s) {
    ctx.beginPath(); ctx.arc(cx + s * 0.22, cy - s * 0.22, s * 0.2, Math.PI * 0.25, Math.PI * 1.75); ctx.stroke();
    ctx.lineWidth *= 1.6;
    line(ctx, cx + s * 0.08, cy - s * 0.08, cx - s * 0.38, cy + s * 0.38);
    ctx.lineWidth /= 1.6;
  },
  hammer(ctx, cx, cy, s) {
    ctx.lineWidth *= 1.6;
    line(ctx, cx - s * 0.05, cy - s * 0.05, cx - s * 0.38, cy + s * 0.38);
    ctx.lineWidth /= 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.12, cy - s * 0.32);
    ctx.lineTo(cx + s * 0.12, cy - s * 0.44);
    ctx.lineTo(cx + s * 0.42, cy - s * 0.14);
    ctx.lineTo(cx + s * 0.18, cy + s * 0.02);
    ctx.closePath(); ctx.stroke();
  },
  check(ctx, cx, cy, s) {
    ctx.lineWidth *= 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.4, cy);
    ctx.lineTo(cx - s * 0.12, cy + s * 0.3);
    ctx.lineTo(cx + s * 0.42, cy - s * 0.3);
    ctx.stroke();
    ctx.lineWidth /= 1.5;
  },
  search(ctx, cx, cy, s) {
    ctx.beginPath(); ctx.arc(cx - s * 0.1, cy - s * 0.1, s * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth *= 1.5;
    line(ctx, cx + s * 0.1, cy + s * 0.1, cx + s * 0.4, cy + s * 0.4);
    ctx.lineWidth /= 1.5;
  },
  home(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy);
    ctx.lineTo(cx, cy - s * 0.4);
    ctx.lineTo(cx + s * 0.45, cy);
    ctx.stroke();
    rect(ctx, cx - s * 0.32, cy - s * 0.05, s * 0.64, s * 0.45, 2);
    ctx.fillRect(cx - s * 0.08, cy + s * 0.12, s * 0.16, s * 0.28);
  },
  back(ctx, cx, cy, s) {
    ctx.lineWidth *= 1.4;
    line(ctx, cx + s * 0.4, cy, cx - s * 0.4, cy);
    line(ctx, cx - s * 0.4, cy, cx - s * 0.1, cy - s * 0.3);
    line(ctx, cx - s * 0.4, cy, cx - s * 0.1, cy + s * 0.3);
    ctx.lineWidth /= 1.4;
  },
};

export function drawIcon(ctx: Ctx, name: IconName, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ICONS[name](ctx, cx, cy, size);
  ctx.restore();
}
