// Render Aria at chosen keyframes of dataset signs (headless Chrome over CDP).
// Usage: node preview.mjs [GLOSS ...]    (server must be running on :5173)
// Writes preview/<GLOSS>_<k>.png; then run `python sheet.py` to build comparison sheets.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNS = join(HERE, '..', '..', 'public', 'signs', 'wlasl');
const OUT = join(HERE, 'preview');
mkdirSync(OUT, { recursive: true });
const PICK = 4; // keyframes per sign
const glosses = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(readFileSync(join(SIGNS, 'index.json'), 'utf8'));

const PORT = 9334;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, '.chrome-profile')}`,
  '--enable-unsafe-swiftshader', '--window-size=900,800', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(4000);
// freeze Aria: stop idle playback so poses are exact
await ev(`(()=>{const a=aria.avatar;a.queue=[];a.frame=null;a.speed=0;return true})()`);
const rect = await ev(`(()=>{const r=document.querySelector('#avatar').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
// crop to the upper body
const clip = { x: rect.x + rect.w * 0.15, y: rect.y + rect.h * 0.08, width: rect.w * 0.7, height: rect.h * 0.8, scale: 0.6 };

const picks = {};
for (const g of glosses) {
  const doc = JSON.parse(readFileSync(join(SIGNS, g + '.json'), 'utf8'));
  const n = doc.frames.length;
  const ks = [...new Set(Array.from({ length: PICK }, (_, i) => Math.round((i * (n - 1)) / (PICK - 1))))];
  picks[g] = ks.map((k) => ({ k, vf: doc.videoFrames[k] }));
  for (const k of ks) {
    await ev(`(()=>{const a=aria.avatar;const f=${JSON.stringify(doc.frames[k])};a.frame=null;a.queue=[];a.state=a._poseState(f);a._apply();return true})()`);
    await sleep(120);
    const r = await send('Page.captureScreenshot', { format: 'png', clip });
    writeFileSync(join(OUT, `${g}_${k}.png`), Buffer.from(r.result.data, 'base64'));
  }
  console.log(g, 'keyframes', ks.join(','));
}
writeFileSync(join(OUT, 'picks.json'), JSON.stringify(picks));
ws.close();
chrome.kill();
process.exit(0);
