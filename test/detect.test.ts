import { describe, expect, it } from 'vitest';
import { detectGhoul, type GhoulGrid } from '../src/core/detect';
import { matchColor } from '../src/core/palette';
import { hexToRgb } from '../src/core/color';
import { SKULL } from './fixtures/ghouls';
import { blank, figureImage, resize, screenshot, toJPEG } from './img';
import jpeg from 'jpeg-js';

const expected = SKULL.rows.map(r => [...r].map(ch => matchColor(hexToRgb(SKULL.palette[ch]))));
const brickRows = (g: GhoulGrid) => g.cells.map(r => r.map(v => (v < 0 ? -1 : g.colors[v].brick)));
const agree = (g: GhoulGrid) => { let n = 0; brickRows(g).forEach((r, y) => r.forEach((v, x) => { if (v === expected[y][x]) n++; })); return n / (32 * 32); };

describe('grid detection', () => {
  it('reads a native 32×32 image exactly', () => {
    const g = detectGhoul(figureImage(SKULL, 1));
    expect([g.w, g.h]).toEqual([32, 32]);
    expect(agree(g)).toBe(1);
  });
  it('finds the grid in an 8× upscale', () => {
    const g = detectGhoul(figureImage(SKULL, 8));
    expect([g.w, g.h]).toEqual([32, 32]);
    expect(agree(g)).toBe(1);
  });
  it('finds the grid in a blurred, non-integer resize saved as JPEG', () => {
    const img = resize(figureImage(SKULL, 8), 403, 403);
    const j = jpeg.decode(toJPEG(img, 80), { useTArray: true, formatAsRGBA: true });
    const g = detectGhoul({ width: j.width, height: j.height, data: new Uint8ClampedArray(j.data) });
    expect([g.w, g.h]).toEqual([32, 32]);
    expect(agree(g)).toBeGreaterThan(0.95);
  });
  it('finds the grid in a marketplace-style screenshot', () => {
    const g = detectGhoul(screenshot(SKULL));
    expect([g.w, g.h]).toEqual([32, 32]);
    expect(agree(g)).toBeGreaterThan(0.95);
  });
  it('separates the figure from the backdrop', () => {
    const g = detectGhoul(figureImage(SKULL, 4));
    SKULL.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (y < 24) expect(g.mask[y][x]).toBe(ch !== '.'); }));
  });
  it('keeps a dark figure on a black backdrop whole, with black inner parts as figure', () => {
    const img = blank(32, 32, [0, 0, 0, 255]);
    const inHead = (x: number, y: number) => (x - 15.5) ** 2 / 100 + (y - 14) ** 2 / 100 <= 1;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (inHead(x, y)) {
      const shade = 22 + (y - 4) * 3;                        // soft dark gradient, close to the backdrop at the rim
      img.data.set([shade, shade, shade + 6, 255], (y * 32 + x) * 4);
    }
    for (const [ex, ey] of [[11, 12], [19, 12], [15, 19], [16, 19]]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) img.data.set([0, 0, 0, 255], ((ey + dy) * 32 + ex + dx) * 4);
    const g = detectGhoul(img);
    let inside = 0, kept = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (inHead(x, y) && (x - 15.5) ** 2 / 100 + (y - 14) ** 2 / 100 <= 0.8) { inside++; if (g.mask[y][x]) kept++; }
    expect(kept).toBe(inside);
  });
  it('builds a noisy grey head in one grey, and keeps the gap to a nearby detail open', () => {
    const img = blank(32, 32, [0, 0, 0, 255]);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const inHead = (x: number, y: number) => (x - 13) ** 2 + (y - 15) ** 2 <= 64;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (inHead(x, y)) { const v = 62 + Math.round((rnd() - 0.5) * 16); img.data.set([v + Math.round((rnd() - 0.5) * 10), v, v + Math.round((rnd() - 0.5) * 10), 255], (y * 32 + x) * 4); }
      if (x === 25 && y >= 6 && y <= 24) img.data.set([70, 70, 70, 255], (y * 32 + x) * 4);   // smoke, 3 cells right of the head
    }
    const g = detectGhoul(img);
    for (let y = 10; y <= 20; y++) expect(g.mask[y][23]).toBe(false);
    const ids = new Map<number, number>(); let n = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (inHead(x, y)) { n++; const b = g.colors[g.cells[y][x]].brick; ids.set(b, (ids.get(b) ?? 0) + 1); }
    expect(Math.max(...ids.values()) / n).toBeGreaterThan(0.9);
    expect([...ids].sort((a, b) => b[1] - a[1])[0][0]).toBe(85);   // Dark Bluish Gray, not black
  });
  it('uses only real brick colours', () => {
    const g = detectGhoul(figureImage(SKULL, 4));
    expect(g.colors.every(c => c.brick > 0)).toBe(true);
  });
});
