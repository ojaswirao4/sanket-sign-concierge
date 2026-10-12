import { Avatar } from './avatar.js';
import { MeeraAvatar } from './meera.js';
import { hasSign, loadSigns, textToGloss, glossLabel } from './signs.js';
import { createBot, glossToEnglish } from './bot.js';
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
// Service tiles: [label, icon path, question sent to Meera, style]
const SERVICES = [
  ['Check-in', 'M12.6 10a4.5 4.5 0 1 0 0 4h2.9v2.5h2.5V14H21v-4zM8.5 14.2a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4z', 'What time is check-in?'],
  ['Book a room', 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14zM7 11h5v5H7z', 'I want to book a room'],
  ['My room', 'M19 19V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14H3v2h18v-2zm-4-6h-2v-2h2z', "What's my room number?"],
  ['Wi-Fi', 'M12 18.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM2.2 8.6l1.9 1.9a11.2 11.2 0 0 1 15.8 0l1.9-1.9a13.9 13.9 0 0 0-19.6 0zm3.9 3.9L8 14.4a5.6 5.6 0 0 1 8 0l1.9-1.9a8.3 8.3 0 0 0-11.8 0z', 'What is the Wi-Fi password?'],
  ['Dining', 'M8.1 13.3 11 10.5 3.9 3.4a4 4 0 0 0 0 5.7zm6.8-1.8c1.5.7 3.7.2 5.3-1.4 1.9-1.9 2.3-4.7.8-6.2-1.5-1.5-4.3-1.1-6.2.8-1.6 1.6-2.1 3.8-1.4 5.3L3.7 19.7l1.4 1.4 6.9-6.9 6.9 6.9 1.4-1.4-6.9-6.9z', 'When is breakfast?', 'warm'],
  ['Room service', 'M2 17h20v2H2zm11.8-9.8A2 2 0 0 0 14 6a2 2 0 1 0-4 0c0 .4.1.8.3 1.2A8 8 0 0 0 4 15h16a8 8 0 0 0-6.2-7.8z', 'I would like room service', 'warm'],
  ['Taxi', 'M18.9 6A1.5 1.5 0 0 0 17.5 5h-11A1.5 1.5 0 0 0 5.1 6L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 11l1.5-4.5h11L19 11z', 'Please call a taxi'],
  ['Housekeeping', 'M19 9l1.3-2.7L23 5l-2.7-1.3L19 1l-1.3 2.7L15 5l2.7 1.3zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.3 2.7L15 19l2.7 1.3L19 23l1.3-2.7L23 19l-2.7-1.3z', 'I need extra towels'],
  ['Accessibility', 'M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18z', 'Do you have a Deaf-friendly room?'],
  ['Emergency', 'M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z', 'Emergency! I need help', 'alert'],
];
const INTERPRETER_PHRASES = ['Welcome! May I see your ID?', 'Your room is ready. Room 305.', 'Breakfast is at 7 AM.', 'Please wait a moment.', 'Do you need help with luggage?', 'Thank you, enjoy your stay!'];

const state = {
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

// Meera (our own avatar) by default; ?avatar=rocketbox / ?avatar=classic bring back the earlier ones
const which = new URLSearchParams(location.search).get('avatar');
const AvatarClass = which === 'classic' ? Avatar : which === 'rocketbox' ? (await import('./human.js')).HumanAvatar : MeeraAvatar;
const avatar = new AvatarClass($('#avatar'));
let bot = createBot();
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
function highlight(gi, frame) {
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

function perform({ text, gloss }, { voice = state.voice } = {}) {
  const g = sanitizeGloss(gloss && gloss.length ? gloss : textToGloss(text));
  state.last = { text, gloss: g };
  $('#captionText').textContent = text;
  renderGloss(g);
  const last = state.last;
  loadSigns(g).then(() => {
    if (state.last !== last) return; // a newer reply started while signs were loading
    avatar.play(g, { onGloss: highlight, onDone: () => document.querySelectorAll('.gtok').forEach((e) => e.classList.replace('now', 'done')) });
  });
  if (voice) speak(text, { onStart: () => avatar.setTalking(true), onEnd: () => avatar.setTalking(false) });
}

// ---------- chat ----------
// A confirmed booking also gets a ticket card with the key details.
function bookingTicket(text) {
  const id = text.match(/Booking ID (KSR\d+)/)?.[1];
  const room = text.match(/room number is (\d+)/i)?.[1];
  if (!id || !room) return null;
  const floor = text.match(/on the (\w+) floor/i)?.[1] || '';
  const el = document.createElement('div');
  el.className = 'ticket';
  el.innerHTML = `<div class="ticket-head">${ICON.ticket}Booking confirmed</div><div class="ticket-body"><div><span>Booking ID</span><b></b></div><div><span>Room</span><b></b></div><div><span>Floor</span><b></b></div></div>`;
  const b = el.querySelectorAll('b');
  b[0].textContent = id;
  b[1].textContent = room;
  b[2].textContent = floor.replace(/^\w/, (c) => c.toUpperCase());
  return el;
}

function addMsg(role, text, { source, gloss, label } = {}) {
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
    const ticket = bookingTicket(text);
    if (ticket) el.appendChild(ticket);
    const b = document.createElement('button');
    b.className = 'replay';
    b.innerHTML = `${ICON.replay}<span>Sign again</span>`;
    b.querySelector('svg').style.cssText = 'width:13px;height:13px';
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
    body: JSON.stringify({ message, history: state.history.slice(-12) }),
  });
  if (!r.ok) throw new Error('AI ' + r.status);
  return r.json();
}

async function handleInput(text, source, glosses) {
  text = text.trim();
  if (!text) return;
  if (state.mode === 'interpreter') {
    if (source === 'sign' || source === 'board') {
      addMsg('user', text, { source, gloss: glosses, label: 'Guest signed' });
      $('#captionText').textContent = '“' + text + '”';
      renderGloss(glosses || []);
      if (state.sayUser) speak(text);
    } else {
      addMsg('user', text, { source, label: source === 'voice' ? 'Staff said' : 'Staff typed' });
      const g = textToGloss(text, 22);
      addMsg('bot', text, { gloss: g, label: 'Meera signed to guest' });
      perform({ text, gloss: g }, { voice: false });
    }
    return;
  }

  addMsg('user', text, { source, gloss: glosses });
  state.history.push({ role: 'user', content: text });
  let reply = bot.reply(text);
  if (!reply && state.ai && state.useAI) {
    const t = typing();
    try {
      reply = await askAI(text);
    } catch (e) {
      console.warn(e);
    }
    t.remove();
  }
  if (!reply) reply = bot.fallback(text);
  state.history.push({ role: 'assistant', content: reply.text });
  const g = sanitizeGloss(reply.gloss?.length ? reply.gloss : textToGloss(reply.text));
  addMsg('bot', reply.text, { gloss: g });
  perform({ text: reply.text, gloss: g });
}

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
  SERVICES.forEach(([label, icon, question, style]) => {
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
  INTERPRETER_PHRASES.forEach((t) => {
    const b = document.createElement('button');
    b.textContent = t;
    b.onclick = () => handleInput(t, 'text');
    q.appendChild(b);
  });
}

// ---------- mode switch ----------
const MODE_TEXT = {
  concierge: {
    hint: 'Ask me anything · Type, speak, or sign',
    title: 'How may we help you?',
    sub: 'Tap a service, or type, speak or sign your question.',
    placeholder: 'Type your question…',
    intro: { text: 'Concierge mode. Ask me anything about the hotel.', gloss: ['HELLO', 'HELP', 'YOU', 'WHAT'] },
  },
  interpreter: {
    hint: 'Staff speak or type · Guest signs back',
    title: 'Interpreter',
    sub: 'Staff: speak or type and Meera signs it. Guest: sign to the camera and it is shown and spoken.',
    placeholder: 'Staff: type what to sign to the guest…',
    intro: { text: 'Interpreter mode. I will sign what the staff says, and voice what you sign.', gloss: ['ME', 'SIGN', 'HELP', 'YOU'] },
  },
};
function setMode(mode, { announce = true } = {}) {
  state.mode = mode;
  document.querySelectorAll('.mode-switch button').forEach((x) => {
    x.classList.toggle('active', x.dataset.mode === mode);
    x.setAttribute('aria-selected', x.dataset.mode === mode);
  });
  const m = MODE_TEXT[mode];
  $('#modeHint').textContent = m.hint;
  $('#panelTitle').textContent = m.title;
  $('#panelSub').textContent = m.sub;
  $('#textInput').placeholder = m.placeholder;
  $('#services').hidden = mode !== 'concierge';
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
}
tick();
setInterval(tick, 15000);

let toastTimer;
function toast(html, ms = 4500) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
$('#callStaff').onclick = () => {
  const b = $('#callStaff');
  if (b.classList.contains('sent')) return;
  b.classList.add('sent');
  b.querySelector('span').textContent = 'Staff notified';
  toast(`${ICON.check}<span>A front desk colleague has been notified and is on the way.</span>`);
  const reply = { text: 'I have called a colleague to the front desk. Someone will be with you in a moment.', gloss: ['ME', 'CALL', 'HELP', 'NOW', 'PLEASE', 'WAIT'] };
  addMsg('bot', reply.text, { gloss: reply.gloss });
  perform(reply);
  setTimeout(() => {
    b.classList.remove('sent');
    b.querySelector('span').textContent = 'Call staff';
  }, 30000);
};

$('#settingsBtn').onclick = () => $('#settings').showModal();
$('#useAI').onchange = (e) => (state.useAI = e.target.checked);
$('#sayUser').checked = state.sayUser;
$('#sayUser').onchange = (e) => (state.sayUser = e.target.checked);

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
  let sentence = glossToEnglish(gl);
  if (state.ai && state.useAI && gl.length > 1) {
    try {
      const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gloss: gl }) });
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
  if (!$('#camPane').hidden) await startCamera();
}
function closeSign() {
  $('#signCard').hidden = true;
  $('#services').hidden = state.mode !== 'concierge';
  $('#signBtn').classList.remove('active');
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
const BOARD = {
  Greetings: ['NAMASTE', 'HELLO', 'THANK-YOU', 'PLEASE', 'SORRY', 'YES', 'NO', 'GOOD', 'BYE'],
  Questions: ['ME', 'YOU', 'WHAT', 'WHERE', 'WHEN', 'HOW', 'WANT', 'NEED', 'HELP', 'CAN'],
  Hotel: ['ROOM', 'RESERVE', 'KEY', 'CHECK', 'IN', 'OUT', 'NIGHT', 'TOMORROW', 'TIME', 'NUMBER', 'NAME', 'FLOOR', 'ELEVATOR', 'MONEY', 'PAY', 'FS:WIFI'],
  Services: ['EAT', 'DRINK', 'WATER', 'CLEAN', 'MORE', 'BATHROOM', 'SLEEP', 'SWIM', 'EXERCISE', 'TAXI', 'PARKING', 'CALL', 'DOCTOR', 'EMERGENCY'],
};
Object.entries(BOARD).forEach(([cat, toks]) => {
  const h = document.createElement('div');
  h.className = 'cat';
  h.textContent = cat;
  $('#boardPane').appendChild(h);
  toks.forEach((t) => {
    const b = document.createElement('button');
    b.textContent = glossLabel(t);
    b.onclick = () => {
      pushGloss(t);
      avatar.play([t]);
    };
    $('#boardPane').appendChild(b);
  });
});

// ---------- welcome, new guest, kiosk privacy ----------
const GREETING = { text: 'Namaste! Welcome to Kesar Palace. I am Meera. How may I help you today?', gloss: ['NAMASTE', 'WELCOME', 'HOTEL', 'ME', 'FS:MEERA', 'HELP', 'YOU', 'WHAT'] };

function resetConversation() {
  stopSpeaking();
  listener?.active && listener.stop();
  closeSign();
  state.history = [];
  state.buffer = [];
  state.last = null;
  renderBuffer();
  bot = createBot();
  $('#chat').innerHTML = '';
  $('#glossStrip').innerHTML = '';
  $('#captionText').textContent = GREETING.text;
  $('#textInput').value = '';
  if (state.mode !== 'concierge') setMode('concierge', { announce: false });
  avatar.stop();
}
function greet() {
  addMsg('bot', GREETING.text, { gloss: GREETING.gloss });
  perform(GREETING);
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
renderServices();
setMode('concierge', { announce: false });
fetch('/api/health')
  .then((r) => r.json())
  .then((j) => {
    state.ai = !!j.ai;
    const chip = $('#aiStatus');
    chip.querySelector('.label').textContent = j.ai ? 'Claude AI · on' : 'Offline brain';
    chip.classList.toggle('on', j.ai);
    chip.title = j.ai ? 'Questions outside the hotel knowledge base are answered by Claude' : 'Answers come from the hotel knowledge base. Set ANTHROPIC_API_KEY on the server to enable Claude.';
  })
  .catch(() => {});
// ?start skips the welcome screen (used by tests and kiosk launchers)
if (new URLSearchParams(location.search).has('start')) begin();

window.aria = { avatar, perform, get bot() { return bot; }, begin, showWelcome, state };
