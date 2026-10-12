// Headless renders of the avatar for visual checks (server must be running on :5173).
//   node shoot.mjs                         default poses: full view, face close-up, hand close-ups
//   POSES=HELLO:0,THANK-YOU:0 node shoot.mjs   hand-authored sign keyframes (NAME:frameIndex)
//   DS=MOTHER:3,BOOK:4 node shoot.mjs          dataset sign keyframes
//   LETTERS=ABCO node shoot.mjs                fingerspelling
//   PAGE=1 node shoot.mjs                      whole-page screenshot only
//   URL_Q=avatar=classic                       extra query string
//   W=1280 H=800                               window size
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || join(HERE, 'shots');
mkdirSync(OUT, { recursive: true });
const PORT = 9400 + Math.floor(Math.random() * 500);
const W = +(process.env.W || 1280), H = +(process.env.H || 800);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(process.env.TEMP || HERE, 'shoot-profile-' + PORT)}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--window-size=${W},${H}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map(), logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) logs.push(`[net ${m.params.response.status}] ${m.params.response.url}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result?.result?.value;
};
for (const d of ['Runtime', 'Page', 'Network']) await send(d + '.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const t0 = Date.now();
await send('Page.navigate', { url: 'http://localhost:5173/' + (process.env.URL_Q ? '?' + process.env.URL_Q : '') });
let ready = false;
for (let i = 0; i < 120 && !ready; i++) {
  await sleep(250);
  ready = await ev('!!(window.aria && window.aria.avatar && (aria.avatar.ready !== false))');
}
console.log('ready:', ready, 'in', Date.now() - t0, 'ms');
const shot = async (name, clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
};
if (process.env.PAGE) {
  await sleep(+(process.env.WAIT || 2500));
  await shot(process.env.NAME || 'page');
  console.log('\n' + (logs.length ? logs.join('\n') : 'no errors'));
  ws.close(); chrome.kill(); process.exit(0);
}
// hide overlays so the avatar is unobstructed
await ev(`(()=>{document.querySelectorAll('.caption,.stage-controls,.stage-tag,.mode-hint,#welcome,.welcome').forEach(e=>e.style.visibility='hidden');const a=aria.avatar;a.queue=[];a.frame=null;return true})()`);
const rect = await ev(`(()=>{const r=document.querySelector('#avatar').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
const proj = (expr) => ev(`(async()=>{const THREE=await import('three');const a=aria.avatar;const v=(${expr}).project(a.camera);const r=a.renderer.domElement.getBoundingClientRect();return {x:r.x+(v.x+1)/2*r.width,y:r.y+(1-v.y)/2*r.height}})()`);
const wpos = (o) => `${o}.getWorldPosition(new THREE.Vector3())`;

async function pose(name, frameExpr, { face = false, hand = true } = {}) {
  const r0 = await ev(`(async()=>{const m=await import('/js/signs.js');const a=aria.avatar;const f=${frameExpr};a.frame=null;a.queue=[];a.pressing=!!f.press;a.state=a._poseState(f);a._apply();return true})()`);
  if (r0 !== true) console.log(name, r0);
  await sleep(400);
  await shot(name, { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 });
  if (process.env.TORSO) {
    const tp = await proj('new THREE.Vector3(0,1.32,0.1)');
    const s = 170;
    await shot(name + '_torso', { x: tp.x - s, y: tp.y - s, width: 2 * s, height: 2 * s, scale: 2 });
  }
  if (process.env.EYE) {
    const ep = await proj('a.faceRoot.localToWorld(new THREE.Vector3(-0.031, 0, 0.07))');
    const s = 22;
    await shot(name + '_eye', { x: ep.x - s * 1.4, y: ep.y - s, width: s * 2.8, height: 2 * s, scale: 10 });
  }
  if (face) {
    const hp = await proj(wpos('a.head'));
    const s = 120;
    await shot(name + '_face', { x: hp.x - s, y: hp.y - s * 1.05, width: 2 * s, height: 2 * s, scale: 3 });
  }
  if (hand) {
    const hp = await proj(`a.hands.R.root.localToWorld(new THREE.Vector3(${process.env.HAND_OX || 0},${process.env.HAND_OY || 0.07},0))`);
    const s = +(process.env.HAND_S || 90);
    await shot(name + '_hand', { x: hp.x - s, y: hp.y - s, width: 2 * s, height: 2 * s, scale: 3 });
  }
}

const jobs = [];
if (process.env.POSES) for (const p of process.env.POSES.split(',')) { const [n, i] = p.split(':'); jobs.push([`s_${n}_${i || 0}`, `m.SIGNS[${JSON.stringify(n)}][${+i || 0}]`]); }
if (process.env.DS) for (const p of process.env.DS.split(',')) { const [n, i] = p.split(':'); jobs.push([`d_${n}_${i || 0}`, `(await (await fetch('/signs/wlasl/${n}.json')).json()).frames[${+i || 0}]`]); }
if (process.env.LETTERS) for (const L of process.env.LETTERS) jobs.push([`l_${L}`, `m.fingerspellFrames('${L}',0)[0]`]);
if (process.env.FRAME) jobs.push([process.env.NAME || 'frame', process.env.FRAME]);
if (!jobs.length) {
  await pose('m_rest', 'm.REST', { face: true, hand: true });
  jobs.push(['m_hello', 'm.SIGNS.HELLO[0]'], ['m_thankyou', 'm.SIGNS["THANK-YOU"][0]'], ['m_room', 'm.SIGNS.ROOM[1]'], ['m_letterC', "m.fingerspellFrames('C',0)[0]"], ['m_letterO', "m.fingerspellFrames('O',0)[0]"]);
}
for (const [n, e] of jobs) await pose(n, e, { face: !!process.env.FACE });
console.log('\n' + (logs.length ? logs.join('\n') : 'no errors'));
ws.close();
chrome.kill();
process.exit(0);
