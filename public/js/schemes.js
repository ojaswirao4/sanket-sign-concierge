// Offline welfare-schemes brain (third venue): answers about each scheme, the documents it needs and how
// to apply, lists schemes by topic, and a short "find my schemes" flow. Same interface as createBot().
import { R, createFaqMatcher } from './bot.js';
import { SCHEMES, SCHEME_CATS, SCHEMES_CHECKED } from './schemes-data.js';

const BY_ID = Object.fromEntries(SCHEMES.map((s) => [s.id, s]));
const faq = createFaqMatcher(SCHEMES.map((s) => ({ id: s.id, q: [...s.q, s.name], k: s.k })));
// a scheme named by one of its keyword phrases (not a loose word-overlap guess)
// (a full scheme name, e.g. from "Tell me about <name>" on a list button, always wins)
const BY_NAME = [...SCHEMES].sort((a, b) => b.name.length - a.name.length);
const named = (t) => {
  const low = String(t).toLowerCase();
  const full = BY_NAME.find((s) => low.includes(s.name.toLowerCase()));
  if (full) return full;
  const hit = faq.keyword(t);
  return hit ? BY_ID[hit.id] : null;
};
const findScheme = (t) => {
  const full = BY_NAME.find((s) => String(t).toLowerCase().includes(s.name.toLowerCase()));
  if (full) return full;
  const hit = faq.keyword(t) || (faq.best(t)?.score >= 0.45 ? faq.best(t).e : null);
  return hit ? BY_ID[hit.id] : null;
};

// topics people ask about as a group
const TOPICS = [
  ['education', /\b(student|students|study|studies|school|college|education|exam|course)\b/],
  ['money', /\b(money|financial|pension|monthly|cash|allowance)\b/],
  ['work', /\b(job|jobs|work|employment|career|business|skill)\b/],
  ['hearing', /\b(hearing aids?|implant|machine|device|aids?)\b/],
  ['travel', /\b(travel|transport|train|bus|drive|driving)\b/],
];
const CAT_IDS = (cat) => SCHEMES.filter((s) => s.cat === cat || (cat === 'education' && s.id === 'education-rights')).map((s) => s.id);
const nameList = (ids) => ids.map((id) => BY_ID[id].name).join('; ');

function schemeReply(s) {
  const unverified = s.check ? ' Please confirm the details on the official page.' : '';
  return {
    text: `${s.name}. Who can get it: ${s.who} What you get: ${s.benefit}${unverified} I am showing the official documents and links on the screen.`,
    gloss: s.g.split(' '),
    scheme: s.id,
  };
}

export function createSchemesBot() {
  const ctx = { last: null, flow: null, ans: {} };

  function flowStep() {
    const a = ctx.ans;
    if (a.pct === undefined) {
      ctx.flow = 'pct';
      return R('Let us find the schemes for you. First: do you have a disability certificate or UDID card? If yes, what percentage is written on it?', 'YOU HAVE DEAF CARD PERCENT WHAT');
    }
    if (a.age === undefined) {
      ctx.flow = 'age';
      return R('How old are you? (If you are asking for a child, tell me the child’s age.)', 'YOU AGE WHAT');
    }
    if (a.role === undefined) {
      ctx.flow = 'role';
      return R('Are you studying, working, looking for a job, or none of these?', 'YOU STUDY WORK FIND WORK WHAT');
    }
    if (a.bpl === undefined) {
      ctx.flow = 'bpl';
      return R('Last question: does your family have a BPL (below poverty line) card?', 'YOU FAMILY HAVE FS:BPL CARD');
    }
    ctx.flow = null;
    return results();
  }

  function results() {
    const { pct, age, role, bpl } = ctx.ans;
    const bench = pct !== null && pct >= 40;
    const ids = [];
    if (pct === null) ids.push('udid');
    if (bench || pct === null) ids.push(age < 18 ? 'cochlear' : 'adip');
    if (age < 18 && pct !== null && bench) ids.push('adip');
    if (age < 18 || role === 'student') ids.push('education-rights');
    if (role === 'student' && age >= 13) ids.push('scholarship'); // pre-matric starts at class 9
    if (role === 'student' && age >= 17) ids.push('coaching');
    if (role === 'student' && age >= 21) ids.push('higher');
    if (role === 'jobseeker') ids.push('jobs', 'skills', 'coaching');
    if (role === 'working' || role === 'jobseeker') ids.push('loans');
    if (role === 'working') ids.push('tax');
    if (bpl && pct >= 80 && age >= 18 && age <= 79) ids.push('pension');
    if (age >= 18) ids.push('driving');
    ids.push('railway', 'islrtc', 'state');
    const uniq = [...new Set(ids)].filter((id) => BY_ID[id]);
    const notes = [];
    if (pct === null) notes.push('Start with the UDID card: most schemes need it.');
    else if (!bench) notes.push('Most schemes need 40% or more on the certificate, so some may not apply to you yet.');
    if (bpl && pct >= 80) notes.push('You may also get the disability pension.');
    return {
      text: `Based on your answers, these schemes can help you: ${nameList(uniq)}. ${notes.join(' ')} Tap any scheme to see its official documents and how to apply.`.replace(/\s+/g, ' ').trim(),
      gloss: ['ME', 'FIND', 'GOVERNMENT', 'HELP', 'YOU', 'SEE', 'PAPER', 'PLEASE'],
      schemes: uniq,
    };
  }

  function flowAnswer(t) {
    const a = ctx.ans;
    const num = t.match(/\d{1,3}/);
    if (ctx.flow === 'pct') {
      if (/\b(no|not|don'?t|dont|none|never)\b/.test(t) && !num) a.pct = null;
      else if (num) a.pct = Math.min(100, +num[0]);
      else if (/\b(yes|yeah|have|i do)\b/.test(t)) {
        if (ctx.askedPct) a.pct = 40;
        else {
          ctx.askedPct = true;
          return R('What percentage is written on it? If you are not sure, say "not sure".', 'PERCENT WHAT');
        }
      } else if (/not sure|don'?t know|unknown/.test(t)) a.pct = 40;
      else return null;
    } else if (ctx.flow === 'age') {
      if (num) a.age = +num[0];
      else if (/child|kid|baby|son|daughter/.test(t)) a.age = 8;
      else if (/student/.test(t)) a.age = 19;
      else return null;
    } else if (ctx.flow === 'role') {
      if (/stud|school|college|universit/.test(t)) a.role = 'student';
      else if (/look|search|find|unemploy|no job|need a job|jobless/.test(t)) a.role = 'jobseeker';
      else if (/work|job|employ|business|self/.test(t)) a.role = 'working';
      else if (/none|no|neither|nothing|retired|home/.test(t)) a.role = 'none';
      else return null;
    } else if (ctx.flow === 'bpl') {
      if (/\b(yes|yeah|have|bpl|antyodaya)\b/.test(t) && !/\b(no|not|don)\b/.test(t)) a.bpl = true;
      else if (/\b(no|not|don'?t|dont|nope)\b/.test(t)) a.bpl = false;
      else return null;
    }
    return flowStep();
  }

  const INTENTS = [
    ['find', [/find my scheme|which schemes? (am i|can i|do i|for me)|eligible|what can i get|schemes? for me|help me find|suggest/], () => {
      ctx.ans = {};
      ctx.askedPct = false;
      return flowStep();
    }],
    ['all', [/\b(all|list|every|which|what) (the )?(schemes|benefits|government schemes|welfare)\b|\bshow (me )?(all )?schemes\b/], () => {
      const ids = SCHEMES.map((s) => s.id);
      return { text: `I know ${ids.length} schemes and rights for Deaf and hard-of-hearing people, in groups: ${Object.values(SCHEME_CATS).join(', ')}. Tap one, or ask me about any of them.`, gloss: ['GOVERNMENT', 'HELP', 'DEAF', 'MANY', 'YOU', 'CHOICE', 'PLEASE'], schemes: ids };
    }],
    ['docs', [/\b(documents?|papers?|kaagaz|what (do|should) i (need to )?bring|what is needed|requirements?)\b/], (t) => {
      const s = named(t) || (ctx.last && BY_ID[ctx.last]) || findScheme(t);
      if (!s) return { text: 'Most schemes ask for: the UDID card or disability certificate, Aadhaar card, an income certificate, a bank account and a passport-size photo. Tell me the scheme and I will show its exact list.', gloss: ['DEAF', 'CARD', 'PAPER', 'MONEY', 'PAPER', 'PICTURE', 'NEED'], scheme: 'udid', docsOnly: true };
      ctx.last = s.id;
      return { text: `For ${s.name}, you need: ${s.docs.join('; ')}.`, gloss: ['PAPER', 'NEED', ...s.g.split(' ').slice(0, 3)], scheme: s.id, docsOnly: true };
    }],
    ['apply', [/\b(how|where) (do|can|to|should) (i )?apply\b|\bapply(ing)?\b|\bregister\b|\bprocess\b/], (t) => {
      const s = named(t) || (ctx.last && BY_ID[ctx.last]) || findScheme(t);
      if (!s) return R('Tell me which scheme, and I will explain how to apply. Or say "find my schemes".', 'YOU WANT WHAT GOVERNMENT HELP');
      ctx.last = s.id;
      return { text: `How to apply for ${s.name}: ${s.apply}`, gloss: ['HOW', 'GOVERNMENT', 'PAPER', 'INTERNET', ...s.g.split(' ').slice(0, 2)], scheme: s.id };
    }],
    ['emergency', [/emergenc|\bhelp me now\b|danger|accident|police|ambulance/], () =>
      R('For an emergency, call or send an SMS to 112, India’s emergency number. Staff here will also help you right away.', 'EMERGENCY HELP NOW 112 PHONE TEXT')],
    ['who', [/who are you|your name|are you (a )?(robot|human|real|bot)/], () =>
      R('I am Meera, a signing guide to government schemes for Deaf and hard-of-hearing people. I sign, read text and listen, and I understand signs from the camera.', 'ME FS:MEERA SIGN HELP GOVERNMENT DEAF')],
    ['signhelp', [/how (do|to) (i )?(use|sign)|^help$|what can you do/], () =>
      R('Ask me about any scheme: hearing aids, pension, scholarships, jobs, loans, train concession, or say "find my schemes" and I will ask four short questions.', 'YOU ASK ME GOVERNMENT HELP CAN')],
    ['greeting', [/^(hi|hello|hey|good (morning|afternoon|evening)|namaste)\b/], () =>
      R('Namaste! I am Meera. I can explain government schemes for Deaf and hard-of-hearing people, show the official documents, and help you find what you can get. What would you like to know?', 'NAMASTE ME FS:MEERA GOVERNMENT HELP DEAF YOU WANT WHAT')],
    ['thanks', [/thank|thanks|appreciate/], () => R('You are most welcome! Anything else about the schemes?', 'WELCOME HAPPY HELP MORE WHAT')],
    ['bye', [/\b(bye|goodbye|see you|that'?s all|nothing else)\b/], () => R('Thank you for coming. All the best with your application!', 'THANK-YOU GOOD BYE')],
  ];

  return {
    ctx,
    reply(input) {
      const t = String(input || '').toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return R('Sorry, I did not catch that. Could you please sign or type it again?', 'SORRY ME NOT UNDERSTAND AGAIN PLEASE');

      if (ctx.flow) {
        if (/\b(cancel|stop|never ?mind|forget it)\b/.test(t)) {
          ctx.flow = null;
          return R('No problem. Ask me about any scheme whenever you like.', 'FINE YOU ASK ANY TIME');
        }
        const r = flowAnswer(t);
        if (r) return r;
      }

      // "documents" / "how to apply" first: they may name a scheme or refer to the last one
      for (const name of ['find', 'docs', 'apply']) {
        const [, res, fn] = INTENTS.find((i) => i[0] === name);
        if (res.some((re) => re.test(t))) return fn(t);
      }
      if (/\b(schemes?|benefits|options)\b/.test(t) && !named(t)) {
        const topic = TOPICS.find(([, re]) => re.test(t));
        if (topic) {
          const ids = CAT_IDS(topic[0]);
          return { text: `Schemes for ${SCHEME_CATS[topic[0]].toLowerCase()}: ${nameList(ids)}. Tap one to see the official documents.`, gloss: ['GOVERNMENT', 'HELP', 'YOU', 'CHOICE', 'PLEASE'], schemes: ids };
        }
      }
      const s = findScheme(input);
      if (s && !/^(hi|hello|hey|namaste|thank|bye)\b/.test(t)) {
        ctx.last = s.id;
        return schemeReply(BY_ID[s.id]);
      }
      for (const [cat, re] of TOPICS) {
        if (re.test(t)) {
          const ids = CAT_IDS(cat);
          return { text: `Schemes for ${SCHEME_CATS[cat].toLowerCase()}: ${nameList(ids)}. Tap one to see the official documents.`, gloss: ['GOVERNMENT', 'HELP', 'YOU', 'CHOICE', 'PLEASE'], schemes: ids };
        }
      }
      for (const [name, res, fn] of INTENTS) if (!['find', 'docs', 'apply'].includes(name) && res.some((re) => re.test(t))) return fn(t);
      if (/^(yes|yeah|ok|okay|sure)$/.test(t)) return R('Great! Ask me about any scheme, or say "find my schemes".', 'GOOD YOU ASK ME');
      if (/^(no|nope|nothing)$/.test(t)) return R('Alright. I am here if you need anything.', 'FINE ME HELP YOU');
      return null;
    },
    fallback(input) {
      const best = input ? faq.best(input) : null;
      if (best && best.score >= 0.25) {
        const s = BY_ID[best.e.id];
        ctx.last = s.id;
        return { ...schemeReply(s), text: `I think you are asking about ${s.name}. ` + schemeReply(s).text };
      }
      return {
        text: `Sorry, I do not know that one yet. I can explain hearing aids, cochlear implants, pension, scholarships, coaching, jobs, training, loans, train concession, driving licence and tax benefits. You can also search every central and state scheme on the official myScheme portal. (Information last checked ${SCHEMES_CHECKED}.)`,
        gloss: ['SORRY', 'ME', 'NOT', 'KNOW', 'GOVERNMENT', 'HELP', 'INTERNET', 'FIND'],
        schemes: ['state'],
      };
    },
  };
}

// Gloss -> English templates for signs a visitor is likely to make at a welfare help desk.
export const SCHEMES_TEMPLATES = [
  [['HEARING-AID'], 'How can I get a free hearing aid?'],
  [['CARD', 'DEAF'], 'How do I get a disability (UDID) card?'],
  [['CARD'], 'How do I get a disability (UDID) card?'],
  [['MONEY', 'MONTH'], 'Is there a monthly pension for me?'],
  [['MONEY', 'SCHOOL'], 'Is there a scholarship for my studies?'],
  [['MONEY', 'STUDY'], 'Is there a scholarship for my studies?'],
  [['MONEY', 'COLLEGE'], 'Is there a scholarship for my studies?'],
  [['MONEY', 'BUSINESS'], 'Can I get a loan to start a business?'],
  [['WORK', 'FIND'], 'Can you help me find a job?'],
  [['WORK', 'GOVERNMENT'], 'Is there a government job quota for deaf people?'],
  [['WORK'], 'Are there jobs or training for deaf people?'],
  [['TRAIN'], 'Is there a train ticket concession for deaf people?'],
  [['DRIVE'], 'Can deaf people get a driving licence?'],
  [['LEARN', 'SIGN-LANGUAGE'], 'Where can I learn Indian Sign Language?'],
  [['CHILD', 'DEAF'], 'What help is there for my deaf child?'],
  [['PAPER'], 'Which documents do I need?'],
  [['DOCUMENT'], 'Which documents do I need?'],
  [['FORM'], 'How do I fill the application form?'],
  [['GOVERNMENT', 'HELP'], 'What government help can I get?'],
  [['MONEY', 'GOVERNMENT'], 'What government money help can I get?'],
];
