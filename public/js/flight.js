// Offline in-flight cabin brain (secondary venue): intent matching + seat lookup and an order flow
// (meals, drinks, blankets brought to the seat). Same interface as createBot() in bot.js.
import { R, createFaqMatcher } from './bot.js';
import { FLIGHT, FLIGHT_FAQ } from './flight-faq.js';

// Mock passenger list for "which seat am I in?"
const PAX = [
  { name: 'priya sharma', pnr: 'K7Q2XM', seat: '12A' },
  { name: 'rahul mehta', pnr: 'K8R4TN', seat: '2C' },
  { name: 'anjali verma', pnr: 'K3M9PL', seat: '21F' },
  { name: 'john smith', pnr: 'K5D1WB', seat: '14D' },
];

// Things the crew can bring to the seat: [key, label, regex, gloss]. Non-veg is tested before veg.
const ITEMS = [
  ['nonveg', 'Chicken curry with rice', /non[\s-]?veg|chicken|\bmeat\b/, 'CHICKEN EAT'],
  ['veg', 'Paneer biryani (veg)', /\bveg(etarian|gie)?\b|paneer|biryani/, 'FS:VEG EAT'],
  ['snack', 'Snack box', /snack|sandwich|biscuit|cookie|chips/, 'SNACK'],
  ['tea', 'Masala tea', /\btea\b|\bchai\b/, 'TEA'],
  ['coffee', 'Coffee', /coffee/, 'COFFEE'],
  ['juice', 'Orange juice', /juice/, 'ORANGE DRINK'],
  ['water', 'Water', /\bwater\b/, 'WATER'],
  ['blanket', 'Blanket', /blanket/, 'BLANKET'],
  ['pillow', 'Pillow', /pillow|cushion/, 'PILLOW'],
];
const parseItems = (t) => ITEMS.filter(([, , re]) => re.test(t)).filter(([k], _, all) => !(k === 'veg' && all.some(([o]) => o === 'nonveg')));
const MEAL = /\b(meal|food|eat|hungry|dinner|lunch|breakfast|starving)\b/;
const DRINK = /\b(drink|thirsty|beverage)\b/;

const SEAT_RE = /\bseat\s*(?:number\s*|no\s*)?(?:is\s*)?(\d{1,2})\s?([a-f])\b|\b([1-9]|[12]\d|30)([a-f])\b/;
function parseSeat(t, loose) {
  const m = t.match(SEAT_RE) || (loose && t.match(/^\s*(?:it'?s\s*|i am in\s*)?(\d{1,2})\s?([a-f])\s*$/));
  if (!m) return null;
  const n = +(m[1] || m[3]), l = (m[2] || m[4]).toUpperCase();
  return n >= 1 && n <= 30 ? n + l : null;
}
const seatGloss = (s) => `CHAIR ${s.slice(0, -1)} FS:${s.slice(-1)}`;
const clock = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

function findPax(t) {
  const p = t.match(/\bk(?=[a-z]*\d)[a-z0-9]{5}\b/i);
  if (p) return PAX.find((x) => x.pnr === p[0].toUpperCase());
  return PAX.find((x) => t.includes(x.name) || (t.includes(x.name.split(' ')[0]) && t.split(' ').length <= 4));
}

const faq = createFaqMatcher(FLIGHT_FAQ);
const faqReply = (e) => R(e.a, e.g);
const faqHit = (t) => faq.keyword(t) || (faq.best(t)?.score >= 0.5 ? faq.best(t).e : null);

// questions about safety equipment are not emergencies
const SAFETY_INFO = /\b(emergency|fire) (exits?|doors?|procedures?|instructions|equipment|landing)\b/;

export function createFlightBot() {
  // the demo flight left 38 minutes ago; a new passenger restarts the clock
  const ctx = { departed: Date.now() - 38 * 60000, seat: null, order: null, awaiting: null, lastAsk: null };

  const status = () => {
    let left = FLIGHT.minutes - (Date.now() - ctx.departed) / 60000;
    if (left < 5) (ctx.departed = Date.now() - 38 * 60000), (left = FLIGHT.minutes - 38);
    const arrive = new Date(ctx.departed + FLIGHT.minutes * 60000);
    return { left: Math.round(left), arrive, progress: 1 - left / FLIGHT.minutes, arriveText: clock(arrive) };
  };

  const seatAnswer = (p) => {
    ctx.seat = p.seat;
    const first = p.name.split(' ')[0].replace(/^./, (c) => c.toUpperCase());
    const side = /[AF]$/.test(p.seat) ? 'a window seat' : /[CD]$/.test(p.seat) ? 'an aisle seat' : 'a middle seat';
    return { text: `Welcome aboard, ${first}! Your seat is ${p.seat}, ${side} in row ${p.seat.slice(0, -1)}. Rows are numbered on the overhead bins.`, gloss: ['WELCOME', 'FS:' + first.toUpperCase(), ...seatGloss(p.seat).split(' '), 'SEE', 'UP'] };
  };

  function orderStep(t) {
    const o = ctx.order;
    if (!o.items.length) {
      ctx.lastAsk = 'item';
      return o.kind === 'drink'
        ? R('Of course. Would you like tea, coffee, orange juice or water?', 'DRINK TEA COFFEE ORANGE WATER YOU WANT WHAT')
        : R('Happy to bring you something. We have vegetarian paneer biryani, non-veg chicken curry with rice, or a snack box. All free. Which would you like?', 'EAT FS:VEG CHICKEN SNACK FREE YOU WANT WHAT');
    }
    if (!ctx.seat) {
      ctx.lastAsk = 'seat';
      return R('What is your seat number? It is on your boarding pass, for example 12A.', 'YOU CHAIR NUMBER WHAT');
    }
    const label = o.items.map(([, l]) => l).join(' + ');
    const gloss = [...o.items.flatMap(([, , , g]) => g.split(' ')), 'GIVE', 'YOU', ...seatGloss(ctx.seat).split(' '), '5', 'MINUTE'];
    ctx.order = null;
    ctx.awaiting = null;
    ctx.lastAsk = null;
    return {
      text: `Done! A crew member will bring your ${label.toLowerCase().replace(' (veg)', '')} to seat ${ctx.seat} in about 5 minutes.`,
      gloss,
      card: { title: 'Order placed', fields: [['Item', label], ['Seat', ctx.seat], ['Arrives', '~5 min']] },
    };
  }
  function startOrder(t, kind) {
    ctx.order = { items: parseItems(t), kind };
    ctx.awaiting = 'order';
    return orderStep(t);
  }

  // Intents: [name, regexes, handler]; pleasantries are checked last
  const INTENTS = [
    ['myseat', [/(my|our) seat\b(?! is)|which seat|seat number|where (do|should|can) i sit|where is my seat|find my seat/], (t) => {
      const p = findPax(t);
      if (p) return seatAnswer(p);
      if (ctx.seat) return R(`Your seat is ${ctx.seat}.`, seatGloss(ctx.seat));
      ctx.awaiting = 'lookup';
      return R('I can find it. Please tell me your name, or the 6-letter booking code (PNR) on your boarding pass. It starts with K.', 'ME HELP YOU NAME WHAT');
    }],
    ['order', [MEAL, DRINK, /\b(bring|get|have|want|need|like|order)\b.*\b(tea|coffee|juice|water|snack|blanket|pillow|cushion|chai|biryani|chicken|paneer|sandwich)/, /^(tea|coffee|juice|water|snack|blanket|pillow|chai)\b/, /\b(blanket|pillow)\b/], (t) =>
      startOrder(t, DRINK.test(t) && !MEAL.test(t) ? 'drink' : 'meal')],
    ['landing', [/\bland(ing)?\b|arriv|how long|how much longer|time left|when (do|will|are) we (get|reach|be)|\beta\b|reach jaipur|minutes left|flight time/], () => {
      const s = status();
      return R(`We land in Jaipur in about ${s.left} minutes, at ${s.arriveText} local time. The seatbelt sign will come on about 20 minutes before landing.`, `ARRIVE FS:JAIPUR ${s.left} MINUTE FS:BELT LIGHT 20 MINUTE BEFORE`);
    }],
    ['restroom', [/restroom|toilet|bathroom|washroom|lavatory|\bloo\b/], () =>
      R('There is a restroom at the front, behind business class, and two at the back. A green light means free, red means busy. Please wait while the seatbelt light is on.', 'BATHROOM FRONT BACK GREEN FREE FS:RED WAIT FS:BELT LIGHT')],
    ['safety', [/safety|life ?(vest|jacket)|oxygen|\bmasks?\b|exits?\b|brace|seat ?belt (how|work)/], () =>
      R('Safety briefing: fasten your seatbelt low and tight. Oxygen masks drop from above; put yours on first, then help others. Your life vest is under your seat. Exits are at the front, over the wings and at the back, and floor lights show the way.', 'SAFE SIT FS:BELT FS:MASK DOWN YOU FIRST HELP OTHER FS:VEST UNDER CHAIR DOOR FRONT BACK LIGHT FLOOR')],
    ['unwell', [/sick|unwell|\bill\b|vomit|nause|dizzy|headache|\bpain\b|fever|medicine|doctor|first aid|feel (bad|faint)/], () =>
      R('I am sorry you feel unwell. A crew member is coming with water and medicine. There is a sick bag in the seat pocket. If it is serious, we will ask for a doctor on board.', 'SORRY YOU SICK STAFF COME WATER MEDICINE DOCTOR CAN')],
    ['callcrew', [/call (the |a )?(crew|attendant|hostess|steward|staff)|flight attendant|need (the |a )?crew|crew member/], () =>
      R('A crew member is on the way to your seat. Your call light above the seat is on.', 'STAFF COME YOU CHAIR NOW LIGHT')],
    ['wifi', [/wi-?fi|internet|wireless|online/], () =>
      R(`Free Wi-Fi is on board. Join the network ${FLIGHT.wifi.network} and open the browser. It works for messages and browsing, but not video.`, 'FS:WIFI FREE TEXT CAN MOVIE NOT')],
    ['time', [/what time is it|current time|local time/], () => {
      const n = new Date();
      return R(`It is ${clock(n)} in both Mumbai and Jaipur.`, `NOW TIME ${n.getHours() % 12 || 12} ${String(n.getMinutes()).padStart(2, '0')}`);
    }],
    ['who', [/who are you|your name|are you (a )?(robot|human|real|bot)/], () =>
      R('I am Meera, a virtual signing cabin assistant on Kesar Air. I sign, read text and listen, and I understand signs from the camera. The cabin crew are always close by.', 'ME FS:MEERA SIGN HELP YOU STAFF NEAR')],
    ['signhelp', [/how (do|to) (i )?(use|sign)|help$|what can you do/], () =>
      R('You can type, speak, or sign to the camera. Try: when do we land, a blanket please, my seat number, or where is the restroom.', 'YOU SIGN CAN ME UNDERSTAND')],
    ['greeting', [/^(hi|hello|hey|good (morning|afternoon|evening)|namaste|hola)\b/], () =>
      R(`Namaste, and welcome aboard ${FLIGHT.airline} flight ${FLIGHT.number} to Jaipur! I am Meera. I can bring you food, drinks or a blanket, find your seat, or tell you when we land.`, 'NAMASTE WELCOME ME FS:MEERA HELP YOU WHAT')],
    ['thanks', [/thank|thanks|appreciate|grateful/], () => R('You are most welcome! Enjoy the flight. Anything else?', 'WELCOME HAPPY TRAVEL MORE WHAT')],
    ['bye', [/\b(bye|goodbye|see you|that'?s all|nothing else)\b/], () => R(`Thank you for flying ${FLIGHT.airline}. Have a wonderful time in Jaipur!`, 'THANK-YOU TRAVEL HAPPY BYE')],
  ];
  const matchesIntent = (t) => INTENTS.some(([name, res]) => name !== 'order' && res.some((re) => re.test(t))) || !!faqHit(t);

  return {
    ctx,
    status,
    reply(input) {
      const t = String(input || '').toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return R('Sorry, I did not catch that. Could you please sign or type it again?', 'SORRY ME NOT UNDERSTAND AGAIN PLEASE');

      // emergencies interrupt everything
      if (!SAFETY_INFO.test(t) && /emergenc|\bfire\b|i smell smoke|smoke in|can'?t breathe|cannot breathe|chest pain|heart attack|bleeding|unconscious|fainted|not breathing|unsafe|danger/.test(t))
        return R('Stay calm, help is coming. I am alerting the cabin crew now and someone is coming to your seat. Press the call button above your seat; it lights up so the crew can find you fast.', 'EMERGENCY HELP NOW CALM SIT PLEASE STAFF COME');

      const seat = parseSeat(t, ctx.lastAsk === 'seat');
      if (seat) ctx.seat = seat;

      // order in progress
      if (ctx.awaiting === 'order' && ctx.order) {
        if (/\b(cancel|stop|never ?mind|forget it|no thanks)\b/.test(t)) {
          ctx.order = null;
          ctx.awaiting = null;
          return R('No problem, I have cancelled that. Anything else?', 'FINISH NOT MORE WHAT');
        }
        const items = parseItems(t);
        if (items.length && !ctx.order.items.length) ctx.order.items = items;
        if (items.length || seat || !matchesIntent(t)) return orderStep(t);
      }

      if (ctx.awaiting === 'lookup') {
        const p = findPax(t);
        ctx.awaiting = null;
        if (p) return seatAnswer(p);
        if (t.split(' ').length <= 4) return R('Sorry, I could not find that name. Please check your boarding pass, or show it to a crew member.', 'SORRY NAME NOT FIND SHOW STAFF PAPER PLEASE');
      }
      const p = /\bk(?=[a-z]*\d)[a-z0-9]{5}\b/.test(t) ? findPax(t) : null;
      if (p) return seatAnswer(p);

      const kw = faq.keyword(input);
      // "I want water" is an order even though "water" is also an FAQ word
      if (kw && !parseItems(t).length) return faqReply(kw);
      for (const [, res, fn] of INTENTS) if (res.some((re) => re.test(t))) return fn(t);
      if (kw) return faqReply(kw);
      const sim = faq.best(input);
      if (sim && sim.score >= 0.5) return faqReply(sim.e);
      if (seat) return R(`Thank you, I have noted seat ${seat}. How can I help?`, `THANK-YOU ${seatGloss(seat)} HELP WHAT`);
      if (/^(yes|yeah|ok|okay|sure)$/.test(t)) return R('Great! How else can I help you?', 'GOOD HELP YOU MORE WHAT');
      if (/^(no|nope|nothing)$/.test(t)) return R('Alright. I am here if you need anything. Enjoy the flight!', 'FINE ME HELP HAPPY TRAVEL');
      return null;
    },
    fallback(input) {
      const s = input ? faq.best(input) : null;
      if (s && s.score >= 0.3) return R(`I am not fully sure, but I think you are asking: ${s.e.q[0]}? ${s.e.a}`);
      return R('Sorry, I am not sure about that. I can help with meals, drinks, blankets, your seat, landing time, restrooms and safety. The cabin crew can also help; press the call button above your seat.', 'SORRY ME NOT UNDERSTAND EAT DRINK BLANKET CHAIR HELP CAN');
    },
  };
}

// Gloss -> English templates for signs a passenger is likely to make (tried before the hotel ones).
export const FLIGHT_TEMPLATES = [
  [['BLANKET'], 'Could I have a blanket, please?'],
  [['PILLOW'], 'Could I have a pillow, please?'],
  [['TEA'], 'Could I have some tea, please?'],
  [['COFFEE'], 'Could I have a coffee, please?'],
  [['SNACK'], 'Could I have a snack, please?'],
  [['FS:VEG'], 'I would like the vegetarian meal, please.'],
  [['CHICKEN'], 'I would like the chicken meal, please.'],
  [['WATER'], 'Could I have some water, please?'],
  [['ARRIVE'], 'When do we land?'],
  [['CHAIR', 'WHERE'], 'Where is my seat?'],
  [['BATHROOM'], 'Where is the restroom?'],
  [['SICK'], 'I am not feeling well.'],
  [['HEADACHE'], 'I have a headache. Do you have some medicine?'],
  [['COLD'], 'I feel cold.'],
  [['FS:HOT'], 'I feel too warm.'],
  [['SAFE'], 'Can you show me the safety briefing?'],
  [['CONNECT'], 'I have a connecting flight.'],
  [['WHEELCHAIR'], 'I need wheelchair help when we land.'],
  [['MOVIE'], 'How do I turn on captions for the movies?'],
  [['EAT'], 'I would like something to eat, please.'],
  [['DRINK'], 'Could I have a drink, please?'],
];
