// Offline hotel concierge brain: intent matching + booking / room-lookup flows.
// Every reply is { text, gloss } where gloss is the sign sequence the avatar performs.
import { textToGloss } from './signs.js';
import { FAQ } from './faq.js';

export const HOTEL = {
  name: 'Kesar Palace',
  checkIn: '2 PM',
  checkOut: '11 AM',
  rooms: {
    standard: { label: 'Standard Room', price: 4500, beds: 'queen bed', max: 2 },
    deluxe: { label: 'Deluxe Room', price: 6800, beds: 'king bed with city view', max: 3 },
    suite: { label: 'Executive Suite', price: 12000, beds: 'king bed, living room and bathtub', max: 4 },
  },
  wifi: { network: 'KesarPalace_Guest', password: 'KESAR24' },
};

// Mock reservations for "what is my room number?"
const GUESTS = [
  { name: 'priya sharma', id: 'KSR1021', room: '305', floor: 3, nights: 2, type: 'deluxe' },
  { name: 'rahul mehta', id: 'KSR1022', room: '512', floor: 5, nights: 1, type: 'suite' },
  { name: 'anjali verma', id: 'KSR1023', room: '214', floor: 2, nights: 3, type: 'standard' },
  { name: 'john smith', id: 'KSR1024', room: '418', floor: 4, nights: 4, type: 'deluxe' },
];
const FREE_ROOMS = { standard: ['201', '208', '222'], deluxe: ['307', '311', '406'], suite: ['601', '702'] };

const inr = (n) => '₹' + n.toLocaleString('en-IN');
const G = (s) => s.split(/\s+/).filter(Boolean);
const R = (text, gloss) => ({ text, gloss: gloss ? G(gloss) : textToGloss(text) });
const floorWord = (n) => ['ground', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][n] || n + 'th';

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, a: 1, single: 1, couple: 2 };
function parseCount(t, unit) {
  const re = new RegExp(`(\\d+|${Object.keys(NUM).join('|')})\\s*${unit}`);
  const m = t.match(re);
  if (!m) return null;
  return /\d/.test(m[1]) ? parseInt(m[1], 10) : NUM[m[1]];
}
function parseRoomType(t) {
  if (/suite|executive|luxury|premium/.test(t)) return 'suite';
  if (/deluxe|king|view|bigger|large/.test(t)) return 'deluxe';
  if (/standard|basic|cheap|budget|normal|single|queen|simple/.test(t)) return 'standard';
  return null;
}

// Intents: [name, regexes, handler]
const INTENTS = [
  ['emergency', [/emergenc|\bfire\b|ambulance|police|heart attack|bleeding|injur|unsafe|danger|smoke alarm|i smell smoke/], () =>
    R('Stay calm, help is coming. I am alerting our duty manager and security right now. Help will reach you within minutes. If you are in your room, press the red SOS button by the bed; the room lights will flash to confirm.', 'EMERGENCY HELP NOW PLEASE WAIT')],
  ['greeting', [/^(hi|hello|hey|good (morning|afternoon|evening)|namaste|hola)\b/, /^(hello|hi)\b/], () =>
    R(`Namaste, and welcome to ${HOTEL.name}! I am Meera, your signing concierge. How can I help you today? You can book a room, find your room number, or ask me anything about the hotel.`, 'NAMASTE WELCOME HOTEL ME FS:MEERA HELP YOU WHAT')],
  ['thanks', [/thank|thanks|appreciate|grateful/], () => R('You are most welcome! It is my pleasure. Anything else I can help you with?', 'WELCOME HAPPY HELP YOU MORE WHAT')],
  ['bye', [/\b(bye|goodbye|see you|good night|that'?s all|nothing else)\b/], () => R('Thank you for staying with us. Have a wonderful day, goodbye!', 'THANK-YOU HOTEL STAY GOOD DAY BYE')],
  ['myroom', [/(my|our) room (number|no)|which room (am|are) (i|we)|room number|what room|where is my room|forgot (my )?room/], (t, ctx) => {
    const g = findGuest(t);
    if (g) return roomAnswer(g);
    ctx.awaiting = 'lookup';
    return R('I can find that for you. Please tell me the name on the booking, or your booking ID. It starts with KSR.', 'ME HELP YOU NAME WHAT RESERVE NUMBER WHAT');
  }],
  ['book', [/\b(book|reserve|reservation|need a room|want a room|get a room|room for|stay for|available|availability|vacan)/], (t, ctx) => {
    ctx.booking = { type: parseRoomType(t), nights: parseCount(t, 'nights?'), guests: parseCount(t, '(guests?|people|persons|adults)') };
    ctx.awaiting = 'booking';
    return bookingStep(t, ctx);
  }],
  ['price', [/price|cost|rate|tariff|how much|charges?|expensive|cheap/], () => {
    const r = HOTEL.rooms;
    return R(`Our rates per night: Standard Room ${inr(r.standard.price)}, Deluxe Room ${inr(r.deluxe.price)}, and Executive Suite ${inr(r.suite.price)}. Breakfast and Wi-Fi are included. Taxes of 12 percent are extra.`, 'ROOM MONEY NIGHT FS:STANDARD 4500 FS:DELUXE 6800 FS:SUITE 12000 EAT MORNING FREE');
  }],
  ['roomtypes', [/room types?|kinds? of rooms?|what rooms|which rooms|options/], () =>
    R('We have three room types. Standard with a queen bed, Deluxe with a king bed and city view, and the Executive Suite with a living room and bathtub. Would you like to book one?', 'ROOM 3 FS:STANDARD FS:DELUXE FS:SUITE YOU WANT RESERVE')],
  ['checkin', [/check[\s-]?in|arrival|early check/], (t) =>
    /early/.test(t)
      ? R('Early check-in from 10 AM is possible if a room is ready, for ₹1,500. From 12 noon it is free, subject to availability.', 'CHECK IN 10 FS:AM CAN MONEY 1500')
      : R(`Check-in time is ${HOTEL.checkIn}. Please bring a photo ID, like Aadhaar, passport or driving licence.`, 'CHECK IN TIME 2 FS:PM FS:ID GIVE PLEASE')],
  ['checkout', [/check[\s-]?out|leave|leaving|depart|late check/], (t) =>
    /late|extend|later/.test(t)
      ? R('Late checkout until 1 PM is free for our guests if the room is available. Until 6 PM costs half a night. Shall I arrange it?', 'LATE CHECK OUT 1 FS:PM FREE YOU WANT')
      : R(`Checkout time is ${HOTEL.checkOut}. You can leave your luggage with us for free after checkout.`, 'CHECK OUT TIME 11 FS:AM')],
  ['wifi', [/wi-?fi|internet|password|network|wireless/], () =>
    R(`The Wi-Fi network is ${HOTEL.wifi.network} and the password is ${HOTEL.wifi.password}. It is free and works across the hotel.`, `FS:WIFI FREE FS:${HOTEL.wifi.password}`)],
  ['breakfast', [/breakfast|morning meal/], () =>
    R('Breakfast is served from 7 to 10:30 AM at Saffron restaurant, on the ground floor. It is free for guests.', 'EAT MORNING 7 10 FS:AM FLOOR 0 FREE')],
  ['food', [/restaurant|dinner|lunch|food|eat|hungry|menu|room service|order/], (t) =>
    /room service|order|deliver/.test(t)
      ? R('Room service is available 24 hours. Use the tablet in your room to order with pictures, or send a text to 98100 00000. No phone call needed.', 'ROOM EAT GIVE 24 TIME')
      : R('Saffron restaurant on the ground floor serves lunch from 12:30 to 3 PM and dinner from 7 to 11 PM. Room service is available 24 hours.', 'EAT FLOOR 0 EAT NIGHT 7 11 FS:PM')],
  ['bar', [/\bbar\b|drink|alcohol|beer|wine|cocktail|coffee|\btea\b/], () =>
    R('The Skyline lounge on the 8th floor is open from 5 PM to midnight. The lobby café serves coffee and tea all day.', 'DRINK FLOOR 8 5 FS:PM')],
  ['pool', [/pool|swim/], () => R('The rooftop pool is on the 8th floor, open from 6 AM to 9 PM. Towels are provided there.', 'SWIM FLOOR 8 UP 6 FS:AM 9 FS:PM')],
  ['gym', [/gym|fitness|exercise|workout/], () => R('The fitness centre is on the 2nd floor and is open 24 hours. Use your room key card to enter.', 'EXERCISE FLOOR 2 24 TIME KEY')],
  ['spa', [/spa|massage|salon|sauna/], () => R('Our spa on the 3rd floor is open from 10 AM to 8 PM. You can book a massage here with me or on the room tablet.', 'FS:SPA FLOOR 3 10 FS:AM 8 FS:PM RESERVE CAN')],
  ['towels', [/towel|pillow|blanket|toiletr|soap|shampoo|toothbrush|extra bed|housekeep|clean my room|cleaning/], (t) =>
    /clean|housekeep/.test(t)
      ? R('Housekeeping will clean your room. Please tell me your room number, or use the Clean Room button on your room tablet.', 'CLEAN ROOM YOU ROOM NUMBER WHAT')
      : R('Of course! Extra towels, pillows and toiletries will be delivered to your room within 15 minutes. Staff will knock and also flash your door light.', 'MORE CLEAN GIVE ROOM 15 TIME')],
  ['laundry', [/laundry|iron|wash (my )?cloth|dry clean/], () => R('Laundry and ironing service is available. Put clothes in the laundry bag before 10 AM for same-day return by 7 PM.', 'CLEAN 10 FS:AM NOW DAY')],
  ['taxi', [/taxi|\bcab\b|\bcar\b|airport|uber|\bola\b|transport|pick ?up|\bdrop\b/], (t) =>
    /airport/.test(t)
      ? R('An airport taxi costs ₹1,200 and takes about 40 minutes. I can book it now. What time do you need it?', 'FS:AIRPORT CAR MONEY 1200 TIME WHEN')
      : R('I can call a taxi for you. It will be at the main entrance in about 10 minutes. The driver will get a note that you are Deaf.', 'CAR CALL 10 TIME DEAF')],
  ['parking', [/park(ing)?|valet/], () => R('Parking is free for guests in the basement. Valet parking is also available at the main entrance.', 'PARKING FREE DOWN')],
  ['key', [/\bkeys?\b|key ?card|room card|locked out|lost my|door (won'?t|not) open/], () =>
    R('No problem. Please show your photo ID here at the front desk and I will make a new key card for you right away.', 'FS:ID SEE ME GIVE YOU KEY NOW')],
  ['ac', [/\bac\b|air ?con|heater|too (hot|cold)|temperature|tv|television|remote|light|broken|not working|repair|leak/], () =>
    R('Sorry about that! A technician will come to your room within 15 minutes. Please tell me your room number.', 'SORRY ME HELP YOU 15 TIME ROOM NUMBER WHAT')],
  ['accessibility', [/deaf|hearing|accessib|disab|vibrat|alarm|interpreter|visual|flash/], () =>
    R('We have Deaf-friendly rooms with flashing fire alarms, a flashing doorbell, a vibrating alarm clock and captioned TV. A video sign language interpreter is also available 24 hours.', 'DEAF ROOM HAVE EMERGENCY SEE SIGN HELP 24 TIME')],
  ['wakeup', [/wake[\s-]?up|alarm clock|morning call/], () =>
    R('I can set a wake-up alert. Your room has a vibrating pillow alarm and flashing lights. What time should I set it?', 'MORNING TIME WHEN YOU WANT')],
  ['doctor', [/doctor|sick|\bill\b|medicine|pharmacy|hospital|fever|\bpain|headache|first aid/], () =>
    R('A doctor is on call 24 hours and can visit your room in 30 minutes. There is also a pharmacy 200 metres away. Should I call the doctor?', 'DOCTOR 24 TIME CAN ROOM YOU WANT')],
  ['payment', [/pay|payment|upi|credit|debit|cash|bill|invoice|receipt|gst/], (t) =>
    /bill|invoice|receipt|gst/.test(t)
      ? R('Your bill can be printed here or emailed to you. GST invoices are available. Just tell me your room number.', 'MONEY GIVE CAN ROOM NUMBER WHAT')
      : R('We accept UPI, credit and debit cards, and cash. Payment is taken at check-in.', 'PAY FS:UPI KEY MONEY CAN')],
  ['cancel', [/cancel|refund|change (my )?booking|modify/], () =>
    R('Free cancellation is possible up to 24 hours before check-in. After that, one night is charged. Please give me your booking ID and I will help.', 'FS:CANCEL FREE 24 TIME RESERVE NUMBER YOU')],
  ['pets', [/pet|dog|cat|animal/], () => R('Pets are not allowed, but service animals are always welcome.', 'FS:PET NOT HELP FS:DOG WELCOME')],
  ['smoking', [/smok|cigarette/], () => R('All rooms are non-smoking. There is a smoking area near the garden on the ground floor.', 'ROOM NOT FS:SMOKE FLOOR 0')],
  ['luggage', [/luggage|bags?|baggage|suitcase|porter/], () => R('A porter will carry your luggage. We also store bags for free before check-in or after checkout.', 'HELP GIVE FREE')],
  ['elevator', [/elevator|lift|stairs/], () => R('The elevators are on your left, just past the front desk.', 'ELEVATOR LEFT HOTEL')],
  ['washroom', [/washroom|restroom|toilet|bathroom/], () => R('The public restroom is behind the lobby, next to the elevators, on your left.', 'BATHROOM ELEVATOR LEFT')],
  ['nearby', [/nearby|near here|around|attraction|sightsee|visit|shopping|mall|market|atm|bank|temple|museum/], (t) =>
    /atm|bank/.test(t)
      ? R('There is an ATM inside the lobby, next to the café, open 24 hours.', 'MONEY HOTEL HAVE 24 TIME')
      : R('The city market is a 10 minute walk, and the museum is 15 minutes by taxi. I can print a map or book a tour for you.', 'SEE 10 TIME CAR HELP CAN')],
  ['visitor', [/visitor|guest coming|friend (is )?coming|meet/], () => R('Visitors are welcome in the lobby until 10 PM. Visitors going to rooms must show ID at the desk.', 'FS:VISIT WELCOME 10 FS:PM FS:ID')],
  ['noise', [/noise|noisy|loud|complain|disturb|problem|unhappy|bad/], () =>
    R('I am very sorry. I will fix this right away and the duty manager will contact you by text. Can you tell me your room number?', 'SORRY ME HELP NOW ROOM NUMBER WHAT')],
  ['time', [/what time is it|current time/], () => {
    const n = new Date();
    const hh = n.getHours() % 12 || 12, mm = String(n.getMinutes()).padStart(2, '0'), ap = n.getHours() < 12 ? 'AM' : 'PM';
    return R(`It is ${hh}:${mm} ${ap}.`, `NOW TIME ${hh} ${mm} FS:${ap}`);
  }],
  ['who', [/who are you|your name|are you (a )?(robot|human|real|bot)/], () =>
    R('I am Meera, a virtual signing concierge. I sign, read text and listen, and I understand signs from your camera. Real staff are always nearby too.', 'ME FS:MEERA SIGN HELP YOU')],
  ['signhelp', [/how (do|to) (i )?(use|sign)|help$|what can you do/], () =>
    R('You can type, speak, or sign to your camera. Try asking: book a room, my room number, Wi-Fi password, or breakfast time.', 'YOU SIGN CAN ME UNDERSTAND')],
];

// Pleasantries (greeting, thanks, bye) are checked last so "Hello, I want a room" books a room.
INTENTS.push(...INTENTS.splice(1, 3));

// ---------- FAQ matching ----------
// Two passes: an exact keyword-phrase hit (runs before the intents, so specific questions like
// "is breakfast vegetarian?" beat the broad "breakfast" intent), then a fuzzy word-overlap score
// against every example phrasing (runs after the intents, for questions nothing else caught).
const FAQ_MIN = 0.5; // similarity needed to answer
const FAQ_HINT = 0.3; // similarity needed to offer a "did you mean" hint in the fallback
const FAQ_STOP = new Set('a an the is are am was were be been to of for in on at by with and or do does did can could would will should shall may might i you we me my your our us it its this that these those there here have has had get got please tell know want need like just also any some so if then than from about sir madam hi hello hey ok okay'.split(' '));
const FAQ_CANON = {
  lift: 'elevator', toilet: 'bathroom', washroom: 'bathroom', restroom: 'bathroom', cab: 'taxi', internet: 'wifi',
  kid: 'child', children: 'child', cost: 'price', charge: 'price', fee: 'price', rate: 'price', tariff: 'price', much: 'price',
  booking: 'book', reserve: 'book', reservation: 'book', nearby: 'near', nearest: 'near', train: 'railway', subway: 'metro',
  fitness: 'gym', workout: 'gym', exercise: 'gym', swim: 'pool', swimming: 'pool', massage: 'spa', meal: 'food', eat: 'food',
  veg: 'vegetarian', medicine: 'pharmacy', chemist: 'pharmacy', smoking: 'smoke', cigarette: 'smoke', dog: 'pet', cat: 'pet',
  invoice: 'bill', receipt: 'bill', payment: 'pay', television: 'tv', aircon: 'ac', allergic: 'allergy', drier: 'dryer',
  timing: 'time', hour: 'time', open: 'time', close: 'time', located: 'where', location: 'where', far: 'distance',
};
const faqNorm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\bwhat'?s\b/g, 'what is').replace(/\bwhere'?s\b/g, 'where is').replace(/\bi'?m\b/g, 'i am')
    .replace(/\bcan'?t\b/g, 'cannot').replace(/n't\b/g, ' not').replace(/\bdont\b/g, 'do not')
    .replace(/\bwi[\s-]?fi\b/g, 'wifi').replace(/\bcheck[\s-]?in\b/g, 'checkin').replace(/\bcheck[\s-]?out\b/g, 'checkout')
    .replace(/\bnon[\s-]?veg\b/g, 'non veg').replace(/\be-?mail\b/g, 'email')
    .replace(/[^a-z0-9₹ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const faqStem = (w) =>
  w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
const faqTokens = (s) =>
  faqNorm(s)
    .split(' ')
    .filter((w) => w && !FAQ_STOP.has(w))
    .map((w) => {
      w = FAQ_CANON[w] || w;
      w = faqStem(w);
      return FAQ_CANON[w] || w;
    });

function createFaqMatcher(entries) {
  const docs = [];
  const df = {};
  // keyword phrases also match with plurals folded ("malls" hits "mall")
  const fold = (s) => s.split(' ').map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');
  entries.forEach((e) => {
    e.kn = (e.k || []).map((k) => fold(faqNorm(k)));
    const seen = new Set();
    [...e.q, ...(e.k || [])].forEach((q) => {
      const t = new Set(faqTokens(q));
      if (t.size) docs.push({ e, t });
      t.forEach((w) => seen.add(w));
    });
    seen.forEach((w) => (df[w] = (df[w] || 0) + 1));
  });
  const idf = (w) => Math.log(1 + entries.length / (1 + (df[w] || 0)));
  return {
    // longest matching keyword phrase wins
    keyword(text) {
      const n = ' ' + fold(faqNorm(text)) + ' ';
      let best = null, len = 0;
      for (const e of entries) for (const k of e.kn) if (k.length > len && n.includes(' ' + k + ' ')) (best = e), (len = k.length);
      return best;
    },
    best(text) {
      const qt = [...new Set(faqTokens(text))];
      if (!qt.length) return null;
      const wq = qt.reduce((s, w) => s + idf(w), 0);
      let top = null;
      for (const d of docs) {
        let hit = 0, wd = 0;
        d.t.forEach((w) => (wd += idf(w)));
        for (const w of qt) if (d.t.has(w)) hit += idf(w);
        if (!hit) continue;
        const score = hit / Math.sqrt(wq * wd);
        if (!top || score > top.score) top = { e: d.e, score };
      }
      return top;
    },
  };
}
const faq = createFaqMatcher(FAQ);
const faqReply = (e) => R(e.a, e.g);
const faqHit = (t) => faq.keyword(t) || (faq.best(t)?.score >= FAQ_MIN ? faq.best(t).e : null);

function findGuest(t) {
  const id = t.match(/ksr\s?-?(\d{4})/i);
  if (id) return GUESTS.find((g) => g.id === 'KSR' + id[1]);
  return GUESTS.find((g) => t.includes(g.name) || t.includes(g.name.split(' ')[0]) && t.split(' ').length <= 4);
}
function roomAnswer(g) {
  const first = g.name.split(' ')[0].replace(/^./, (c) => c.toUpperCase());
  return {
    text: `Welcome, ${first}! Your room number is ${g.room} on the ${floorWord(g.floor)} floor. The elevators are on your left. Enjoy your stay!`,
    gloss: ['WELCOME', 'FS:' + first.toUpperCase(), 'YOU', 'ROOM', 'NUMBER', g.room, 'FLOOR', String(g.floor), 'ELEVATOR', 'LEFT'],
  };
}

const BARE_NUM = /^\s*(\d+|one|two|three|four|five|six|seven)\s*$/;
const matchesIntent = (t) => INTENTS.slice(1).some(([name, res]) => name !== 'book' && res.some((re) => re.test(t))) || !!faqHit(t);
// questions about fire safety are not emergencies
const FIRE_INFO = /\b(fire|emergency) (exits?|escape|drill|safety|extinguishers?|alarms? (for|in))\b/;

// Pull booking details out of a message. Returns true if anything new was learned.
function extractSlots(t, ctx) {
  const b = ctx.booking;
  const before = JSON.stringify(b);
  if (!b.type) b.type = parseRoomType(t);
  if (!b.nights) b.nights = parseCount(t, 'nights?') || (BARE_NUM.test(t) && ctx.lastAsk === 'nights' ? parseCount(t + ' nights', 'nights?') : null);
  if (!b.guests) b.guests = parseCount(t, '(guests?|people|persons|adults)') || (BARE_NUM.test(t) && ctx.lastAsk === 'guests' ? parseCount(t + ' guests', 'guests?') : null);
  if (!b.name && ctx.lastAsk === 'name') {
    const n = t.replace(/^(my name is|i am|i'm|name is|it'?s|under)\s*/i, '').trim();
    if (/^[a-z][a-z .'-]{1,38}$/.test(n) && n.split(' ').length <= 4 && !matchesIntent(t)) b.name = n.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return JSON.stringify(b) !== before;
}

function bookingStep(t, ctx) {
  const b = ctx.booking;
  extractSlots(t, ctx);

  if (!b.type) {
    ctx.lastAsk = 'type';
    const r = HOTEL.rooms;
    return R(`Happy to help you book! Which room would you like? Standard ${inr(r.standard.price)}, Deluxe ${inr(r.deluxe.price)}, or Suite ${inr(r.suite.price)} per night.`, 'HAPPY HELP RESERVE ROOM WHAT FS:STANDARD FS:DELUXE FS:SUITE');
  }
  if (!b.nights) {
    ctx.lastAsk = 'nights';
    const label = HOTEL.rooms[b.type].label;
    return R(`${/^[AEIOU]/.test(label) ? 'An' : 'A'} ${label}, lovely choice. How many nights will you stay?`, 'GOOD STAY NIGHT HOW-MANY'.replace('HOW-MANY', 'NUMBER WHAT'));
  }
  if (!b.guests) {
    ctx.lastAsk = 'guests';
    return R('How many guests will stay in the room?', 'ROOM STAY FS:GUEST NUMBER WHAT');
  }
  if (!b.name) {
    ctx.lastAsk = 'name';
    return R('And what name should the booking be under?', 'RESERVE NAME YOU WHAT');
  }
  if (!b.confirmed) {
    ctx.lastAsk = 'confirm';
    const room = HOTEL.rooms[b.type];
    const total = room.price * b.nights;
    b.total = total;
    if (b.guests > room.max) {
      b.guests = null;
      ctx.lastAsk = 'guests';
      return R(`Sorry, the ${room.label} fits ${room.max} guests at most. How many guests, or would you like a bigger room?`, `SORRY ROOM ${room.max} FS:GUEST MORE ROOM WANT`);
    }
    return R(`Please confirm: ${room.label}, ${b.nights} night${b.nights > 1 ? 's' : ''}, ${b.guests} guest${b.guests > 1 ? 's' : ''}, under the name ${b.name}. Total ${inr(total)} plus taxes. Shall I confirm? Yes or no.`, `ROOM ${b.nights} NIGHT ${b.guests} FS:GUEST MONEY ${total} YES NO`);
  }
  return null;
}

function confirmBooking(ctx) {
  const b = ctx.booking;
  const room = FREE_ROOMS[b.type].shift() || String(300 + Math.floor(Math.random() * 99));
  const id = 'KSR' + (1030 + Math.floor(Math.random() * 900));
  const floor = parseInt(room[0], 10);
  GUESTS.push({ name: b.name.toLowerCase(), id, room, floor, nights: b.nights, type: b.type });
  ctx.booking = null;
  ctx.awaiting = null;
  ctx.lastAsk = null;
  return {
    text: `Your booking is confirmed! Booking ID ${id}. Your room number is ${room} on the ${floorWord(floor)} floor. Check-in is from ${HOTEL.checkIn}. Welcome to Kesar Palace!`,
    gloss: ['RESERVE', 'FINISH', 'YOU', 'ROOM', 'NUMBER', room, 'FLOOR', String(floor), 'WELCOME', 'HAPPY'],
    booking: { id, room },
  };
}

export function createBot() {
  const ctx = { booking: null, awaiting: null, lastAsk: null };
  return {
    ctx,
    reply(input) {
      const t = String(input || '').toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return R('Sorry, I did not catch that. Could you please sign or type it again?', 'SORRY ME NOT UNDERSTAND AGAIN PLEASE');

      // emergencies interrupt everything
      if (!FIRE_INFO.test(t) && INTENTS[0][1].some((re) => re.test(t))) return INTENTS[0][2](t, ctx);

      // booking flow in progress
      if (ctx.awaiting === 'booking' && ctx.booking) {
        if (/\b(cancel|stop|never ?mind|forget it)\b/.test(t)) {
          ctx.booking = null;
          ctx.awaiting = null;
          return R('No problem, I have cancelled that booking request. Anything else?', 'FINISH NOT RESERVE MORE WHAT');
        }
        if (ctx.lastAsk === 'confirm') {
          if (/\b(yes|yeah|yep|sure|confirm|ok|okay|correct|right|go ahead|please)\b/.test(t)) return confirmBooking(ctx);
          if (/\b(no|nope|change|wrong)\b/.test(t)) {
            ctx.booking = { type: null, nights: null, guests: null };
            return bookingStep('', ctx);
          }
        }
        // answer side questions (e.g. "what time is breakfast?") without losing the booking
        const learned = extractSlots(t, ctx);
        if (learned || !matchesIntent(t)) {
          const step = bookingStep('', ctx);
          if (step) return step;
        }
      }

      if (ctx.awaiting === 'lookup') {
        const g = findGuest(t);
        ctx.awaiting = null;
        if (g) return roomAnswer(g);
        if (t.split(' ').length <= 4)
          return R('Sorry, I could not find a booking with that name. Please check the spelling, or show your ID to our staff at the desk.', 'SORRY NAME RESERVE NOT SEE FS:ID PLEASE');
      }

      // direct booking-id or known name
      const g = /ksr\s?-?\d{4}/.test(t) ? findGuest(t) : null;
      if (g) return roomAnswer(g);

      const kw = faq.keyword(input);
      if (kw) return faqReply(kw);

      for (const [name, res, fn] of INTENTS.slice(1)) {
        // "book a taxi / spa / table" is not a room booking
        if (name === 'book' && /taxi|\bcab\b|\bcar\b|airport|spa|massage|table|restaurant|tour|doctor/.test(t)) continue;
        if (res.some((re) => re.test(t))) return fn(t, ctx);
      }
      const sim = faq.best(input);
      if (sim && sim.score >= FAQ_MIN) return faqReply(sim.e);
      if (/^(yes|yeah|ok|okay|sure)$/.test(t)) return R('Great! How else can I help you?', 'GOOD HELP YOU MORE WHAT');
      if (/^(no|nope|nothing)$/.test(t)) return R('Alright. I am here if you need anything. Enjoy your stay!', 'FINE ME HELP HAPPY STAY');
      return null; // unknown -> caller may try AI, else fallback
    },
    fallback(input) {
      const s = input ? faq.best(input) : null;
      if (s && s.score >= FAQ_HINT) return R(`I am not fully sure, but I think you are asking: ${s.e.q[0]}? ${s.e.a}`, textToGloss(s.e.a).join(' '));
      return R('Sorry, I am not sure about that. I can help with bookings, room numbers, Wi-Fi, food, taxis and hotel services. A staff member can also help you here at the desk.', 'SORRY ME NOT UNDERSTAND HOTEL HELP CAN');
    },
  };
}

// Gloss -> fluent English for the sign-to-text direction (offline).
const TEMPLATES = [
  [['WANT', 'ROOM'], 'I would like to book a room.'],
  [['RESERVE', 'ROOM'], 'I would like to book a room.'],
  [['RESERVE'], 'I would like to make a booking.'],
  [['ROOM', 'NUMBER'], 'What is my room number?'],
  [['ME', 'ROOM', 'WHERE'], 'Where is my room?'],
  [['FS:WIFI'], 'What is the Wi-Fi password?'],
  [['EAT', 'MORNING'], 'What time is breakfast?'],
  [['EAT', 'WHERE'], 'Where can I eat?'],
  [['EAT', 'WHEN'], 'When is the restaurant open?'],
  [['CHECK', 'OUT'], 'What time is checkout?'],
  [['CHECK', 'IN'], 'I would like to check in.'],
  [['BATHROOM', 'WHERE'], 'Where is the restroom?'],
  [['BATHROOM'], 'Where is the restroom?'],
  [['TAXI'], 'Could you call me a taxi, please?'],
  [['CAR'], 'Could you call me a taxi, please?'],
  [['CALL'], 'Could you make a call for me, please?'],
  [['KEY'], 'I have a problem with my room key.'],
  [['DOCTOR'], 'I need a doctor, please.'],
  [['EMERGENCY'], 'This is an emergency, I need help!'],
  [['HELP', 'NEED'], 'I need help, please.'],
  [['HELP'], 'Can you help me, please?'],
  [['MONEY', 'ROOM'], 'How much does a room cost?'],
  [['MONEY'], 'How much does it cost?'],
  [['PAY'], 'I would like to pay my bill.'],
  [['MORE', 'CLEAN'], 'Could I have extra towels, please?'],
  [['CLEAN', 'ROOM'], 'Please clean my room.'],
  [['WATER'], 'Could I have some water, please?'],
  [['DRINK'], 'Where can I get a drink?'],
  [['EAT'], 'I would like something to eat.'],
  [['SLEEP'], 'I would like to rest in my room.'],
  [['SWIM'], 'Where is the swimming pool?'],
  [['EXERCISE'], 'Where is the gym?'],
  [['ELEVATOR'], 'Where is the elevator?'],
  [['PARKING'], 'Where can I park my car?'],
  [['THANK-YOU'], 'Thank you!'],
  [['HELLO'], 'Hello!'],
  [['BYE'], 'Goodbye!'],
  [['YES'], 'Yes.'],
  [['NO'], 'No.'],
  [['GOOD'], 'Good, thank you.'],
  [['LOVE'], 'I love it, thank you!'],
  [['WHAT'], 'What?'],
];
const WORD = { ME: 'I', YOU: 'you', 'THANK-YOU': 'thank you', ILY: 'I love you', CAR: 'taxi', CLEAN: 'clean', FINISH: 'finished', RESERVE: 'book' };

export function glossToEnglish(glosses) {
  const set = new Set(glosses);
  const nums = glosses.filter((g) => /^\d+$/.test(g));
  const spelled = glosses.filter((g) => g.startsWith('FS:') && g !== 'FS:WIFI').map((g) => g.slice(3));
  const parts = [];
  if (set.has('HELLO')) parts.push('Hello!');
  let body = null;
  for (const [need, sent] of TEMPLATES) {
    if (need.every((n) => set.has(n)) && !(need.length === 1 && need[0] === 'HELLO')) {
      body = sent;
      break;
    }
  }
  if (body && body !== 'Hello!') parts.push(body);
  if (nums.length) {
    if (set.has('NIGHT') || set.has('DAY')) parts.push(`For ${nums.join(' ')} ${set.has('NIGHT') ? 'night' : 'day'}${nums[0] === '1' ? '' : 's'}.`);
    else if (set.has('ROOM')) parts.push(`Room ${nums.join('')}.`);
    else parts.push(`Number ${nums.join('')}.`);
  }
  if (spelled.length) parts.push(`${set.has('NAME') || parts.length === 0 ? 'My name is' : ''} ${spelled.map((w) => w[0] + w.slice(1).toLowerCase()).join(' ')}.`.trim());
  if (set.has('TOMORROW')) parts.push('For tomorrow.');
  if (set.has('PLEASE') && !parts.some((p) => /please/i.test(p))) parts.push('Please.');
  if (!parts.length || (parts.length === 1 && parts[0] === 'Hello!' && glosses.length > 1)) {
    // generic: map glosses to words, question marker if wh-word present
    const words = glosses.filter((g) => g !== 'HELLO').map((g) => WORD[g] || (g.startsWith('FS:') ? g.slice(3) : g.toLowerCase().replace('-', ' ')));
    const wh = words.findIndex((w) => /^(what|where|when|how|why)$/.test(w));
    if (wh > 0) words.unshift(words.splice(wh, 1)[0]);
    let s = words.join(' ');
    s = s.charAt(0).toUpperCase() + s.slice(1);
    parts.push(s + (wh >= 0 ? '?' : '.'));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
