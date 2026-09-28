// Find a Ghoul pixel-art grid inside any image: the original image, an
// upscaled copy, a JPEG, or a screenshot with other things around it (e.g. an
// OpenSea page). No fixed token list: this works on any pixel-art figure.
import { BLACK, COLOR_BY_ID, matchColor, quantizeGrid } from './palette';
import { deltaE, hexToRgb, rgbToLab, type Lab, type RGB } from './color';

export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export interface GhoulGrid {
  w: number; h: number;
  /** h rows x w cols; brick colour index, or -1 = no pixel (fully transparent) */
  cells: number[][];
  /** h rows x w cols; true = part of the figure, false = backdrop */
  mask: boolean[][];
  /** colours used, shown as their brick colour; `brick` is the BrickLink colour ID */
  colors: { rgb: RGB; count: number; brick: number }[];
  background: RGB | null;
  /** where the grid was found, in source image pixels */
  box: { x: number; y: number; size: number };
}

export class DetectError extends Error {
  constructor(public code: 'no-grid' | 'not-grid' | 'empty', message: string) { super(message); }
}

const de76 = (a: RGB, b: RGB) => { const [la, aa, ba] = rgbToLab(a), [lb, ab, bb] = rgbToLab(b); return Math.hypot(la - lb, aa - ab, ba - bb); };

/** Native pixel grid if the image already is one (<=96px on a side), else an edge-based autocorrelation fit. */
function sampleGrid(img: RGBAImage, N: number): { w: number; h: number; rgb: (RGB | null)[][] } {
  const { width: W, height: H, data } = img;
  const alpha = (o: number) => data[o + 3];
  const px = (x: number, y: number): RGB | null => { const o = (y * W + x) * 4; return alpha(o) < 24 ? null : [data[o], data[o + 1], data[o + 2]]; };

  if (W <= 96 && H <= 96 && W >= 8 && H >= 8) {
    const rows: (RGB | null)[][] = [];
    for (let y = 0; y < H; y++) { const row: (RGB | null)[] = []; for (let x = 0; x < W; x++) row.push(px(x, y)); rows.push(row); }
    return { w: W, h: H, rgb: rows };
  }

  const ex = new Float64Array(W), ey = new Float64Array(H);
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) {
    const i = (y * W + x) * 4, j = i - 4;
    ex[x] += Math.min(120, Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]));
  }
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, j = i - W * 4;
    ey[y] += Math.min(120, Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]));
  }
  const L = Math.min(W, H);
  function fit(e: Float64Array): { s: number; p: number; ph: number } {
    let best = { s: -1, p: 0, ph: 0 };
    const lo = L / (N + 4), hi = L / (N * 0.85), step = Math.max(0.01, (hi - lo) / 600);
    for (let p = lo; p < hi; p += step) for (let ph = 0; ph < p; ph += 0.5) {
      let s = 0, n = 0;
      for (let k = 0; ; k++) { const i = Math.round(ph + k * p); if (i >= e.length) break; if (i >= 1) { s += e[i]; n++; } }
      s /= Math.max(1, n);
      if (s > best.s) best = { s, p, ph };
    }
    return best;
  }
  const fx = fit(ex), fy = fit(ey), p = (fx.p + fy.p) / 2;
  const xs: number[] = [], ys: number[] = [];
  for (let x = (fx.ph % p) - p; x < W; x += p) if (x >= -p * 0.25 && x + p <= W + p * 0.25) xs.push(x);
  for (let y = (fy.ph % p) - p; y < H; y += p) if (y >= -p * 0.25 && y + p <= H + p * 0.25) ys.push(y);
  const samp = (x0: number, y0: number): RGB | null => {
    const a = Math.max(0, Math.floor(y0 + p * 0.3)), b = Math.min(H, Math.floor(y0 + p * 0.7));
    const c = Math.max(0, Math.floor(x0 + p * 0.3)), d = Math.min(W, Math.floor(x0 + p * 0.7));
    const R: number[] = [], G: number[] = [], B: number[] = []; let solid = 0, n = 0;
    for (let y = a; y < Math.max(b, a + 1); y++) for (let x = c; x < Math.max(d, c + 1); x++) {
      n++; const q = px(Math.min(W - 1, x), Math.min(H - 1, y));
      if (q) { solid++; R.push(q[0]); G.push(q[1]); B.push(q[2]); }
    }
    if (solid * 2 < n) return null;
    const med = (v: number[]) => { v.sort((m, k) => m - k); return v[v.length >> 1]; };
    return [med(R), med(G), med(B)];
  };
  let rows: (RGB | null)[][] = ys.map(y => xs.map(x => samp(x, y)));
  if (!rows.length || !rows[0].length) throw new DetectError('no-grid', "We couldn't find a pixel-art grid in this image. Try the Ghoul's own image, or a tighter screenshot.");

  // trim a screenshot frame: strip rows/cols matching the image corner colour
  const corner = px(2, 2);
  const isFrame = (v: (RGB | null)[]) => corner && v.filter(c => c && de76(c, corner) < 6).length / v.length > 0.6;
  const col = (i: number) => rows.map(r => r[i]);
  let changed = true;
  while (changed && rows.length > N) { changed = false;
    if (rows.length > N && isFrame(rows[0])) { rows.shift(); changed = true; }
    if (rows.length > N && isFrame(rows[rows.length - 1])) { rows.pop(); changed = true; }
  }
  changed = true;
  while (changed && rows[0].length > N) { changed = false;
    if (rows[0].length > N && isFrame(col(0))) { rows = rows.map(r => r.slice(1)); changed = true; }
    if (rows[0].length > N && isFrame(col(rows[0].length - 1))) { rows = rows.map(r => r.slice(0, -1)); changed = true; }
  }
  const frameScore = (v: (RGB | null)[]) => corner ? v.reduce((s, c) => s + (c && de76(c, corner) < 14 ? 1 : 0), 0) : 0;
  while (rows.length > N) { if (frameScore(rows[0]) >= frameScore(rows[rows.length - 1])) rows.shift(); else rows.pop(); }
  while (rows[0].length > N) { const w = rows[0].length; if (frameScore(col(0)) >= frameScore(col(w - 1))) rows = rows.map(r => r.slice(1)); else rows = rows.map(r => r.slice(0, -1)); }
  return { w: rows[0].length, h: rows.length, rgb: rows };
}

/**
 * Figure vs. backdrop: flood fill from the border, comparing every cell with the
 * backdrop colour itself (not with its neighbour, which lets a dark gradient
 * leak into the figure). Holes inside the figure are then filled so they
 * stay figure (black pieces), never holes.
 */
function autoMask(rgb: (RGB | null)[][]): boolean[][] {
  const h = rgb.length, w = rgb[0].length;
  const labOf = (y: number, x: number) => (rgb[y][x] ? rgbToLab(rgb[y][x]!) : null);
  const idx = (x: number, y: number) => y * w + x;
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(idx(x, 0), idx(x, h - 1));
  for (let y = 0; y < h; y++) border.push(idx(0, y), idx(w - 1, y));
  // reference backdrop colour: the most common border colour (coarsely bucketed)
  const votes = new Map<string, { lab: [number, number, number]; n: number }>();
  for (const i of border) {
    const l = labOf((i / w) | 0, i % w); if (!l) continue;
    const k = `${Math.round(l[0] / 6)},${Math.round(l[1] / 6)},${Math.round(l[2] / 6)}`;
    const e = votes.get(k) ?? { lab: l as [number, number, number], n: 0 }; e.n++; votes.set(k, e);
  }
  const ref = [...votes.values()].sort((a, b) => b.n - a.n)[0]?.lab ?? null;
  const TH = 9;
  const isBack = (i: number) => {
    const l = labOf((i / w) | 0, i % w);
    return l ? !!ref && Math.hypot(l[0] - ref[0], l[1] - ref[1], l[2] - ref[2]) < TH : true;   // transparent = backdrop
  };
  const bg = new Uint8Array(w * h), st: number[] = [];
  for (const i of border) if (!bg[i] && isBack(i)) { bg[i] = 1; st.push(i); }
  while (st.length) {
    const i = st.pop()!, x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = idx(nx, ny); if (!bg[j] && isBack(j)) { bg[j] = 1; st.push(j); }
    }
  }
  // backdrop cells cut off from the border (8-connected) are holes inside the figure: they become figure (black pieces).
  // An opening between the figure and a detail (smoke, a hand) stays backdrop.
  const outside = new Uint8Array(w * h), q2: number[] = [];
  for (const i of border) if (bg[i] && !outside[i]) { outside[i] = 1; q2.push(i); }
  while (q2.length) {
    const i = q2.pop()!, x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = idx(nx, ny); if (bg[j] && !outside[j]) { outside[j] = 1; q2.push(j); }
    }
  }
  const fig = new Uint8Array(w * h).map((_, i) => (outside[i] ? 0 : 1));
  const mask: boolean[][] = [];
  for (let y = 0; y < h; y++) { const row: boolean[] = []; for (let x = 0; x < w; x++) row.push(!!fig[idx(x, y)]); mask.push(row); }
  return mask;
}

/**
 * Candidate squares where the figure may be, in a bigger picture (a page
 * screenshot): flat-colour regions whose bounding box is a square wrapping
 * the figure (the backdrop covers its whole top row). Largest first.
 */
function findSquares(img: RGBAImage): { x: number; y: number; size: number }[] {
  const f = Math.max(1, Math.ceil(Math.sqrt((img.width * img.height) / 1_500_000)));
  const W = Math.floor(img.width / f), H = Math.floor(img.height / f), d = img.data, TOL = 24;
  const at = (i: number) => (((i / W) | 0) * f * img.width + (i % W) * f) * 4;
  const label = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H);
  const out: { x: number; y: number; size: number; area: number }[] = [];
  for (let s0 = 0, id = 0; s0 < W * H; s0++) {
    if (label[s0] >= 0) continue;
    const so = at(s0); let sp = 0, n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    stack[sp++] = s0; label[s0] = id;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q < 0 || label[q] >= 0) continue;
        const o = at(q);
        if (Math.abs(d[o] - d[so]) <= TOL && Math.abs(d[o + 1] - d[so + 1]) <= TOL && Math.abs(d[o + 2] - d[so + 2]) <= TOL) { label[q] = id; stack[sp++] = q; }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w * f >= 64 && Math.abs(w - h) <= Math.max(2, 0.03 * w) && n / (w * h) > 0.2 && n / (w * h) < 0.97) {
      let top = 0; for (let x = x0; x <= x1; x++) if (label[y0 * W + x] === id) top++;
      if (top / w >= 0.9) out.push({ x: x0 * f, y: y0 * f, size: Math.round(((w + h) / 2) * f), area: w * h });
    }
    id++;
  }
  return out.sort((a, b) => b.area - a.area).slice(0, 4);
}

function crop(img: RGBAImage, x0: number, y0: number, size: number): RGBAImage {
  const s = Math.min(size, img.width - x0, img.height - y0), data = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + s) * 4), y * s * 4);
  return { width: s, height: s, data };
}

/**
 * Pixel-art Ghouls shade a flat colour with small random variations. Mapping
 * each pixel on its own scatters those across neighbouring brick colours
 * (a grey head turns into black-and-grey noise). Instead: group the figure's
 * colours, fold lone specks into their surroundings, and pick one brick colour
 * per group, keeping the main body off black so it reads against black parts.
 */
const NEUTRALS = new Set([1, 11, 85, 86, 99]);
function simplifyFigure(rgb: (RGB | null)[][], mask: boolean[][]): (RGB | null)[][] {
  const h = rgb.length, w = rgb[0].length;
  const pts: { y: number; x: number; lab: Lab }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y][x] && rgb[y][x]) pts.push({ y, x, lab: rgbToLab(rgb[y][x]!) });
  if (pts.length < 4) return rgb;
  // k-means in Lab, farthest-point seeds
  const K = Math.min(10, pts.length);
  let cs: Lab[] = [pts[0].lab];
  while (cs.length < K) {
    let far = pts[0].lab, fd = -1;
    for (const p of pts) { const d = Math.min(...cs.map(c => deltaE(p.lab, c))); if (d > fd) { fd = d; far = p.lab; } }
    if (fd < 1) break; cs.push(far);
  }
  let lab = new Int32Array(pts.length);
  const assign = () => pts.forEach((p, i) => { let b = 0, bd = Infinity; cs.forEach((c, k) => { const d = deltaE(p.lab, c); if (d < bd) { bd = d; b = k; } }); lab[i] = b; });
  const update = () => {
    const sum = cs.map(() => [0, 0, 0, 0]);
    pts.forEach((p, i) => { const s = sum[lab[i]]; s[0] += p.lab[0]; s[1] += p.lab[1]; s[2] += p.lab[2]; s[3]++; });
    const keep: Lab[] = [], remap = new Map<number, number>();
    sum.forEach((s, k) => { if (s[3]) { remap.set(k, keep.length); keep.push([s[0] / s[3], s[1] / s[3], s[2] / s[3]]); } });
    lab = lab.map(k => remap.get(k)!); cs = keep;
  };
  for (let it = 0; it < 12; it++) { assign(); update(); }
  // merge groups closer than MERGE (their variation is shading noise, not a detail)
  const MERGE = 9;
  for (;;) {
    const n = cs.map((_, k) => lab.filter(v => v === k).length);
    let bi = -1, bj = -1, bd = MERGE;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const d = deltaE(cs[i], cs[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
    if (bi < 0) break;
    const t = n[bi] + n[bj];
    cs[bi] = [0, 1, 2].map(c => (cs[bi][c] * n[bi] + cs[bj][c] * n[bj]) / t) as Lab;
    lab = lab.map(k => (k === bj ? bi : k > bj ? k - 1 : k)); cs.splice(bj, 1);
  }
  // fold lone specks into the group around them (not strong details: eyes, tears, a cigar tip)
  const grid: number[][] = rgb.map(r => r.map(() => -1));
  pts.forEach((p, i) => { grid[p.y][p.x] = lab[i]; });
  for (let pass = 0; pass < 2; pass++) {
    const next = grid.map(r => r.slice());
    for (const p of pts) {
      const own = grid[p.y][p.x], cnt = new Map<number, number>(); let same = 0, tot = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const v = grid[p.y + dy]?.[p.x + dx]; if (v === undefined || v < 0) continue;
        tot++; if (v === own) same++; else cnt.set(v, (cnt.get(v) ?? 0) + 1);
      }
      if (same > 0 || tot < 5) continue;
      const [maj, mc] = [...cnt].sort((a, b) => b[1] - a[1])[0];
      if (mc >= 4 && deltaE(cs[own], cs[maj]) < 24) next[p.y][p.x] = maj;
    }
    for (const p of pts) grid[p.y][p.x] = next[p.y][p.x];
  }
  // one brick colour per group; the main body never goes to black (black is for the darker parts around it)
  const counts = cs.map((_, k) => pts.filter(p => grid[p.y][p.x] === k).length);
  const main = counts.indexOf(Math.max(...counts));
  const meanRgb = cs.map((_, k) => {
    const ps = pts.filter(p => grid[p.y][p.x] === k), s = [0, 0, 0];
    ps.forEach(p => { const v = rgb[p.y][p.x]!; s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; });
    return s.map(v => Math.round(v / Math.max(1, ps.length))) as RGB;
  });
  const pick = cs.map((c, k) => {
    const rgbC = meanRgb[k];
    const grey = Math.hypot(c[1], c[2]) < 12;
    const ok = (id: number) => (!grey || NEUTRALS.has(id)) && !(k === main && c[0] > 12 && id === BLACK);
    return matchColor(rgbC, ok);
  });
  const out = rgb.map(r => r.slice());
  for (const p of pts) out[p.y][p.x] = hexToRgb(COLOR_BY_ID.get(pick[grid[p.y][p.x]])!.hex);
  return out;
}

export interface DetectOptions { gridSize?: number; maxColors?: number }

/** Ghoul (or any pixel-art figure) as a colour grid, ready for building. */
export function detectGhoul(img: RGBAImage, opts: DetectOptions = {}): GhoulGrid {
  const N = opts.gridSize ?? 32;
  // a near-square image is taken as the figure itself; anything else is searched for the figure's square
  const square = Math.abs(img.width - img.height) <= Math.max(2, 0.03 * Math.max(img.width, img.height));
  let found: { w: number; h: number; rgb: (RGB | null)[][] } | null = null, box = { x: 0, y: 0, size: Math.max(img.width, img.height) };
  if (!square) for (const c of findSquares(img)) {
    const g = sampleGrid(crop(img, c.x, c.y, c.size), N);
    if (g.w === g.h) { found = g; box = c; break; }
  }
  const { w, h, rgb } = found ?? sampleGrid(img, N);
  const filled = rgb.flat().filter(Boolean).length;
  if (filled < 4) throw new DetectError('empty', "We found a grid, but it's almost empty. Is this really a Ghoul?");
  const mask = autoMask(rgb);
  const q = quantizeGrid(simplifyFigure(rgb, mask), opts.maxColors ?? 24);
  const colorIndex = new Map<number, number>();
  const colors: { rgb: RGB; count: number; brick: number }[] = [];
  const cells: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      const id = q[y][x];
      if (id < 0) { row.push(-1); continue; }
      let k = colorIndex.get(id);
      if (k === undefined) { k = colors.length; colorIndex.set(id, k); colors.push({ rgb: hexToRgb(COLOR_BY_ID.get(id)!.hex), count: 0, brick: id }); }
      colors[k].count++;
      row.push(k);
    }
    cells.push(row);
  }
  const figurePixels = mask.flat().filter(Boolean).length;
  if (figurePixels < 4) throw new DetectError('no-grid', "We couldn't tell the figure from its background in this image. Try a tighter crop, or the original image.");
  // background: the dominant colour along the border, for the preview only
  const borderColors = new Map<string, { rgb: RGB; n: number }>();
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const p = rgb[y][x]; if (p && !mask[y][x]) { const k = p.join(','); const e = borderColors.get(k) ?? { rgb: p, n: 0 }; e.n++; borderColors.set(k, e); } }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const p = rgb[y][x]; if (p && !mask[y][x]) { const k = p.join(','); const e = borderColors.get(k) ?? { rgb: p, n: 0 }; e.n++; borderColors.set(k, e); } }
  const background = [...borderColors.values()].sort((a, b) => b.n - a.n)[0]?.rgb ?? null;
  return { w, h, cells, mask, colors, background, box };
}
