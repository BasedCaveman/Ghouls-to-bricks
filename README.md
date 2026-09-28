# Ghouls to Bricks

Turn your Ghoul into a brick model you can really build.

## How to use

1. **Drop, paste or upload your Ghoul**: the original image, a download, or a screenshot (e.g. of its marketplace page). There is no built-in token list: the image is the only input.
2. Optionally type its **OpenSea code** (e.g. `#1284`). It is only a label (name plate, booklet, file names): it is never fetched, looked up or guessed.
3. **① Your model**: pick **Mini** (1 pixel = 1 stud) or **XL** (1 pixel = 2 studs wide), and **Backdrop** (the figure standing out from a wall made of the image's background) or **Figure only**. Watch it build in 3D; "More info" shows every check. Download a video of the build.
4. **② Instructions**: flip through the booklet on the page, download it as a PDF or a full kit (PDF + parts list).
5. **③ Buy the bricks**: Pick a Brick upload file and BrickLink wanted list (XML). "Only parts LEGO sells" rebuilds with parts and colours LEGO sells and runs every check again.

## How it works

1. **Find the grid** (`src/core/detect.ts`). A small image (≤96 px) is read pixel for pixel. Otherwise the pixel pitch and phase are fitted to the image's colour edges (autocorrelation along x and y, 32×32 expected), each cell is read as the median of its centre, and screenshot frames are trimmed. In a page screenshot the figure's square backdrop is found first. The figure is told from its backdrop by a flood fill from the border in Lab space.
2. **Pick brick colours** (`src/core/palette.ts`). Nearest BrickLink colour by CIEDE2000, then the least-used colours are merged until at most 24 remain.
3. **Build** (`src/core/build.ts`, `src/core/tile.ts`). Two black base plates, then one brick or two plates per pixel row (XL: brick + 2 plates), bottom-up. Each figure pixel is extruded through the depth; in backdrop mode a one-stud wall of the background colour stands behind it. Each sheet is filled largest pieces first, alternating direction so seams cross. Floating pieces are repaired: in backdrop mode tied into the wall by a piece running through the depth, otherwise held by a stack of Trans-Clear 1×1 supports.
4. **Check** (`src/core/check.ts`) the final piece list: studs connected, 0 floating, 0 collisions, centre of mass over the base, weak joints.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (detection, solidity, exports, order files)
npm run build      # static site in dist/
```

The figures in `test/fixtures` are drawn procedurally and only used by the tests.

## Notes

Unofficial fan project · Not affiliated with, sponsored or endorsed by the LEGO Group, BrickLink or the Ghouls project. LEGO® is a trademark of the LEGO Group. Parts data: Rebrickable. No purchases, payments or personal data go through this site. Models are computer-checked, not physically build-tested.

Made by pedr0x.eth · Tips welcome at pedr0x.eth. A fork of Punk to Bricks, made by John Karp · NFT Morning.

## License

[MIT](LICENSE). See also the [disclaimer](DISCLAIMER.md). The license covers the code only, not Ghoul images or any trademark.
