// Ghoul grid -> buildable brick model (Mini or XL), as a relief standing on a
// black base. Two build modes:
//  - backdrop: the figure stands out in front of a one-stud wall made of the
//    image's own background, the whole square picture is built;
//  - figure: only the figure is built, the background is dropped.
// Sheets are stacked bottom-up (a brick, or two plates, per pixel row) and
// every piece that ends up floating is repaired: tied into the wall with a
// depth-spanning piece, or held by a stack of Trans-Clear 1×1 supports.
import { checkModel, connections, grounded, type Checks } from './check';
import type { GhoulGrid } from './detect';
import { BASE_GRAY, BLACK, COLOR_BY_ID, matchColor, TRANS_CLEAR } from './palette';
import { hexToRgb, rgbToLab } from './color';
import { partId, partName, type Kind, type Piece } from './parts';
import { key, tileLayer, type Layer } from './tile';
import { availableAtLego } from './lego';

export type SizeId = 'mini' | 'xl';
export type BuildMode = 'backdrop' | 'figure';

export interface SizeSpec {
  sx: number;                       // studs per pixel (width)
  F: number;                        // figure depth in studs
  rows: { kind: Kind; h: number }[][];  // sheets per pixel row, cycling bottom-up
  nameplate: [number, number];
}

// F + 1 (figure + wall) must be a real 1×n length so the figure can be tied into the wall
export const SIZES_SPEC: Record<SizeId, SizeSpec> = {
  mini: { sx: 1, F: 5, rows: [[{ kind: 'brick', h: 3 }], [{ kind: 'plate', h: 1 }, { kind: 'plate', h: 1 }]], nameplate: [4, 1] },
  xl: { sx: 2, F: 7, rows: [[{ kind: 'brick', h: 3 }, { kind: 'plate', h: 1 }, { kind: 'plate', h: 1 }]], nameplate: [6, 2] },
};

export interface BomLine { part: string; kind: Kind; name: string; color: number; colorName: string; hex: string; w: number; d: number; qty: number }

export interface Model {
  size: SizeId;
  mode: BuildMode;
  pieces: Piece[];
  steps: number[][];
  bom: BomLine[];
  colors: Record<number, string>;
  checks: Checks;
  notes: string[];
  /** approximate size in cm: width, depth, height */
  dims: [number, number, number];
}

export interface BuildOptions {
  /** only use parts LEGO sells (Pick a Brick), splitting the others into smaller ones */
  preferLego?: boolean;
  mode?: BuildMode;
}

interface Sheet { y: number; h: number; kind: Kind; row: number | null; cells: Layer; mustSpan: Set<number>; pieces: Piece[] }

export function buildModel(grid: GhoulGrid, size: SizeId, o: BuildOptions = {}): Model {
  const S = SIZES_SPEC[size], mode: BuildMode = o.mode ?? 'backdrop', BD = mode === 'backdrop';
  const allow = o.preferLego ? availableAtLego : undefined;
  const { w, h } = grid, sx = S.sx;
  const notes: string[] = [];
  // "only parts LEGO sells": a colour LEGO doesn't sell even as 1×1s moves to the nearest one it does
  const sold = (id: number) => availableAtLego('plate', 1, 1, id) && availableAtLego('brick', 1, 1, id);
  const brickOf = grid.colors.map(c => (allow && !sold(c.brick) ? matchColor(hexToRgb(COLOR_BY_ID.get(c.brick)!.hex), sold) : c.brick));
  const moved = new Set(grid.colors.filter((c, i) => brickOf[i] !== c.brick).map(c => COLOR_BY_ID.get(c.brick)!.name));
  if (moved.size) notes.push(`Not sold by LEGO, replaced by the nearest colour it sells: ${[...moved].join(', ')}.`);
  // a near-black backdrop would melt into a black figure: build the wall in Dark Blue instead (backdrop only, never the figure)
  const WALL = 63;
  const wallColor = (id: number) => (rgbToLab(hexToRgb(COLOR_BY_ID.get(id)!.hex))[0] < 20 && (!allow || sold(WALL)) ? WALL : id);
  const color = (r: number, c: number) => { const v = grid.cells[r][c]; return v < 0 ? -1 : brickOf[v]; };
  const Dfig = BD ? S.F + 1 : S.F;
  let B = Math.max(6, Dfig + 4); if (B % 2) B++;
  const zOff = Math.floor((B - Dfig) / 2), zWall = zOff + S.F;   // figure z in [zOff, zWall); wall at zWall

  // figure-only: drop empty rows at the top and bottom
  const hasFigure = (r: number) => grid.mask[r].some((m, c) => m && color(r, c) >= 0);
  let rTop = 0, rBot = h - 1;
  if (!BD) { while (rBot > 0 && !hasFigure(rBot)) rBot--; while (rTop < rBot && !hasFigure(rTop)) rTop++; }

  // ---------- sheets ----------
  const sheets: Sheet[] = [];
  const W = w * sx;
  let y = 0;
  for (let i = 0; i < 2; i++) {
    const cells: Layer = new Map();
    for (let x = 0; x < W; x++) for (let z = 0; z < B; z++) cells.set(key(x, z), { c: BLACK });
    sheets.push({ y, h: 1, kind: 'plate', row: null, cells, mustSpan: new Set(), pieces: [] }); y++;
  }
  for (let r = rBot, k = 0; r >= rTop; r--, k++) {
    const cells: Layer = new Map();
    for (let c = 0; c < w; c++) {
      const col = color(r, c);
      if (col < 0) continue;
      for (let i = 0; i < sx; i++) {
        const x = c * sx + i;
        if (grid.mask[r][c]) {
          for (let z = zOff; z < zWall; z++) cells.set(key(x, z), { c: col });
          if (BD) cells.set(key(x, zWall), { c: col, wild: true });
        } else if (BD) cells.set(key(x, zWall), { c: wallColor(col) });
      }
    }
    for (const l of S.rows[k % S.rows.length]) { sheets.push({ y, h: l.h, kind: l.kind, row: r, cells, mustSpan: new Set(), pieces: [] }); y += l.h; }
  }
  // sheets of one row share their cells map until a repair touches one of them
  const own = (i: number) => { const s = sheets[i]; if (sheets.some((t, j) => j !== i && t.cells === s.cells)) s.cells = new Map([...s.cells].map(([k2, v]) => [k2, { ...v }])); };
  const tile = (i: number) => {
    const s = sheets[i];
    s.pieces = tileLayer(s.cells, { kind: s.kind, y: s.y, h: s.h, even: i % 2 === 0, group: s.row === null ? 'base' : 'body', allow,
      mustSpan: BD && s.mustSpan.size ? { xs: s.mustSpan, z: zOff, depth: Dfig } : undefined });
  };
  sheets.forEach((_, i) => tile(i));

  // ---------- repair floating pieces ----------
  let ties = 0;
  const cellsOf = (p: Piece) => { const out: number[] = []; for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) out.push(key(p.x + i, p.z + j)); return out; };
  for (let it = 0; it < 8; it++) {
    const ps = sheets.flatMap(s => s.pieces), { adj } = connections(ps), g = grounded(ps, adj);
    const floating = ps.filter((_, i) => !g[i]);
    if (!floating.length) break;
    const touched = new Set<number>();
    for (const p of floating) {
      const si = sheets.findIndex(s => s.pieces.includes(p));
      if (BD && sheets[si].row !== null && it < 4 && p.z < zWall) {
        for (let x = p.x; x < p.x + p.w; x++) sheets[si].mustSpan.add(x);
        touched.add(si); ties++;
        continue;
      }
      for (const k2 of cellsOf(p)) for (let t = si - 1; t >= 0; t--) {
        const c = sheets[t].cells.get(k2);
        if (c && c.c >= 0) break;
        own(t); sheets[t].cells.set(k2, { c: TRANS_CLEAR }); touched.add(t);
      }
    }
    touched.forEach(i => tile(i));
  }
  if (ties) notes.push('Some figure pixels are tied into the backdrop wall with pieces running through the depth.');
  const supportPieces = sheets.reduce((a, s) => a + s.pieces.filter(p => p.c === TRANS_CLEAR).length, 0);
  if (supportPieces) notes.push(`${supportPieces} clear support piece${supportPieces > 1 ? 's' : ''} added under overhanging pixels.`);

  // ---------- name plate on the base, in front ----------
  const pieces: Piece[] = sheets.flatMap(s => s.pieces);
  const [nw, nd] = S.nameplate;
  if (zOff >= nd && W >= nw && (!allow || allow('tile', nw, nd, BASE_GRAY))) {
    const x0 = Math.floor((W - nw) / 2), z0 = Math.floor((zOff - nd) / 2);
    pieces.push({ x: x0, z: z0, y: 2, h: 1, w: nw, d: nd, c: BASE_GRAY, kind: 'tile', part: partId('tile', nw, nd), group: 'base', nameplate: true });
  }

  // ---------- steps, parts list, checks ----------
  const layerYs = [...new Set(pieces.map(p => p.y))].sort((a, b) => a - b);
  const byStep: number[][] = layerYs.map(() => []);
  pieces.forEach((p, i) => byStep[layerYs.indexOf(p.y)].push(i));
  const steps = byStep.filter(s => s.length).map(s => s.sort((a, b) => pieces[a].z - pieces[b].z || pieces[a].x - pieces[b].x));

  const checks = checkModel(pieces);
  if (checks.floating) notes.push(`${checks.floating} piece${checks.floating > 1 ? 's are' : ' is'} not connected to the base.`);
  const bomMap = new Map<string, BomLine>();
  for (const p of pieces) {
    const k2 = `${p.part}|${p.c}`, col = COLOR_BY_ID.get(p.c)!;
    const line = bomMap.get(k2) ?? { part: p.part, kind: p.kind, name: partName(p.kind, p.w, p.d), color: p.c, colorName: col.name, hex: col.hex, w: Math.min(p.w, p.d), d: Math.max(p.w, p.d), qty: 0 };
    line.qty++; bomMap.set(k2, line);
  }
  const bom = [...bomMap.values()].sort((a, b) => a.colorName.localeCompare(b.colorName) || a.kind.localeCompare(b.kind) || a.w - b.w || a.d - b.d);
  const colors: Record<number, string> = {};
  for (const p of pieces) colors[p.c] = COLOR_BY_ID.get(p.c)!.hex;
  const xs = pieces.flatMap(p => [p.x, p.x + p.w]), zs = pieces.flatMap(p => [p.z, p.z + p.d]), ys = pieces.flatMap(p => [p.y, p.y + p.h]);
  const dims = [(Math.max(...xs) - Math.min(...xs)) * 0.8, (Math.max(...zs) - Math.min(...zs)) * 0.8, (Math.max(...ys) - Math.min(...ys)) * 0.32].map(v => Math.round(v)) as [number, number, number];
  return { size, mode, pieces, steps, bom, colors, checks, notes, dims };
}
