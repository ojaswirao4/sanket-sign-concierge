// Headless check of the human avatar: loads the app, freezes Aria at test poses, saves screenshots.
// Usage: node pose_test.mjs            (server must be running on :5173)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'shots');
mkdirSync(OUT, { recursive: true });
const PORT = 9335;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, '.chrome-profile')}`,
  '--enable-unsafe-swiftshader', '--window-size=1100,900', '--no-first-run', 'about:blank',
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
const CLASSIC = process.env.AVATAR === 'classic';
await send('Page.navigate', { url: 'http://localhost:5173/' + (CLASSIC ? '?avatar=classic' : '') });

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  await sleep(500);
  ready = await ev(CLASSIC ? '!!window.aria' : '!!(window.aria && (aria.avatar.ready || aria.avatar.fallback))');
}
console.log('ready:', ready, ' fallback:', await ev('!!aria.avatar.fallback'));
console.log('scale k:', JSON.stringify(await ev('aria.avatar.k')));
console.log('morphs found:', await ev('Object.keys(aria.avatar.morph||{}).length'), ' e.g.', await ev('["EyeBlinkLeft","BrowInnerUp","MouthSmileLeft","aa","JawOpen"].map(n=>n+":"+!!aria.avatar.morph[n]).join(" ")'));

await ev(`(()=>{const a=aria.avatar;a.queue=[];a.frame=null;return true})()`);
const rect = await ev(`(()=>{const r=document.querySelector('#avatar').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
const full = { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 0.8 };

async function pose(name, frameExpr, clip = full) {
  const r0 = await ev(`(async()=>{const m=await import('/js/signs.js');const a=aria.avatar;const f=${frameExpr};a.frame=null;a.queue=[];a.state=a._poseState(f);a._apply();return true})()`);
  if (r0 !== true) console.log(name, r0);
  await sleep(350);
  const r = await send('Page.captureScreenshot', { format: 'png', clip });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
  // close-up of the right hand (projected from the hand bone), at 3x
  const hp = await ev(`(async()=>{const THREE=await import('three');const a=aria.avatar;const b=a.model?(a.model.getObjectByName('Bip01_R_Finger2')||a.model.getObjectByName('Bip01 R Finger2')):a.hands.R.fingers[1][0];
    const v=b.getWorldPosition(new THREE.Vector3()).project(a.camera);const r=a.renderer.domElement.getBoundingClientRect();
    return {x:r.x+(v.x+1)/2*r.width,y:r.y+(1-v.y)/2*r.height}})()`);
  if (hp?.x) {
    const s = 95;
    const z = await send('Page.captureScreenshot', { format: 'png', clip: { x: hp.x - s, y: hp.y - s, width: 2 * s, height: 2 * s, scale: 3 } });
    writeFileSync(join(OUT, name + '_hand.png'), Buffer.from(z.result.data, 'base64'));
  }
}

// DS=NOT,OPEN : pose each dataset sign at its worst hand-overlap frame, with and without collision
if (process.env.DS) {
  const bothHands = async () => ev(`(async()=>{const THREE=await import('three');const a=aria.avatar;const P=(n)=>a.model.getObjectByName(n).getWorldPosition(new THREE.Vector3());
    const v=P('Bip01_R_Finger2').add(P('Bip01_L_Finger2')).multiplyScalar(0.5).project(a.camera);const r=a.renderer.domElement.getBoundingClientRect();
    return {x:r.x+(v.x+1)/2*r.width,y:r.y+(1-v.y)/2*r.height}})()`);
  for (const t of process.env.DS.split(',')) {
    const k = await ev(`(async()=>{const a=aria.avatar;const d=await (await fetch('/signs/wlasl/${t}.json')).json();let best=0,bi=0;
      d.frames.forEach((f,i)=>{a.state=a._poseState(f);a.noHandCollision=true;a._apply();const o=a._handOverlap();if(o&&o.depth>best)(best=o.depth),(bi=i)});a.noHandCollision=false;window.__f=d.frames[bi];return bi})()`);
    for (const on of [false, true]) {
      await ev(`(()=>{const a=aria.avatar;a.noHandCollision=${!on};a.frame=null;a.queue=[];a.state=a._poseState(window.__f);a._apply();return true})()`);
      await sleep(300);
      const hp = await bothHands();
      const s = 110;
      const z = await send('Page.captureScreenshot', { format: 'png', clip: { x: hp.x - s, y: hp.y - s, width: 2 * s, height: 2 * s, scale: 2.5 } });
      writeFileSync(join(OUT, `40_${t}_${on ? 'fixed' : 'raw'}.png`), Buffer.from(z.result.data, 'base64'));
    }
    console.log(t, 'worst frame', k);
  }
  await ev('aria.avatar.noHandCollision=false');
  ws.close(); chrome.kill(); process.exit(0);
}

await pose('00_rest', 'm.REST');
await pose('01_hello', 'm.SIGNS.HELLO[0]');
const LETTERS = process.env.LETTERS || 'ABLYWVOCSEFD';
for (const L of LETTERS) await pose('10_letter_' + L, `m.fingerspellFrames('${L}',0)[0]`);
await pose('20_thankyou', 'm.SIGNS["THANK-YOU"][0]');
await pose('21_room', 'm.SIGNS.ROOM[1]');
await pose('30_mother_ds', `(await (await fetch('/signs/wlasl/MOTHER.json')).json()).frames[3]`);
await pose('31_book_ds', `(await (await fetch('/signs/wlasl/BOOK.json')).json()).frames[4]`);

console.log('\n' + (logs.length ? logs.join('\n') : 'no errors'));
ws.close();
chrome.kill();
process.exit(0);
