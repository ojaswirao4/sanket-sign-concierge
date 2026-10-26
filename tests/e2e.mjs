// End-to-end checks of the real app in headless Chrome (server must be running: npm start).
//   node tests/e2e.mjs            -> prints PASS / FAIL per check, screenshots in tests/shots/
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5173/';
const PORT = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(process.env.TEMP || HERE, 'e2e-' + PORT)}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1440,900', '--no-first-run',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 80; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map(), errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !m.params.response.url.includes('/api/chat')) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true, timeout: 300000 });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
};
const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push([true, name, detail]);
    console.log('PASS', name, detail !== undefined ? '— ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '');
  } catch (e) {
    results.push([false, name, e.message]);
    console.log('FAIL', name, '—', e.message);
  }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const waitFor = async (expr, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(`return !!(${expr})`)) return true; await sleep(200); }
  throw new Error('timed out waiting for ' + expr);
};
const say = (text) => ev(`const i=document.querySelector('#textInput');i.value=${JSON.stringify(text)};document.querySelector('#composer').requestSubmit();await new Promise(r=>setTimeout(r,150));const m=[...document.querySelectorAll('.msg.bot')];return m[m.length-1].querySelector('.body').textContent`);

for (const d of ['Runtime', 'Page', 'Network']) await send(d + '.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const t0 = Date.now();
await send('Page.navigate', { url: BASE });

await check('page loads and Meera is built', async () => {
  await waitFor('window.aria && aria.avatar && aria.avatar.ready', 60000);
  await waitFor(`document.querySelector('#stageLoading').classList.contains('done')`);
  return `${Date.now() - t0} ms (software rendering)`;
});
await check('welcome screen shows, then greets on tap', async () => {
  assert(!(await ev(`return document.querySelector('#welcome').classList.contains('hide')`)), 'welcome not visible');
  await shot('01-welcome');
  await ev(`document.querySelector('#beginBtn').click()`);
  await waitFor(`document.querySelector('#welcome').classList.contains('hide')`);
  const txt = await ev(`return document.querySelector('.msg.bot .body').textContent`);
  assert(/Namaste/.test(txt), 'no greeting: ' + txt);
  await waitFor('aria.avatar.busy', 5000);
  return txt;
});
await check('motion is smooth (hands and elbows, no jumps)', async () => {
  // step the real playback deterministically at 60 fps and look at palm speed / acceleration
  return ev(`
    const a = aria.avatar, { loadSigns } = await import('/js/signs.js');
    const g = ['NAMASTE','WELCOME','HOTEL','ME','FS:MEERA','HELP','YOU','WHAT','THANK-YOU','ROOM','BOOK','FAMILY'];
    await loadSigns(g);
    a.play(g);
    let prev = null, prevV = null, maxV = 0, maxA = 0, n = 0, bad = 0, prevE = null, maxEStep = 0;
    const dt = 1/60;
    while ((a.frame) && n < 60*40) {
      a._advance(dt);
      a._apply();
      const E = a.arms.R.fore.position.clone();
      if (prevE) maxEStep = Math.max(maxEStep, E.distanceTo(prevE));
      prevE = E;
      const p = a.state.R.p.clone(), q = a.state.L.p.clone();
      if (![p.x,p.y,p.z,q.x,q.y,q.z].every(Number.isFinite)) bad++;
      if (prev) {
        const v = p.distanceTo(prev) / dt;
        maxV = Math.max(maxV, v);
        if (prevV !== null) maxA = Math.max(maxA, Math.abs(v - prevV) / dt);
        prevV = v;
      }
      prev = p; n++;
    }
    if (bad) throw new Error(bad + ' non-finite frames');
    if (maxV > 2.5) throw new Error('palm speed spike ' + maxV.toFixed(2) + ' m/s');
    if (maxA > 60) throw new Error('acceleration spike ' + maxA.toFixed(1) + ' m/s²');
    if (maxEStep > 0.04) throw new Error('elbow jumped ' + (maxEStep * 1000).toFixed(0) + ' mm in one frame');
    return { seconds: +(n/60).toFixed(1), maxSpeed_mps: +maxV.toFixed(2), maxAccel_mps2: +maxA.toFixed(1), maxElbowStep_mm: +(maxEStep * 1000).toFixed(0) };`);
});
await ev(`aria.avatar.stop()`);

const TILE_EXPECT = { 'Check-in': /check-?in/i, 'Book a room': /room/i, 'My room': /name|booking/i, 'Wi-Fi': /KESAR24/, Dining: /breakfast/i, 'Room service': /room service|menu|order/i, Taxi: /taxi|car/i, Housekeeping: /towel/i, Accessibility: /deaf|flashing|vibrat|accessib/i, Emergency: /help is coming/i };
await check('all 10 service tiles get a proper answer', async () => {
  const out = {};
  for (const [label, re] of Object.entries(TILE_EXPECT)) {
    const txt = await ev(`const b=[...document.querySelectorAll('.tile')].find(t=>t.textContent.trim()===${JSON.stringify(label)});b.click();await new Promise(r=>setTimeout(r,150));const m=[...document.querySelectorAll('.msg.bot')];return m[m.length-1].querySelector('.body').textContent`);
    assert(re.test(txt), `${label}: unexpected reply "${txt.slice(0, 90)}"`);
    out[label] = txt.slice(0, 40) + '…';
    if (label === 'Book a room') await say('cancel');
    if (label === 'My room') await say('never mind');
  }
  await shot('02-tiles');
  return Object.keys(out).length + ' tiles';
});
await check('booking flow ends with a ticket card', async () => {
  await ev(`document.querySelector('#newGuest').click()`);
  const steps = ['I want to book a room', 'deluxe', '2 nights', '2 guests', 'Priya Shah', 'yes'];
  let last = '';
  for (const s of steps) last = await say(s);
  assert(/Booking ID KSR\d+/.test(last), 'no confirmation: ' + last);
  const ticket = await ev(`const t=document.querySelector('.ticket');return t&&t.textContent`);
  assert(ticket && /KSR\d+/.test(ticket), 'no ticket card');
  await shot('03-booking');
  return ticket.replace(/\s+/g, ' ');
});
await check('room lookup by booking ID', async () => {
  const txt = await say('KSR1022');
  assert(/512/.test(txt), txt);
  return txt.slice(0, 60);
});
await check('every sign in every reply can be performed', async () => {
  return ev(`
    const { hasSign } = await import('/js/signs.js');
    const bad = [];
    document.querySelectorAll('.msg.bot .gl').forEach((g) => g.textContent.split(' · ').forEach((t) => {
      const tok = t.includes('-') && t.length > 1 && /^[A-Z](-[A-Z0-9])+$/.test(t) ? 'FS' : t.replace(' ', '-');
      if (tok !== 'FS' && !/^\\d+$/.test(tok) && !hasSign(tok) && !/^[A-Z]$/.test(tok)) bad.push(t);
    }));
    if (bad.length) throw new Error('unknown signs: ' + [...new Set(bad)].join(', '));
    return document.querySelectorAll('.msg.bot').length + ' replies checked';`);
});
await check('Call staff notifies and Meera signs it', async () => {
  await ev(`document.querySelector('#callStaff').click()`);
  await waitFor(`!document.querySelector('#toast').hidden`);
  const t = await ev(`return document.querySelector('#callStaff').textContent.trim()`);
  assert(/notified/i.test(t), t);
  await shot('04-call-staff');
  return t;
});
await check('interpreter mode: phrases, no tiles, signs staff text', async () => {
  await ev(`document.querySelector('[data-mode=interpreter]').click()`);
  const s = await ev(`return {tiles: document.querySelector('#services').hidden, chips: document.querySelectorAll('#quick button').length, title: document.querySelector('#panelTitle').textContent}`);
  assert(s.tiles && s.chips >= 5 && s.title === 'Interpreter', JSON.stringify(s));
  const txt = await ev(`document.querySelector('#quick button').click();await new Promise(r=>setTimeout(r,150));const m=[...document.querySelectorAll('.msg.bot')];return m[m.length-1].querySelector('.meta').textContent`);
  assert(/signed to guest/i.test(txt), txt);
  await shot('05-interpreter');
  await ev(`document.querySelector('[data-mode=concierge]').click()`);
  return s;
});
await check('sign board builds a sentence and translates it', async () => {
  await ev(`document.querySelector('#signBtn').click()`);
  await ev(`document.querySelector('.sign-tabs [data-src=board]').click()`);
  await ev(`for (const l of ['WANT','ROOM']) [...document.querySelectorAll('#boardPane button')].find(b=>b.textContent===l).click()`);
  const chips = await ev(`return [...document.querySelectorAll('#glossBuffer .bchip')].map(c=>c.textContent).join(' ')`);
  assert(chips === 'WANT ROOM', chips);
  await ev(`document.querySelector('#bufSend').click()`);
  await sleep(300);
  const u = await ev(`const m=[...document.querySelectorAll('.msg.user')];return m[m.length-1].querySelector('.body').textContent`);
  assert(/room/i.test(u), u);
  return `"${chips}" → "${u}"`;
});
await check('camera + hand tracking start (fake camera)', async () => {
  await ev(`document.querySelector('.sign-tabs [data-src=camera]').click()`);
  await waitFor(`document.querySelector('#camLoading').hidden`, 120000); // the MediaPipe models download from a CDN
  await shot('06-camera');
  await ev(`document.querySelector('#signClose').click()`);
  await sleep(300);
  const live = await ev(`const v=document.querySelector('#cam');return !!(v.srcObject && v.srcObject.getTracks().some(t=>t.readyState==='live'))`);
  assert(!live, 'camera still on after closing');
  return 'camera released on close';
});
await check('new guest clears the conversation', async () => {
  await ev(`document.querySelector('#newGuest').click()`);
  const n = await ev(`return document.querySelectorAll('.msg').length`);
  assert(n === 1, n + ' messages left');
  return 'only the greeting remains';
});
await check('kiosk privacy reset returns to the welcome screen', async () => {
  await say('KSR1021');
  await ev(`aria.showWelcome()`);
  const s = await ev(`return {welcome: !document.querySelector('#welcome').classList.contains('hide'), msgs: document.querySelectorAll('.msg').length}`);
  assert(s.welcome && s.msgs === 0, JSON.stringify(s));
  await ev(`document.querySelector('#beginBtn').click()`);
  return s;
});
await check('all dataset signs load and are valid', async () => {
  return ev(`
    const list = await (await fetch('/signs/wlasl/index.json')).json();
    let frames = 0; const bad = [];
    await Promise.all(list.map(async (t) => {
      const d = await (await fetch('/signs/wlasl/' + encodeURIComponent(t) + '.json')).json();
      const ok = d.frames.length > 0 && d.frames.length <= 60 && d.frames.every((f) => f.R && ['p','f','n'].every((k) => f.R[k].every(Number.isFinite)) && f.t > 0);
      if (!ok) bad.push(t);
      frames += d.frames.length;
    }));
    if (bad.length) throw new Error('bad: ' + bad.join(', '));
    return list.length + ' signs, ' + frames + ' keyframes';`);
});
await check('speed slider and replay work', async () => {
  await ev(`const s=document.querySelector('#speed');s.value='1.3';s.dispatchEvent(new Event('input'))`);
  const sp = await ev(`return aria.avatar.speed`);
  assert(sp === 1.3, 'speed ' + sp);
  await ev(`document.querySelector('#replayBtn').click()`);
  await waitFor('aria.avatar.busy', 5000);
  await ev(`const s=document.querySelector('#speed');s.value='1';s.dispatchEvent(new Event('input'))`);
  return 'speed 1.3×, replay started';
});
await check('HTML in messages is shown as text (no injection)', async () => {
  await say('<img src=x onerror=alert(1)> hello');
  const n = await ev(`return document.querySelectorAll('.msg img').length`);
  assert(n === 0, 'img element injected');
  return 'escaped';
});
const FLIGHT_TILES = { Safety: /seatbelt|oxygen/i, 'My seat': /name|PNR/i, Meals: /biryani/i, Drinks: /tea|coffee/i, Blanket: /seat number/i, Restroom: /front|back/i, Landing: /land in Jaipur/i, Connections: /next flight/i, 'Feeling unwell': /medicine/i, Emergency: /help is coming/i };
await check('flight venue: cabin scene, strip and all 10 tiles answer', async () => {
  await ev(`aria.setVenue('flight')`);
  const s = await ev(`return {sub: document.querySelector('#brandSub').textContent, strip: !document.querySelector('#flightStrip').hidden, left: document.querySelector('#fsLeft').textContent, greet: document.querySelector('.msg.bot .body').textContent, msgs: document.querySelectorAll('.msg').length}`);
  assert(/Kesar Air/.test(s.sub) && s.strip && /min to landing/.test(s.left) && /aboard/.test(s.greet) && s.msgs === 1, JSON.stringify(s));
  for (const [label, re] of Object.entries(FLIGHT_TILES)) {
    const txt = await ev(`const b=[...document.querySelectorAll('.tile')].find(t=>t.textContent.trim()===${JSON.stringify(label)});b.click();await new Promise(r=>setTimeout(r,150));const m=[...document.querySelectorAll('.msg.bot')];return m[m.length-1].querySelector('.body').textContent`);
    assert(re.test(txt), `${label}: unexpected reply "${txt.slice(0, 90)}"`);
    if (['My seat', 'Meals', 'Drinks', 'Blanket'].includes(label)) await say('never mind');
  }
  return s.left;
});
await check('flight: seat lookup, then an order ends with a card', async () => {
  await ev(`document.querySelector('#newGuest').click()`);
  const seat = await say('K7Q2XM');
  assert(/12A/.test(seat), seat);
  const done = await say('could I get a coffee please');
  assert(/seat 12A/.test(done), done);
  const card = await ev(`const t=[...document.querySelectorAll('.ticket')].pop();return t&&t.textContent`);
  assert(card && /Order placed/.test(card) && /12A/.test(card), 'no order card');
  const meal = await say('I am hungry');
  const veg = await say('veg please');
  assert(/biryani/i.test(meal) && /paneer biryani to seat 12A/i.test(veg), veg);
  await sleep(1500);
  await shot('09-flight');
  return card.replace(/\s+/g, ' ');
});
await check('flight: sign board BLANKET is understood and ordered', async () => {
  await ev(`document.querySelector('#signBtn').click()`);
  await ev(`document.querySelector('.sign-tabs [data-src=board]').click()`);
  await ev(`[...document.querySelectorAll('#boardPane button')].find(b=>b.textContent==='BLANKET').click()`);
  await ev(`document.querySelector('#bufSend').click()`);
  await sleep(300);
  const r = await ev(`const u=[...document.querySelectorAll('.msg.user')].pop(),b=[...document.querySelectorAll('.msg.bot')].pop();return [u.querySelector('.body').textContent,b.querySelector('.body').textContent]`);
  await ev(`document.querySelector('#signClose').click()`);
  assert(/blanket/i.test(r[0]) && /blanket to seat 12A/i.test(r[1]), JSON.stringify(r));
  return `"${r[0]}" → "${r[1].slice(0, 50)}…"`;
});
await check('flight: every sign in every reply can be performed', async () => {
  return ev(`
    const { hasSign } = await import('/js/signs.js');
    const bad = [];
    document.querySelectorAll('.msg.bot .gl').forEach((g) => g.textContent.split(' · ').forEach((t) => {
      const tok = t.includes('-') && t.length > 1 && /^[A-Z](-[A-Z0-9])+$/.test(t) ? 'FS' : t.replace(' ', '-');
      if (tok !== 'FS' && !/^\\d+$/.test(tok) && !hasSign(tok) && !/^[A-Z]$/.test(tok)) bad.push(t);
    }));
    if (bad.length) throw new Error('unknown signs: ' + [...new Set(bad)].join(', '));
    return document.querySelectorAll('.msg.bot').length + ' replies checked';`);
});
const SCHEME_TILES = { 'Find my schemes': /UDID card\? If yes/i, 'UDID card': /UDID/, 'Hearing aids': /hearing aids/i, Pension: /pension/i, Scholarships: /scholarship/i, 'Jobs & skills': /training|PM-DAKSH/i, Loans: /loan/i, 'Train travel': /50%|concession/i, 'Sign language': /ISLRTC|Sign Language/i, 'State schemes': /state/i };
await check('welfare schemes venue: all 10 tiles answer, each scheme shows official documents', async () => {
  await ev(`aria.setVenue('schemes')`);
  const sub = await ev(`return document.querySelector('#brandSub').textContent`);
  assert(/welfare/i.test(sub), sub);
  for (const [label, re] of Object.entries(SCHEME_TILES)) {
    const txt = await ev(`const b=[...document.querySelectorAll('.tile')].find(t=>t.textContent.trim()===${JSON.stringify(label)});b.click();await new Promise(r=>setTimeout(r,150));const m=[...document.querySelectorAll('.msg.bot')];return m[m.length-1].querySelector('.body').textContent`);
    assert(re.test(txt), `${label}: unexpected reply "${txt.slice(0, 90)}"`);
    if (label === 'Find my schemes') await say('never mind');
  }
  // every scheme card links only to official government sites
  const links = await ev(`return [...document.querySelectorAll('.doc-card .doc-link')].map(a=>a.href)`);
  const cards = await ev(`return document.querySelectorAll('.doc-card').length`);
  assert(cards >= 9, cards + ' document cards');
  const bad = links.filter((u) => !/^https:\/\/([a-z0-9-]+\.)*(gov\.in|nic\.in)\//.test(u));
  assert(!bad.length, 'non-government links: ' + bad.join(' '));
  return `${cards} document cards, ${links.length} official links`;
});
await check('welfare: "find my schemes" asks 4 questions, then lists schemes that open their documents', async () => {
  await ev(`document.querySelector('#newGuest').click()`);
  for (const s of ['find my schemes', 'yes I have 85 percent', '30', 'looking for a job']) await say(s);
  const last = await say('yes');
  assert(/these schemes can help you/i.test(last) && /pension/i.test(last), last);
  const n = await ev(`return document.querySelectorAll('.msg.bot:last-child .scheme-list button').length`);
  assert(n >= 5, n + ' scheme buttons');
  await ev(`document.querySelector('.msg.bot:last-child .scheme-list button').click()`);
  await sleep(200);
  const card = await ev(`const m=[...document.querySelectorAll('.msg.bot')].pop();return m.querySelector('.doc-card .doc-head b')?.textContent`);
  assert(card, 'tapping a scheme did not show its documents');
  const docs = await say('what documents do I need');
  assert(new RegExp(card.split(' ')[0]).test(docs), docs);
  await sleep(1200);
  await shot('11-schemes');
  return `${n} schemes; tapped "${card}"`;
});
await check('sign board: live meaning shows the full sentence before sending', async () => {
  await ev(`document.querySelector('#signBtn').click()`);
  await ev(`document.querySelector('.sign-tabs [data-src=board]').click()`);
  await ev(`for (const l of ['HELLO','HEARING AID']) [...document.querySelectorAll('#boardPane button')].find(b=>b.textContent===l).click()`);
  const meaning = await ev(`return document.querySelector('#bufMeaning').hidden ? '' : document.querySelector('#bufMeaning b').textContent`);
  assert(meaning === 'Hello! How can I get a free hearing aid?', meaning);
  await ev(`document.querySelector('#bufSend').click()`);
  await sleep(300);
  const r = await ev(`const b=[...document.querySelectorAll('.msg.bot')].pop();return b.querySelector('.body').textContent`);
  await ev(`document.querySelector('#signClose').click()`);
  assert(/hearing aid/i.test(r), r);
  return `"${meaning}"`;
});
await check('welfare: every sign in every reply can be performed', async () => {
  return ev(`
    const { hasSign } = await import('/js/signs.js');
    const bad = [];
    document.querySelectorAll('.msg.bot .gl').forEach((g) => g.textContent.split(' · ').forEach((t) => {
      const tok = t.includes('-') && t.length > 1 && /^[A-Z](-[A-Z0-9])+$/.test(t) ? 'FS' : t.replace(' ', '-');
      if (tok !== 'FS' && !/^\\d+$/.test(tok) && !hasSign(tok) && !/^[A-Z]$/.test(tok)) bad.push(t);
    }));
    if (bad.length) throw new Error('unknown signs: ' + [...new Set(bad)].join(', '));
    return document.querySelectorAll('.msg.bot').length + ' replies checked';`);
});
await check('switching back to the hotel restores it', async () => {
  await ev(`aria.setVenue('hotel')`);
  const s = await ev(`return {strip: document.querySelector('#flightStrip').hidden, tile: document.querySelector('.tile').textContent.trim(), greet: document.querySelector('.msg.bot .body').textContent}`);
  assert(s.strip && s.tile === 'Check-in' && /Kesar Palace/.test(s.greet), JSON.stringify(s));
  return s.tile;
});

await sleep(2500);
await shot('07-main');
await check('phone layout (390 px): no sideways scrolling', async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1200);
  const w = await ev(`return {sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth}`);
  await shot('08-phone');
  assert(w.sw <= w.cw + 1, JSON.stringify(w));
  await ev(`aria.setVenue('flight'); document.querySelector('.panel').scrollIntoView()`);
  await sleep(800);
  const f = await ev(`return {sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth}`);
  await shot('10-phone-flight');
  await ev(`aria.setVenue('hotel')`);
  assert(f.sw <= f.cw + 1, 'flight: ' + JSON.stringify(f));
  return w;
});
await check('no errors in the console or network', async () => {
  assert(!errors.length, errors.join(' | '));
  return 'clean';
});

const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed` + (failed.length ? ` — FAILED: ${failed.map((f) => f[1]).join('; ')}` : ''));
ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
