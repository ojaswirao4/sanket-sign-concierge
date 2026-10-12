// Run JavaScript in the live app (headless Chrome) and print the results.
//   node evalpage.mjs script.js [query]     script.js: an async function body; its return value is printed as JSON
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(process.env.TEMP, 'evalpage-' + PORT)}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,800', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t;
for (let i = 0; i < 60; i++) {
  try { t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (t.find((x) => x.type === 'page')) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map(), logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' + (process.argv[3] ? '?' + process.argv[3] : '') });
for (let i = 0; i < 120; i++) {
  await sleep(250);
  const r = await send('Runtime.evaluate', { expression: '!!(window.aria && window.aria.avatar)', returnByValue: true });
  if (r.result?.result?.value) break;
}
const body = readFileSync(process.argv[2], 'utf8');
const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true, timeout: 600000 });
if (r.result?.exceptionDetails) console.log('ERROR', r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
else console.log(JSON.stringify(r.result?.result?.value, null, 1));
if (logs.length) console.log(logs.join('\n'));
ws.close();
chrome.kill();
process.exit(0);
