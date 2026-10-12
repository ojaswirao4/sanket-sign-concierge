// Evaluate a JS expression in the running app (headless Chrome) and print the result as JSON.
// Usage: node probe.mjs "<expression>"     (server on :5173; `aria` and signs module `m` are available)
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 9336;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, '.chrome-profile-probe')}`,
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
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result?.result?.value;
};
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' });
for (let i = 0; i < 60; i++) { await sleep(500); if (await ev('!!(window.aria && aria.avatar.ready)')) break; }
const out = await ev(`(async()=>{const m=await import('/js/signs.js');const THREE=await import('three');
const a=aria.avatar;a.queue=[];a.frame=null;
const B=(n)=>a.model.getObjectByName(n.replace(/ /g,'_'));const P=(o)=>{const v=o.getWorldPosition(new THREE.Vector3());return [v.x,v.y,v.z].map(x=>+x.toFixed(3))};
return (${process.argv[2]});})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
chrome.kill();
process.exit(0);
