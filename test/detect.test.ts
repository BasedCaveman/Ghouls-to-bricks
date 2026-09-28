import { describe, expect, it } from 'vitest';
import { detectGhoul, type GhoulGrid } from '../src/core/detect';
import { matchColor } from '../src/core/palette';
import { hexToRgb } from '../src/core/color';
import { SKULL } from './fixtures/ghouls';
import { figureImage, resize, screenshot, toJPEG } from './img';
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
  it('uses only real brick colours', () => {
    const g = detectGhoul(figureImage(SKULL, 4));
    expect(g.colors.every(c => c.brick > 0)).toBe(true);
  });
});
