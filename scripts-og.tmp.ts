import { chromium } from 'playwright';
import { SKULL } from './test/fixtures/ghouls';
const S = '/tmp/claude-0/og';
const px = 24, n = SKULL.size;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' in {} ? undefined : undefined });
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
// make the skull PNG in-browser
const png = await p.evaluate(({ rows, pal, px }) => { const c = document.createElement('canvas'); c.width = c.height = rows.length * px; const g = c.getContext('2d')!;
  rows.forEach((r: string, y: number) => [...r].forEach((ch, x) => { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); })); return c.toDataURL('image/png').split(',')[1]; }, { rows: SKULL.rows, pal: SKULL.palette, px });
const fs = await import('fs'); fs.writeFileSync(S + '/skull.png', Buffer.from(png, 'base64'));
await p.goto('http://localhost:4173/');
await p.setInputFiles('#file', S + '/skull.png');
await p.waitForSelector('#pill:has-text("Checked")', { timeout: 60000 });
await p.click('#skip'); await p.waitForTimeout(1500);
await p.locator('#view').screenshot({ path: S + '/model.png' });
await p.setViewportSize({ width: 1200, height: 630 });
const model = fs.readFileSync(S + '/model.png').toString('base64');
await p.setContent(`<body style="margin:0;width:1200px;height:630px;background:#B4DBF1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;display:flex;align-items:center;overflow:hidden">
<div style="padding-left:70px;width:560px"><div style="font:700 26px system-ui;color:#44607a">Ghouls to Bricks</div>
<div style="font:800 60px/1.08 system-ui;color:#16242f;margin:18px 0 26px">Turn your Ghoul into a brick model you can really build</div>
<div style="font:500 22px/1.5 system-ui;color:#16242f">3D build animation · PDF instructions<br>BrickLink parts list · free, in your browser</div></div>
<img src="data:image/png;base64,${model}" style="height:630px;margin-left:-40px;object-fit:cover;width:620px"></body>`);
await p.screenshot({ path: S + '/og.png' });
await b.close();
