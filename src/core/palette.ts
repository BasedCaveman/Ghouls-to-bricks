// Brick colours (BrickLink colour IDs and names) and LEGO colour matching via
// CIEDE2000 (nearest real brick colour to a source pixel).
import { deltaE, hexToRgb, rgbToLab, type Lab, type RGB } from './color';

export interface BrickColor {
  id: number;          // BrickLink colour ID
  name: string;        // BrickLink colour name
  hex: string;         // BrickLink colour value, used for matching
  render?: string;     // how the real brick looks on screen, if different
  trans?: boolean;
}

export const BRICK_COLORS: BrickColor[] = [
  { id: 1, name: 'White', hex: '#F4F4F4' },
  { id: 11, name: 'Black', hex: '#1B1B1B' },
  { id: 86, name: 'Light Bluish Gray', hex: '#A0A5A9' },
  { id: 85, name: 'Dark Bluish Gray', hex: '#6C6E68' },
  { id: 99, name: 'Very Light Bluish Gray', hex: '#E6E3DA' },
  { id: 5, name: 'Red', hex: '#C91A09' },
  { id: 59, name: 'Dark Red', hex: '#720E0F' },
  { id: 4, name: 'Orange', hex: '#FE8A18' },
  { id: 68, name: 'Dark Orange', hex: '#A95500' },
  { id: 110, name: 'Bright Light Orange', hex: '#F8BB3D' },
  { id: 3, name: 'Yellow', hex: '#F2CD37' },
  { id: 103, name: 'Bright Light Yellow', hex: '#FFF03A' },
  { id: 2, name: 'Tan', hex: '#E4CD9E' },
  { id: 69, name: 'Dark Tan', hex: '#958A73' },
  { id: 90, name: 'Light Nougat', hex: '#F6D7B3' },
  { id: 28, name: 'Nougat', hex: '#D09168' },
  { id: 150, name: 'Medium Nougat', hex: '#AA7D55' },
  { id: 88, name: 'Reddish Brown', hex: '#582A12' },
  { id: 120, name: 'Dark Brown', hex: '#352100' },
  { id: 220, name: 'Coral', hex: '#FF698F' },
  { id: 104, name: 'Bright Pink', hex: '#E4ADC8' },
  { id: 47, name: 'Dark Pink', hex: '#C870A0' },
  { id: 71, name: 'Magenta', hex: '#923978' },
  { id: 154, name: 'Lavender', hex: '#E1D5ED' },
  { id: 157, name: 'Medium Lavender', hex: '#AC78BA' },
  { id: 89, name: 'Dark Purple', hex: '#3F3691' },
  { id: 55, name: 'Sand Blue', hex: '#6074A1' },
  { id: 63, name: 'Dark Blue', hex: '#0A3463' },
  { id: 7, name: 'Blue', hex: '#0055BF' },
  { id: 42, name: 'Medium Blue', hex: '#5A93DB' },
  { id: 153, name: 'Dark Azure', hex: '#078BC9' },
  { id: 156, name: 'Medium Azure', hex: '#36AEBF' },
  { id: 105, name: 'Bright Light Blue', hex: '#9FC3E9' },
  { id: 152, name: 'Light Aqua', hex: '#ADC3C0', render: '#C9EDE6' },
  { id: 39, name: 'Dark Turquoise', hex: '#008F9B' },
  { id: 48, name: 'Sand Green', hex: '#A0BCAC' },
  { id: 80, name: 'Dark Green', hex: '#184632' },
  { id: 6, name: 'Green', hex: '#237841' },
  { id: 36, name: 'Bright Green', hex: '#4B9F4A' },
  { id: 34, name: 'Lime', hex: '#BBE90B' },
  { id: 155, name: 'Olive Green', hex: '#9B9A5A' },
  { id: 12, name: 'Trans-Clear', hex: '#EEEEEE', trans: true },
];

export const COLOR_BY_ID = new Map(BRICK_COLORS.map(c => [c.id, c]));
export const BLACK = 11, TRANS_CLEAR = 12, BASE_GRAY = 85;
const LAB = new Map<number, Lab>(BRICK_COLORS.map(c => [c.id, rgbToLab(hexToRgb(c.hex))]));
// Trans-Clear is reserved for support pieces; never matched from the image.
const MATCHABLE = BRICK_COLORS.filter(c => c.id !== TRANS_CLEAR);

/** Nearest real brick colour to a source pixel, by CIEDE2000 distance; `ok` limits the choice. */
export function matchColor(rgb: RGB, ok: (id: number) => boolean = () => true): number {
  const lab = rgbToLab(rgb);
  let best = -1, bd = Infinity;
  for (const c of MATCHABLE) { if (!ok(c.id)) continue; const d = deltaE(lab, LAB.get(c.id)!); if (d < bd) { bd = d; best = c.id; } }
  return best;
}

/**
 * Quantise every cell of a grid to a brick colour, then (optionally) merge
 * the least-used colours into their next best match until at most
 * `maxColors` remain: fewer, cleaner lots to buy.
 */
export function quantizeGrid(rgb: (RGB | null)[][], maxColors?: number): number[][] {
  const h = rgb.length, w = rgb[0]?.length ?? 0;
  const labs: (Lab | null)[][] = rgb.map(row => row.map(p => (p ? rgbToLab(p) : null)));
  const q: number[][] = labs.map(row => row.map(() => -1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const l = labs[y][x]; if (!l) { q[y][x] = -1; continue; }
    let best = MATCHABLE[0].id, bd = Infinity;
    for (const c of MATCHABLE) { const d = deltaE(l, LAB.get(c.id)!); if (d < bd) { bd = d; best = c.id; } }
    q[y][x] = best;
  }
  if (maxColors && maxColors > 0) {
    const count = new Map<number, number>();
    for (const row of q) for (const c of row) if (c >= 0) count.set(c, (count.get(c) ?? 0) + 1);
    let used = new Set(count.keys());
    while (used.size > maxColors) {
      let least = -1, lc = Infinity;
      for (const [c, n] of count) if (used.has(c) && n < lc) { lc = n; least = c; }
      used.delete(least);
      const rem = [...used];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (q[y][x] !== least) continue;
        const l = labs[y][x]!;
        let bi = rem[0], bd = Infinity;
        for (const c of rem) { const d = deltaE(l, LAB.get(c)!); if (d < bd) { bd = d; bi = c; } }
        q[y][x] = bi;
        count.set(bi, (count.get(bi) ?? 0) + 1);
      }
    }
  }
  return q;
}

/** Colour to draw a brick with (3D view, instructions). */
export const renderHex = (id: number) => { const c = COLOR_BY_ID.get(id)!; return c.render ?? c.hex; };
