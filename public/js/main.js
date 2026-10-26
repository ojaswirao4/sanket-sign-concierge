import { Avatar } from './avatar.js';
import { MeeraAvatar } from './meera.js';
import { hasSign, loadSigns, textToGloss, glossLabel, datasetReady } from './signs.js';
import { glossToEnglish } from './bot.js';
import { VENUES } from './venues.js';
import { SCHEMES, SCHEME_CATS, SCHEMES_CHECKED } from './schemes-data.js';
import { createListener, speak, stopSpeaking, speechSupported } from './speech.js';

const $ = (s) => document.querySelector(s);
const P = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICON = {
  keyboard: P('M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-9 3h2v2h-2zm0 3h2v2h-2zM8 8h2v2H8zm0 3h2v2H8zm-1 2H5v-2h2zm0-3H5V8h2zm9 7H8v-2h8zm0-4h-2v-2h2zm0-3h-2V8h2zm3 3h-2v-2h2zm0-3h-2V8h2z'),
  mic: P('M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 6-6.9z'),
  sign: P('M21 7a2 2 0 0 0-4 0v3h-.5V4a2 2 0 0 0-4 0v6H12V3a2 2 0 0 0-4 0v8h-.5V6a2 2 0 0 0-4 0v8.5a8 8 0 0 0 8 8h1a8.5 8.5 0 0 0 8.5-8.5z'),
  lotus: P('M12 3c1.8 2 2.7 4.2 2.7 6.4 0 1.6-.5 3.1-1.4 4.4 2.2-.6 4.4-2.1 6.2-4.4.4 3.9-2.2 8-7.5 8.6-5.3-.6-7.9-4.7-7.5-8.6 1.8 2.3 4 3.8 6.2 4.4-.9-1.3-1.4-2.8-1.4-4.4C9.3 7.2 10.2 5 12 3zM4 19h16v2H4z'),
  replay: P('M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z'),
  ticket: P('M20 12a2 2 0 0 1 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 1-2-2zm-4.6 4.8L12 14.5l-3.4 2.3 1.1-3.9-3.2-2.5 4-.2L12 6.5l1.5 3.7 4 .2-3.2 2.5z'),
  check: P('M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'),
};

const params = new URLSearchParams(location.search);
const store = {
  get: (k) => { try { return localStorage.getItem('sanket.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('sanket.' + k, v); } catch {} },
};
// ?venue=flight locks a kiosk to one venue (and hides the picker on the welcome screen)
const lockedVenue = VENUES[params.get('venue')] ? params.get('venue') : null;

const state = {
  venue: lockedVenue || (VENUES[store.get('venue')] ? store.get('venue') : 'hotel'),
  mode: 'concierge',
  voice: true,
  ai: false,
  useAI: true,
  sayUser: true,
  last: null,
  history: [],
  buffer: [], // { tok, kind: 'sign'|'spell'|'num' }
  recMode: 'words',
  started: false,
};
const V = () => VENUES[state.venue];

// Meera (our own avatar) by default; ?avatar=rocketbox / ?avatar=classic bring back the earlier ones
const which = params.get('avatar');
const AvatarClass = which === 'classic' ? Avatar : which === 'rocketbox' ? (await import('./human.js')).HumanAvatar : MeeraAvatar;
const avatar = new AvatarClass($('#avatar'));
let bot = V().createBot();
requestAnimationFrame(() => requestAnimationFrame(() => $('#stageLoading').classList.add('done')));

// ---------- captions & playback ----------
function renderGloss(tokens) {
  const strip = $('#glossStrip');
  strip.innerHTML = '';
  tokens.forEach((t, i) => {
    const el = document.createElement('span');
    el.className = 'gtok';
    el.dataset.i = i;
    el.dataset.label = glossLabel(t);
    el.dataset.pos = -1;
    el.textContent = el.dataset.label;
    strip.appendChild(el);
  });
}
// ---------- captions in pages, like subtitles ----------
// The caption box fits about 3 lines; a long answer is split at sentence (or comma) boundaries into pages
// that turn as Meera signs. ‹ › flip pages, "Show all" (or tapping the text) shows the whole answer.
const capt = { pages: [''], page: 0, full: false, glossLen: 1, target: 0, shownAt: 0, manual: false };
function paginate(text) {
  const box = $('#captionText');
  const fs = parseFloat(getComputedStyle(box).fontSize) || 17;
  const perLine = Math.max(24, Math.floor((box.clientWidth || 600) / (fs * 0.52)));
  const budget = Math.floor(perLine * 3 * 0.92);
  if (text.length <= budget) return [text];
  const parts = text.match(/[^.!?;:]+[.!?;:]+["”’)]*\s*|[^.!?;:]+$/g) || [text];
  // split any single sentence that is still too long at commas, then at word boundaries
  const pieces = parts.flatMap((p) => (p.length <= budget ? [p] : p.split(/(?<=,)\s+/))).flatMap((p) => {
    if (p.length <= budget) return [p];
    const out = [];
    let cur = '';
    for (const w of p.split(/\s+/)) {
      if ((cur + ' ' + w).trim().length > budget) out.push(cur.trim()), (cur = w);
      else cur = (cur + ' ' + w).trim();
    }
    return cur ? [...out, cur] : out;
  });
  const pages = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && (cur + ' ' + p).trim().length > budget) pages.push(cur.trim()), (cur = p);
    else cur = (cur + ' ' + p).trim();
  }
  if (cur.trim()) pages.push(cur.trim());
  return pages;
}
function showCapPage(i) {
  capt.page = Math.max(0, Math.min(capt.pages.length - 1, i));
  const multi = capt.pages.length > 1;
  $('#captionText').textContent = capt.full ? capt.pages.join(' ') : capt.pages[capt.page];
  $('#captionText').classList.toggle('full', capt.full);
  $('#capPager').hidden = !multi;
  $('#capPage').textContent = capt.full ? 'All' : `${capt.page + 1} / ${capt.pages.length}`;
  $('#capPrev').disabled = capt.full || capt.page === 0;
  $('#capNext').disabled = capt.full || capt.page === capt.pages.length - 1;
  $('#capAll').textContent = capt.full ? 'Show less' : 'Show all';
}
// Pages follow the signing, but each stays up long enough to read (~15 characters a second, at least
// 2.5 s); pages the signing has passed keep turning on that timer after she finishes. Using ‹ › or
// "Show all" hands control to the reader.
let capTimer;
const readMs = (i) => Math.max(2500, (capt.pages[i] || '').length * 65);
function capWant(page) {
  capt.target = Math.max(capt.target, Math.min(capt.pages.length - 1, page));
  capTick();
}
function capTick() {
  clearTimeout(capTimer);
  if (capt.manual || capt.full || capt.page >= capt.target) return;
  const wait = capt.shownAt + readMs(capt.page) - performance.now();
  if (wait > 0) capTimer = setTimeout(capTick, wait);
  else {
    showCapPage(capt.page + 1);
    capt.shownAt = performance.now();
    capTick();
  }
}
function setCaption(text, glossLen = 1) {
  clearTimeout(capTimer);
  capt.pages = paginate(text);
  capt.full = false;
  capt.manual = false;
  capt.target = 0;
  capt.shownAt = performance.now();
  capt.glossLen = Math.max(1, glossLen);
  showCapPage(0);
}
$('#capPrev').onclick = () => ((capt.manual = true), showCapPage(capt.page - 1));
$('#capNext').onclick = () => ((capt.manual = true), showCapPage(capt.page + 1));
$('#capAll').onclick = () => ((capt.full = !capt.full), showCapPage(capt.page));
$('#captionText').onclick = () => capt.pages.length > 1 && ((capt.full = !capt.full), showCapPage(capt.page));

function highlight(gi, frame) {
  // turn the caption page in step with the signing
  if (capt.pages.length > 1) capWant(Math.floor(((gi + 1) * capt.pages.length) / capt.glossLen));
  document.querySelectorAll('.gtok').forEach((el) => {
    const i = +el.dataset.i;
    el.classList.toggle('now', i === gi);
    el.classList.toggle('done', i < gi);
    if (i === gi && frame?.letter) {
      // show which letter/digit is being fingerspelled right now
      const label = el.dataset.label;
      const sep = label.includes('-') ? '-' : '';
      const parts = sep ? label.split('-') : label.split('');
      const pos = (+el.dataset.pos + 1) % parts.length;
      el.dataset.pos = pos;
      el.innerHTML = parts.map((l, j) => (j === pos ? `<span class="letter">${l}</span>` : l)).join(sep);
    } else if (i !== gi && el.dataset.label) el.textContent = el.dataset.label;
  });
}

function sanitizeGloss(g) {
  return (g || [])
    .map((t) => String(t).trim().toUpperCase())
    .filter(Boolean)
    .map((t) => (hasSign(t) || t.startsWith('FS:') || /^\d+$/.test(t) ? t : t.length <= 6 && /^[A-Z]+$/.test(t) ? 'FS:' + t : null))
    .filter(Boolean)
    .slice(0, 18);
}

// Which words have a video sign is only known once the dataset index has loaded; deciding before that
// spelled words like TRAIN or CARD letter by letter. So wait for it (it is normally ready long before).
function perform(reply, opts) {
  const pending = (state.performing = {});
  datasetReady.then(() => state.performing === pending && performNow(reply, opts));
}
function performNow({ text, gloss }, { voice = state.voice } = {}) {
  const g = sanitizeGloss(gloss && gloss.length ? gloss : textToGloss(text));
  state.last = { text, gloss: g };
  setCaption(text, g.length);
  renderGloss(g);
  const last = state.last;
  loadSigns(g).then(() => {
    if (state.last !== last) return; // a newer reply started while signs were loading
    avatar.play(g, {
      onGloss: highlight,
      onDone: () => {
        document.querySelectorAll('.gtok').forEach((e) => e.classList.replace('now', 'done'));
        if (state.last === last) capWant(capt.pages.length - 1); // show the rest of a long caption
      },
    });
  });
  if (voice) speak(text, { onStart: () => avatar.setTalking(true), onEnd: () => avatar.setTalking(false) });
}

// ---------- chat ----------
// Confirmations (a room booking, an in-flight order) carry a card with the key details.
function ticketCard(card) {
  const el = document.createElement('div');
  el.className = 'ticket';
  el.innerHTML = `<div class="ticket-head">${ICON.ticket}<span></span></div><div class="ticket-body"></div>`;
  el.querySelector('.ticket-head span').textContent = card.title;
  for (const [k, v] of card.fields) {
    const f = document.createElement('div');
    f.innerHTML = '<span></span><b></b>';
    f.querySelector('span').textContent = k;
    f.querySelector('b').textContent = v;
    el.querySelector('.ticket-body').appendChild(f);
  }
  return el;
}

// Welfare schemes: the official documents for a scheme (how to apply, documents needed, official links)
const SCHEME_BY_ID = Object.fromEntries(SCHEMES.map((s) => [s.id, s]));
const LINK_ICON = {
  pdf: P('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM8 13h2.5a1.5 1.5 0 0 1 0 3H9v2H8zm1 2h1.5a.5.5 0 0 0 0-1H9z'),
  portal: P('M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3z'),
  info: P('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z'),
};
function schemeCard(id, docsOnly) {
  const s = SCHEME_BY_ID[id];
  const el = document.createElement('div');
  el.className = 'doc-card';
  el.innerHTML = `<div class="doc-head">${LINK_ICON.pdf}<div><span>Official documents</span><b></b></div></div><div class="doc-body"></div>`;
  el.querySelector('.doc-head b').textContent = s.name;
  const body = el.querySelector('.doc-body');
  const sec = (title, node) => {
    const h = document.createElement('h4');
    h.textContent = title;
    body.append(h, node);
  };
  if (!docsOnly) {
    const p = document.createElement('p');
    p.textContent = s.apply;
    sec('How to apply', p);
  }
  if (s.docs.length) {
    const ul = document.createElement('ul');
    ul.className = 'doc-list';
    s.docs.forEach((d) => {
      const li = document.createElement('li');
      li.innerHTML = ICON.check;
      li.append(d);
      ul.appendChild(li);
    });
    sec('Documents you need', ul);
  }
  const links = document.createElement('div');
  links.className = 'doc-links';
  s.links.forEach((l) => {
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'doc-link ' + l.kind;
    a.innerHTML = `${LINK_ICON[l.kind] || LINK_ICON.info}<span></span><small></small>`;
    a.querySelector('span').textContent = l.label;
    a.querySelector('small').textContent = new URL(l.url).hostname.replace(/^www\./, '');
    links.appendChild(a);
  });
  sec('Official links', links);
  const foot = document.createElement('p');
  foot.className = 'doc-foot';
  foot.textContent = (s.check ? `Please confirm: ${s.check} ` : '') + `Information checked ${SCHEMES_CHECKED}. Rules can change, so always confirm on the official site.`;
  if (s.check) foot.classList.add('warn');
  body.appendChild(foot);
  return el;
}
// a list of schemes the visitor can tap to hear about
function schemeList(ids) {
  const el = document.createElement('div');
  el.className = 'scheme-list';
  ids.forEach((id) => {
    const s = SCHEME_BY_ID[id];
    const b = document.createElement('button');
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = s.name;
    b.querySelector('span').textContent = SCHEME_CATS[s.cat];
    b.onclick = () => handleInput(`Tell me about ${s.name}`, 'text');
    el.appendChild(b);
  });
  return el;
}

function addMsg(role, text, { source, gloss, label, card, scheme, schemes, docsOnly } = {}) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  const src = { text: [ICON.keyboard, 'Typed'], voice: [ICON.mic, 'Spoken'], sign: [ICON.sign, 'Signed'], board: [ICON.sign, 'Sign board'] }[source];
  const meta = role === 'bot' ? [ICON.lotus, label || 'Meera'] : src ? [src[0], label || src[1]] : null;
  el.innerHTML = `${meta ? `<div class="meta">${meta[0]}${meta[1]}</div>` : ''}<div class="body"></div>`;
  el.querySelector('.body').textContent = text;
  if (gloss?.length) {
    const gl = document.createElement('div');
    gl.className = 'gl';
    gl.textContent = gloss.map(glossLabel).join(' · ');
    el.appendChild(gl);
  }
  if (role === 'bot') {
    if (card) el.appendChild(ticketCard(card));
    if (scheme && SCHEME_BY_ID[scheme]) el.appendChild(schemeCard(scheme, docsOnly));
    if (schemes?.length) el.appendChild(schemeList(schemes.filter((id) => SCHEME_BY_ID[id])));
    const b = document.createElement('button');
    b.className = 'replay';
    b.innerHTML = `${ICON.replay}<span>Sign again</span>`;
    b.onclick = () => perform({ text, gloss }, { voice: false });
    el.appendChild(b);
  }
  $('#chat').appendChild(el);
  $('#chat').scrollTop = 1e9;
  return el;
}
function typing() {
  const el = document.createElement('div');
  el.className = 'msg bot typing';
  el.innerHTML = '<span>●</span> <span>●</span> <span>●</span>';
  $('#chat').appendChild(el);
  $('#chat').scrollTop = 1e9;
  return el;
}

async function askAI(message) {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: state.history.slice(-12), venue: state.venue }),
  });
  if (!r.ok) throw new Error('AI ' + r.status);
  return r.json();
}

async function handleInput(text, source, glosses) {
  text = text.trim();
  if (!text) return;
  await datasetReady; // (see perform)
  const v = V();
  if (state.mode === 'interpreter') {
    if (source === 'sign' || source === 'board') {
      addMsg('user', text, { source, gloss: glosses, label: `${cap(v.person)} signed` });
      setCaption('“' + text + '”');
      renderGloss(glosses || []);
      if (state.sayUser) speak(text);
    } else {
      addMsg('user', text, { source, label: `${v.staff} ${source === 'voice' ? 'said' : 'typed'}` });
      const g = textToGloss(text, 22);
      addMsg('bot', text, { gloss: g, label: `Meera signed to ${v.person}` });
      perform({ text, gloss: g }, { voice: false });
    }
    return;
  }

  addMsg('user', text, { source, gloss: glosses });
  state.history.push({ role: 'user', content: text });
  const venue = state.venue;
  let reply = bot.reply(text);
  if (!reply && state.ai && state.useAI) {
    const t = typing();
    try {
      reply = await askAI(text);
    } catch (e) {
      console.warn(e);
    }
    t.remove();
    if (venue !== state.venue) return; // the venue changed while Claude was answering
  }
  if (!reply) reply = bot.fallback(text);
  state.history.push({ role: 'assistant', content: reply.text });
  const g = sanitizeGloss(reply.gloss?.length ? reply.gloss : textToGloss(reply.text));
  addMsg('bot', reply.text, { gloss: g, card: reply.card, scheme: reply.scheme, schemes: reply.schemes, docsOnly: reply.docsOnly });
  perform({ text: reply.text, gloss: g });
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- composer ----------
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#textInput').value;
  $('#textInput').value = '';
  handleInput(v, 'text');
});

// ---------- services & quick phrases ----------
function renderServices() {
  const box = $('#services');
  box.innerHTML = '';
  V().services.forEach(([label, icon, question, style]) => {
    const b = document.createElement('button');
    b.className = 'tile' + (style ? ' ' + style : '');
    b.innerHTML = `<span class="ic">${P(icon)}</span><span>${label}</span>`;
    b.title = question;
    b.onclick = () => handleInput(question, 'text');
    box.appendChild(b);
  });
}
function renderQuick() {
  const q = $('#quick');
  q.innerHTML = '';
  if (state.mode !== 'interpreter') return;
  V().phrases.forEach((t) => {
    const b = document.createElement('button');
    b.textContent = t;
    b.onclick = () => handleInput(t, 'text');
    q.appendChild(b);
  });
}

// ---------- mode switch ----------
function setMode(mode, { announce = true } = {}) {
  state.mode = mode;
  document.querySelectorAll('.mode-switch button').forEach((x) => {
    x.classList.toggle('active', x.dataset.mode === mode);
    x.setAttribute('aria-selected', x.dataset.mode === mode);
  });
  const m = V()[mode];
  $('#modeHint').textContent = m.hint;
  $('#panelTitle').textContent = m.title || 'Interpreter';
  $('#panelSub').textContent = m.sub;
  $('#textInput').placeholder = m.placeholder;
  $('#services').hidden = mode !== 'concierge' || !$('#signCard').hidden;
  renderQuick();
  if (announce) {
    addMsg('bot', m.intro.text, { gloss: m.intro.gloss });
    perform(m.intro, { voice: false });
  }
}
document.querySelectorAll('.mode-switch button').forEach((b) => b.addEventListener('click', () => b.dataset.mode !== state.mode && setMode(b.dataset.mode)));

// ---------- stage controls ----------
$('#replayBtn').onclick = () => state.last && perform(state.last, { voice: false });
$('#speed').oninput = (e) => {
  avatar.speed = +e.target.value;
  $('#speedOut').textContent = (+e.target.value).toFixed(1) + '×';
};
$('#voiceBtn').onclick = () => {
  state.voice = !state.voice;
  $('#voiceBtn').setAttribute('aria-pressed', state.voice);
  if (!state.voice) stopSpeaking();
};

// ---------- header: clock, call staff, settings ----------
function tick() {
  const d = new Date();
  $('#clockTime').textContent = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  $('#clockDate').textContent = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  renderFlight();
}

// flight venue: route strip with progress and time to landing
function renderFlight() {
  const s = state.venue === 'flight' && bot.status?.();
  $('#flightStrip').hidden = !s;
  if (!s) return;
  const pct = Math.round(Math.min(1, Math.max(0, s.progress)) * 100);
  $('#fsFill').style.width = pct + '%';
  $('#fsPlane').style.left = pct + '%';
  $('#fsLeft').textContent = `${s.left} min to landing`;
  $('#fsArrive').textContent = `Lands ${s.arriveText}`;
}

let toastTimer;
function toast(html, ms = 4500) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
let callTimer;
$('#callStaff').onclick = () => {
  const b = $('#callStaff');
  if (b.classList.contains('sent')) return;
  const v = V();
  b.classList.add('sent');
  $('#callLabel').textContent = v.id === 'flight' ? 'Crew notified' : 'Staff notified';
  toast(`${ICON.check}<span>${v.callToast}</span>`);
  addMsg('bot', v.callReply.text, { gloss: v.callReply.gloss });
  perform(v.callReply);
  callTimer = setTimeout(resetCallButton, 30000);
};
function resetCallButton() {
  clearTimeout(callTimer);
  $('#callStaff').classList.remove('sent');
  $('#callLabel').textContent = V().callStaff;
}

$('#settingsBtn').onclick = () => {
  $('#venueSel').value = state.venue;
  $('#settings').showModal();
};
$('#useAI').onchange = (e) => (state.useAI = e.target.checked);
$('#sayUser').checked = state.sayUser;
$('#sayUser').onchange = (e) => (state.sayUser = e.target.checked);
$('#venueSel').onchange = (e) => setVenue(e.target.value);
$('#venueSel').disabled = !!lockedVenue;
$('#reduceMotion').checked = store.get('reduceMotion') === '1';
document.documentElement.classList.toggle('reduce-motion', $('#reduceMotion').checked);
$('#reduceMotion').onchange = (e) => {
  document.documentElement.classList.toggle('reduce-motion', e.target.checked);
  store.set('reduceMotion', e.target.checked ? '1' : '0');
};

// ---------- microphone ----------
const listener = createListener({
  lang: 'en-IN',
  onInterim: (t) => ($('#textInput').value = t),
  onFinal: (t) => {
    $('#textInput').value = '';
    handleInput(t, 'voice');
  },
  onState: (on, err) => {
    $('#micBtn').classList.toggle('listening', on);
    if (err === 'not-allowed') addMsg('bot', 'Microphone permission was blocked. Please allow the microphone in your browser settings.');
  },
});
$('#micBtn').onclick = () => {
  if (!speechSupported) return addMsg('bot', 'Voice input needs Chrome or Edge. You can still type or sign.');
  if (listener?.active) listener.stop();
  else {
    stopSpeaking();
    listener.start($('#lang').value);
  }
};

// ---------- sign input ----------
let recognizer = null;
const REC_HELP = {
  words:
    'Try: wave = HELLO · flat hand at chin then down = THANK YOU · fist nodding = YES · Y-hand at ear = CALL · flat-O at mouth = EAT · two flat hands = ROOM · thumb-up on palm = HELP · point at camera or yourself = YOU/ME · 🤟 = LOVE. Lower your hands to finish.',
  letters: 'Hold each ASL letter still for about half a second (J and Z not supported). Lower your hands to finish a word.',
  numbers: 'Hold digits 0–9 still for about half a second. Lower your hands to finish the number.',
};
$('#recHelp').textContent = REC_HELP.words;

function renderBuffer() {
  const box = $('#glossBuffer');
  box.innerHTML = '';
  // live preview of the full sentence the signs mean (HELLO BATHROOM WHERE -> "Hello! Where is the restroom?")
  $('#bufMeaning').hidden = !state.buffer.length;
  if (state.buffer.length) $('#bufMeaning b').textContent = glossToEnglish(state.buffer.map((b) => b.tok), V().templates);
  if (!state.buffer.length) return (box.innerHTML = '<span class="placeholder">Your signs appear here…</span>');
  state.buffer.forEach((b) => {
    const s = document.createElement('span');
    s.className = 'bchip' + (b.kind !== 'sign' ? ' spell' : '');
    s.textContent = glossLabel(b.tok);
    box.appendChild(s);
  });
}
function pushGloss(tok) {
  state.buffer.push({ tok, kind: 'sign' });
  renderBuffer();
}
function pushChar(ch) {
  const kind = /\d/.test(ch) ? 'num' : 'spell';
  const last = state.buffer[state.buffer.length - 1];
  if (last && last.kind === kind && !last.closed) last.tok += ch;
  else state.buffer.push({ tok: kind === 'num' ? ch : 'FS:' + ch, kind });
  renderBuffer();
}
function closeWord() {
  const last = state.buffer[state.buffer.length - 1];
  if (last) last.closed = true;
}

async function translateBuffer() {
  if (!state.buffer.length) return;
  const gl = state.buffer.map((b) => b.tok);
  state.buffer = [];
  renderBuffer();
  let sentence = glossToEnglish(gl, V().templates);
  if (state.ai && state.useAI && gl.length > 1) {
    try {
      const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gloss: gl, venue: state.venue }) });
      if (r.ok) sentence = (await r.json()).text || sentence;
    } catch {}
  }
  handleInput(sentence, 'sign', gl);
}

$('#bufSend').onclick = translateBuffer;
$('#bufClear').onclick = () => {
  state.buffer = [];
  renderBuffer();
};
$('#bufBack').onclick = () => {
  const last = state.buffer[state.buffer.length - 1];
  if (!last) return;
  if (last.kind !== 'sign' && last.tok.replace('FS:', '').length > 1) last.tok = last.tok.slice(0, -1);
  else state.buffer.pop();
  renderBuffer();
};

async function openSign() {
  $('#signCard').hidden = false;
  $('#services').hidden = true; // make room for the camera and the conversation
  $('#signBtn').classList.add('active');
  $('#signBtn').setAttribute('aria-pressed', 'true');
  if (!$('#camPane').hidden) await startCamera();
}
function closeSign() {
  $('#signCard').hidden = true;
  $('#services').hidden = state.mode !== 'concierge';
  $('#signBtn').classList.remove('active');
  $('#signBtn').setAttribute('aria-pressed', 'false');
  recognizer?.stop();
}
$('#signBtn').onclick = () => ($('#signCard').hidden ? openSign() : closeSign());
$('#signClose').onclick = closeSign;

async function startCamera() {
  $('#camLoading').hidden = false;
  $('#camLoading').textContent = 'Starting camera and hand tracking…';
  try {
    if (!recognizer) {
      const { SignRecognizer } = await import('./recognizer.js');
      recognizer = new SignRecognizer($('#cam'), $('#camOverlay'), {
        onFrame: ({ shape, zone, progress, pending }) => {
          $('#handShape').textContent = pending ? `${shape} → ${glossLabel(pending)}` : shape;
          $('#handZone').textContent = zone && zone !== 'neutral' ? zone : '';
          $('#holdBar').style.width = (progress || 0) * 100 + '%';
        },
        onGloss: (g) => pushGloss(g),
        onLetter: (ch) => pushChar(ch),
        onIdle: () => {
          closeWord();
          if ($('#autoSend').checked && state.buffer.length && state.recMode === 'words') translateBuffer();
        },
      });
      recognizer.setMode(state.recMode);
    }
    if (await recognizer.start()) $('#camLoading').hidden = true;
  } catch (e) {
    console.error(e);
    $('#camLoading').textContent = e?.name === 'NotAllowedError' ? 'Camera permission denied. Allow the camera, or use the Sign board tab.' : 'Could not start hand tracking. Check your internet connection, or use the Sign board tab.';
  }
}

document.querySelectorAll('.rec-tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.rec-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    state.recMode = b.dataset.rec;
    closeWord();
    recognizer?.setMode(state.recMode);
    $('#recHelp').textContent = REC_HELP[state.recMode];
  })
);
document.querySelectorAll('.sign-tabs button[data-src]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.sign-tabs button[data-src]').forEach((x) => x.classList.toggle('active', x === b));
    const cam = b.dataset.src === 'camera';
    $('#camPane').hidden = !cam;
    $('#boardPane').hidden = cam;
    if (cam) startCamera();
    else recognizer?.stop();
  })
);

// sign board: tap signs to compose a sentence (also previews the sign on the avatar)
function renderBoard() {
  const pane = $('#boardPane');
  pane.innerHTML = '';
  Object.entries(V().board).forEach(([cat, toks]) => {
    const h = document.createElement('div');
    h.className = 'cat';
    h.textContent = cat;
    pane.appendChild(h);
    toks.forEach((t) => {
      const b = document.createElement('button');
      b.textContent = glossLabel(t);
      b.onclick = () => {
        pushGloss(t);
        loadSigns([t]).then(() => avatar.play([t])); // dataset signs are fetched on first use
      };
      pane.appendChild(b);
    });
  });
}

// ---------- venue ----------
function applyVenueText() {
  const v = V();
  document.body.dataset.venue = v.id;
  $('#brandSub').textContent = v.brandSub;
  $('#stageRole').textContent = v.role;
  $('#newGuest span').textContent = v.newGuest;
  $('#newGuest').title = `Clear this conversation for the next ${v.person}`;
  $('#callStaff').title = v.id === 'flight' ? 'Call a cabin crew member to this seat' : 'Call a staff member to the front desk';
  document.querySelectorAll('.mode-switch button').forEach((b) => (b.querySelector('span').textContent = v.tabs[b.dataset.mode]));
  document.querySelectorAll('[data-status]').forEach((el) => (el.textContent = v.status[el.dataset.status]));
  $('#welcomeTitle').textContent = v.welcome.title;
  $('#welcomeLead').innerHTML = v.welcome.lead;
  $('#welcomeFoot').textContent = v.welcome.foot;
  document.querySelectorAll('#venuePick button').forEach((b) => b.setAttribute('aria-checked', b.dataset.venue === v.id));
  document.title = `Sanket · ${v.id === 'flight' ? 'Sign Language Cabin Assistant' : 'Sign Language Concierge'}`;
  avatar.setVenue?.(v.id);
  resetCallButton();
  renderServices();
  renderBoard();
}
function setVenue(id) {
  if (!VENUES[id] || id === state.venue) return;
  state.venue = id;
  if (!lockedVenue) store.set('venue', id);
  applyVenueText();
  resetConversation();
  if (state.started) greet();
}
document.querySelectorAll('#venuePick button').forEach((b) => b.addEventListener('click', () => setVenue(b.dataset.venue)));
$('#venuePick').hidden = !!lockedVenue;

// ---------- welcome, new guest, kiosk privacy ----------
function resetConversation() {
  stopSpeaking();
  listener?.active && listener.stop();
  closeSign();
  state.history = [];
  state.buffer = [];
  state.last = null;
  renderBuffer();
  bot = V().createBot();
  $('#chat').innerHTML = '';
  $('#glossStrip').innerHTML = '';
  setCaption(V().greeting.text);
  $('#textInput').value = '';
  setMode('concierge', { announce: false });
  renderFlight();
  avatar.stop();
}
function greet() {
  const g = V().greeting;
  addMsg('bot', g.text, { gloss: g.gloss });
  perform(g);
}
function begin() {
  if (state.started) return;
  state.started = true;
  $('#welcome').classList.add('hide');
  greet();
  lastActive = Date.now();
}
function showWelcome() {
  resetConversation();
  state.started = false;
  $('#welcome').classList.remove('hide');
}
$('#beginBtn').onclick = begin;
$('#welcome').addEventListener('click', (e) => e.target === $('#welcome') && begin());
$('#newGuest').onclick = () => {
  resetConversation();
  greet();
};

// Kiosk privacy: after 3 minutes without activity, clear everything and return to the welcome screen,
// so the next guest never sees the previous guest's name, room or booking.
const IDLE_MS = 3 * 60 * 1000;
let lastActive = Date.now();
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => (lastActive = Date.now()), { passive: true }));
setInterval(() => {
  if (!state.started || !$('#kioskReset').checked || avatar.busy || listener?.active) return;
  if (Date.now() - lastActive > IDLE_MS) showWelcome();
}, 5000);

// ---------- boot ----------
applyVenueText();
setCaption(V().greeting.text);
setMode('concierge', { announce: false });
tick();
setInterval(tick, 15000);
fetch('/api/health')
  .then((r) => r.json())
  .then((j) => {
    state.ai = !!j.ai;
    const chip = $('#aiStatus');
    chip.querySelector('.label').textContent = j.ai ? 'Claude AI · on' : 'Offline brain';
    chip.classList.toggle('on', j.ai);
    chip.title = j.ai ? 'Questions outside the knowledge base are answered by Claude' : 'Answers come from the offline knowledge base. Set ANTHROPIC_API_KEY on the server to enable Claude.';
  })
  .catch(() => {});
// ?start skips the welcome screen (used by tests and kiosk launchers)
if (params.has('start')) begin();

window.aria = { avatar, perform, get bot() { return bot; }, begin, showWelcome, setVenue, state };
