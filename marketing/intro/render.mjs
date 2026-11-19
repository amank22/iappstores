// node render.mjs [--stills 1,5,9]  -> stills; no args -> intro-silent.mp4 (1920x1080, 60 fps)
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(execSync('npm root -g').toString().trim() + '/playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.OUT_DIR || here;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const args = process.argv.slice(2);
const sa = args.indexOf('--stills');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'intro.html'));
await page.evaluate(() => window.ready);
const DUR = await page.evaluate(() => window.DUR);
const cdp = await page.context().newCDPSession(page);
const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
const at = (t) => page.evaluate((t) => { window.renderAt(t); return new Promise((r) => requestAnimationFrame(() => r())); }, t);
if (sa >= 0) {
  for (const t of args[sa + 1].split(',').map(Number)) { await at(t); writeFileSync(path.join(out, `still-${t.toFixed(2)}.png`), await shot()); }
  await browser.close(); process.exit(0);
}
const FPS = 60, silent = path.join(out, 'intro-silent.mp4');
const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const total = Math.round(DUR * FPS);
for (let i = 0; i < total; i++) {
  await at(i / FPS);
  if (!ff.stdin.write(await shot())) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 120 === 0) console.log(`frame ${i}/${total}`);
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await browser.close(); console.log('wrote', silent);
