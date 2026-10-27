// Static server for the Sign Concierge + optional Claude endpoints.
// Run: npm install && npm start   (set ANTHROPIC_API_KEY to enable AI answers)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAQ } from './public/js/faq.js';
import { FLIGHT_FACTS, FLIGHT_FAQ } from './public/js/flight-faq.js';
import { SCHEMES_FACTS, SCHEMES_CHECKED } from './public/js/schemes-data.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 5173;
const MODEL = 'claude-opus-5';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' };

let client = null;
try {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const c = new Anthropic();
  if (c.apiKey || c.authToken || process.env.ANTHROPIC_API_KEY) client = c;
} catch {
  // SDK not installed or no credentials: the app runs on its offline brain.
}

// Keep this list in sync with SIGNS in public/js/signs.js
const AUTHORED = 'HELLO BYE WELCOME THANK-YOU PLEASE SORRY YES NO ME YOU WANT NEED HAVE ROOM RESERVE NIGHT DAY MORNING NOW TOMORROW YESTERDAY TIME EAT DRINK WATER KEY MONEY PAY FREE SLEEP BATHROOM CLEAN HELP WHERE WHAT HOW WHEN WHY GOOD FINE WAIT PHONE CALL CAR TAXI FLOOR UP DOWN LEFT RIGHT NUMBER NAME FINISH CHECK IN OUT STAY LOVE ILY HAPPY DEAF SIGN UNDERSTAND AGAIN SEE GIVE MORE CAN NOT SWIM EXERCISE DOCTOR EMERGENCY LATE ELEVATOR HOTEL PARKING NAMASTE';
// plus the signs converted from the WLASL dataset (tools/wlasl), if they have been generated
let DATASET = [];
try {
  DATASET = JSON.parse(await readFile(join(ROOT, 'signs', 'wlasl', 'index.json'), 'utf8'));
} catch {}
const VOCAB = [...new Set([...AUTHORED.split(' '), ...DATASET])].join(' ');

const HOTEL_FACTS = `Hotel: Kesar Palace, a 5-star heritage hotel at 12 MI Road, Jaipur (India). Currency ₹.
Rooms per night: Standard ₹4,500 (queen, max 2), Deluxe ₹6,800 (king, city view, max 3), Executive Suite ₹12,000 (living room, bathtub, max 4). Breakfast and Wi-Fi included; 12% tax extra.
Check-in 2 PM (photo ID needed), checkout 11 AM; free late checkout to 1 PM if available; early check-in from 10 AM for ₹1,500.
Wi-Fi network KesarPalace_Guest, password KESAR24. Breakfast 7–10:30 AM at Saffron (ground floor); lunch 12:30–3 PM; dinner 7–11 PM; room service 24h via room tablet or SMS 98100 00000.
Rooftop pool 8th floor 6 AM–9 PM. Gym 2nd floor 24h. Spa 3rd floor 10 AM–8 PM. Skyline lounge 8th floor 5 PM–midnight.
Airport taxi ₹1,200 (~40 min). Free basement parking, valet available. Doctor on call 24h. ATM in lobby.
Deaf-friendly rooms: flashing fire alarm and doorbell, vibrating alarm, captioned TV; video sign-language interpreter 24h. Elevators are to the left of the front desk.
Free cancellation up to 24h before check-in. Pets not allowed (service animals welcome). Non-smoking rooms.`;

const RULES = (unknown, emergency) => `Reply rules:
- Warm, clear, short: at most 2–3 plain sentences. Avoid idioms; concrete facts first.
- ${unknown}
- ${emergency}
- Respond ONLY with a JSON object: {"text": "<English reply>", "gloss": ["TOKEN", ...]}.
- "gloss" is the ASL-style sign sequence (topic-comment order, no articles), max 12 tokens. Each token must be one of: ${VOCAB}; or a number written as digits (e.g. "305"); or "FS:WORD" to fingerspell a short word or name (use sparingly, max 2).`;

// one system prompt per venue (see public/js/venues.js)
const SYSTEMS = {
  hotel: `You are Meera, the signing virtual concierge at the front desk of Kesar Palace, Jaipur. Your guests are often Deaf or hard of hearing; your replies are shown as captions and performed by a 3D avatar in sign language.

${HOTEL_FACTS}

Hotel FAQ (authoritative; use these facts when relevant):
${FAQ.map((e) => `- ${e.q[0]}: ${e.a}`).join('\n')}

${RULES('If you do not know a hotel-specific fact, say a staff member at the desk will confirm, rather than inventing details.', 'For emergencies, tell them help is coming and to press the SOS button in the room.')}`,
  flight: `You are Meera, a signing virtual cabin assistant on a Kesar Air flight, shown on the seatback screen and the crew tablet. Your passengers are often Deaf or hard of hearing; your replies are shown as captions and performed by a 3D avatar in sign language.

${FLIGHT_FACTS}

Flight FAQ (authoritative; use these facts when relevant):
${FLIGHT_FAQ.map((e) => `- ${e.q[0]}: ${e.a}`).join('\n')}

${RULES('If you do not know a flight-specific fact, say a crew member will confirm, rather than inventing details.', 'For emergencies, tell them to stay calm, that the crew are coming, and to press the call button above their seat.')}`,
  schemes: `You are Meera, a signing guide at a welfare help desk who explains Indian government schemes for Deaf, hard-of-hearing and speech-impaired people. You are an independent guide, not an official government service. Your replies are shown as captions and performed by a 3D avatar in sign language.

Schemes you know (researched ${SCHEMES_CHECKED}; amounts and rules can change):
${SCHEMES_FACTS}

${RULES('Never invent amounts, dates, eligibility or links. If a fact is not listed above, or marked UNVERIFIED, say the person should confirm on the official portal or at the district social welfare office. Mention that most schemes need a UDID card or disability certificate (40% or more).', 'For emergencies, tell them to call or text 112, India’s emergency number, and that staff here will help.')}`,
};
const PEOPLE = { hotel: 'a Deaf hotel guest into one natural, polite English sentence written in the first person (the guest speaking to the front desk)', flight: 'a Deaf airline passenger into one natural, polite English sentence written in the first person (the passenger speaking to the cabin crew)', schemes: 'a Deaf visitor at a government welfare help desk into one natural, polite English sentence written in the first person (the visitor asking about schemes)' };
const venueOf = (v) => (v in SYSTEMS ? v : 'hotel');

function parseReply(raw) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (j.text) return { text: String(j.text), gloss: Array.isArray(j.gloss) ? j.gloss.map(String) : [] };
    } catch {}
  }
  return { text: raw.trim(), gloss: [] };
}

async function claude(system, messages, maxTokens = 1024) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // cached: the system prompt (with the FAQ) is identical on every request
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  if (res.stop_reason === 'refusal') return null;
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function body(req) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (s.length > 50_000) throw new Error('too large');
  }
  return JSON.parse(s || '{}');
}

function send(res, code, data, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  // API replies are objects; static files (including .json) arrive as Buffers and go out as-is
  res.end(type === 'application/json' && !Buffer.isBuffer(data) ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ai: !!client, model: client ? MODEL : null });

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      if (!client) return send(res, 503, { error: 'AI not configured' });
      const { message, history = [], venue } = await body(req);
      // history already ends with the current user message; keep valid alternation
      const msgs = history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: String(message).slice(0, 2000) });
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      const merged = msgs.reduce((acc, m) => {
        if (acc.length && acc[acc.length - 1].role === m.role) acc[acc.length - 1].content += '\n' + m.content;
        else acc.push({ ...m });
        return acc;
      }, []);
      const raw = await claude(SYSTEMS[venueOf(venue)], merged);
      if (!raw)
        return send(res, 200, venueOf(venue) === 'flight'
          ? { text: 'Sorry, I cannot help with that. A crew member will be happy to assist you.', gloss: ['SORRY', 'STAFF', 'HELP', 'YOU'] }
          : { text: 'Sorry, I cannot help with that. A staff member at the desk will be happy to assist you.', gloss: ['SORRY', 'HOTEL', 'HELP', 'YOU'] });
      return send(res, 200, parseReply(raw));
    }

    if (url.pathname === '/api/translate' && req.method === 'POST') {
      if (!client) return send(res, 503, { error: 'AI not configured' });
      const { gloss = [], venue } = await body(req);
      const raw = await claude(
        `You translate ASL-style sign glosses from ${PEOPLE[venueOf(venue)]}. FS:WORD means a fingerspelled word or name; digits are numbers. Output only the sentence.`,
        [{ role: 'user', content: gloss.slice(0, 40).join(' ') }],
        256
      );
      return send(res, 200, { text: (raw || '').trim().replace(/^"|"$/g, '') });
    }

    // Hindi captions: translate one of Meera's English replies
    if (url.pathname === '/api/hindi' && req.method === 'POST') {
      if (!client) return send(res, 503, { error: 'AI not configured' });
      const { text = '', speaker = 'meera' } = await body(req);
      const who = speaker === 'guest'
        ? 'The text is what a guest said; keep their meaning, gender-neutral where possible.'
        : 'The speaker is Meera, a woman: always use feminine first-person forms (करती हूँ, सकती हूँ, करूँगी).';
      const raw = await claude(
        `Translate the English text into simple, natural Hindi in Devanagari script, as spoken politely to a guest. ${who} Translate "Deaf" as "बधिर" and "hard of hearing" as "कम सुनने वाले" (never "सुनने वाले", which means hearing people). Keep names, booking IDs, room numbers, codes, Wi-Fi passwords, website addresses, amounts and times exactly as they are. Output only the Hindi translation.`,
        [{ role: 'user', content: String(text).slice(0, 3000) }],
        2048
      );
      return send(res, 200, { text: (raw || '').trim() });
    }

    // static files
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
    const data = await readFile(file);
    send(res, 200, data, TYPES[extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, 'Not found', 'text/plain');
    console.error(e);
    send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Sanket · Sign Language Concierge → http://localhost:${PORT}`);
  console.log(client ? `  Claude AI enabled (${MODEL})` : '  Offline brain only. Set ANTHROPIC_API_KEY and run npm install to enable Claude.');
});
