// Fill one horizontal sheet of stud cells with real bricks or plates: largest
// pieces first, long axis alternating sheet to sheet so seams cross.
// "Wild" cells (the backdrop stud behind a figure pixel) may take any colour,
// so one piece can run from the figure into the wall and tie them together.
import { partId, type Kind, type Piece } from './parts';
import { TRANS_CLEAR } from './palette';

export interface Cell { c: number; wild?: boolean }
export type Layer = Map<number, Cell>;

export const key = (x: number, z: number) => (x + 512) * 1024 + (z + 512);
export const kx = (k: number) => Math.floor(k / 1024) - 512;
export const kz = (k: number) => (k % 1024) - 512;

export const PLATE_SIZES: [number, number][] = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8]];
export const BRICK_SIZES: [number, number][] = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4]];

export interface TileOpts {
  kind: Kind; y: number; h: number;
  /** even sheets run pieces along x, odd ones along z */
  even: boolean;
  group?: Piece['group'];
  /** x columns (in studs) where a 1×depth piece must tie the figure into the backdrop */
  mustSpan?: { xs: Iterable<number>; z: number; depth: number };
  /** only use sizes this returns true for (a 1×1 is always allowed, as a last resort) */
  allow?: (kind: Kind, w: number, d: number, color: number) => boolean;
}

export function tileLayer(cells: Layer, o: TileOpts): Piece[] {
  const used = new Set<number>();
  const out: Piece[] = [];
  const sizes = o.kind === 'brick' ? BRICK_SIZES : PLATE_SIZES;
  const cands: { w: number; d: number }[] = [];
  for (const [a, b] of sizes) { cands.push({ w: a, d: b }); if (a !== b) cands.push({ w: b, d: a }); }
  const along = (c: { w: number; d: number }) => (o.even ? (c.w >= c.d ? 0 : 1) : (c.d >= c.w ? 0 : 1));
  cands.sort((A, B) => B.w * B.d - A.w * A.d || along(A) - along(B));

  const add = (x: number, z: number, w: number, d: number, c: number) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) used.add(key(x + i, z + j));
    out.push({ x, z, y: o.y, h: o.h, w, d, c, kind: o.kind, part: partId(o.kind, w, d), group: o.group, ...(c === TRANS_CLEAR ? { support: true } : {}) });
  };

  // depth-spanning pieces that tie a figure pixel into the backdrop wall
  if (o.mustSpan) {
    const { z, depth } = o.mustSpan;
    const fits = cands.some(c => c.w === 1 && c.d === depth);
    if (fits) for (const x of o.mustSpan.xs) {
      let ok = true;
      for (let dz = 0; ok && dz < depth; dz++) { const k = key(x, z + dz), cell = cells.get(k); if (!cell || used.has(k) || cell.c === TRANS_CLEAR) ok = false; }
      if (!ok) continue;
      const col = cells.get(key(x, z + depth - 1))!.c;
      for (let dz = 0; ok && dz < depth; dz++) { const cell = cells.get(key(x, z + dz))!; if (cell.c !== col && !cell.wild) ok = false; }
      if (!ok || (o.allow && !o.allow(o.kind, 1, depth, col))) continue;
      add(x, z, 1, depth, col);
    }
  }

  const fit = (x: number, z: number, w: number, d: number, col: number) => {
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      const k = key(x + dx, z + dz), cell = cells.get(k);
      if (!cell || used.has(k)) return false;
      if (cell.c !== col && !cell.wild) return false;
      if ((cell.c === TRANS_CLEAR) !== (col === TRANS_CLEAR)) return false;
    }
    return !(o.allow && w * d > 1 && !o.allow(o.kind, w, d, col));
  };
  const order = [...cells.keys()].sort(o.even ? (a, b) => kz(a) - kz(b) || kx(a) - kx(b) : (a, b) => kx(a) - kx(b) || kz(a) - kz(b));
  for (const k of order) {
    if (used.has(k)) continue;
    const x = kx(k), z = kz(k), col = cells.get(k)!.c;
    // transparent supports stay 1×1 so they're easy to find and remove
    const c = col === TRANS_CLEAR ? { w: 1, d: 1 } : cands.find(c => fit(x, z, c.w, c.d, col)) ?? { w: 1, d: 1 };
    add(x, z, c.w, c.d, col);
  }
  return out;
}
