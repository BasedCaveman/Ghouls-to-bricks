// Synthetic pixel-art figures for tests: drawn procedurally, not real tokens.
export interface TestFigure { name: string; size: number; palette: Record<string, string>; rows: string[] }

function draw(size: number, paint: (x: number, y: number) => string): string[] {
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => paint(x, y)).join(''));
}

/** A skull-headed figure on a flat backdrop: head, eye sockets, neck and shoulders reaching the bottom edge. */
export const SKULL: TestFigure = {
  name: 'skull', size: 32,
  palette: { '.': '#6C8F5A', o: '#1B1B1B', s: '#E6E3DA', e: '#C91A09', b: '#3F3691' },
  rows: draw(32, (x, y) => {
    const head = (x - 15.5) ** 2 / 64 + (y - 12) ** 2 / 72 <= 1;
    const outline = !head && (x - 15.5) ** 2 / 81 + (y - 12) ** 2 / 90 <= 1;
    if (y >= 24 && x >= 6 && x <= 25) return y === 24 || x === 6 || x === 25 ? 'o' : 'b';
    if (y >= 20 && x >= 13 && x <= 18) return 's';
    if (head && y >= 10 && y <= 12 && ((x >= 10 && x <= 13) || (x >= 18 && x <= 21))) return 'e';
    if (head) return 's';
    if (outline) return 'o';
    return '.';
  }),
};

/** Same figure with a detail floating above its head (nothing under it). */
export const HALO: TestFigure = {
  ...SKULL, name: 'halo',
  palette: { ...SKULL.palette, h: '#F2CD37' },
  rows: SKULL.rows.map((r, y) => (y === 1 ? r.slice(0, 11) + 'hhhhhhhhhh' + r.slice(21) : r)),
};

export const FIGURES = [SKULL, HALO];
