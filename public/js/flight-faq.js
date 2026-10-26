// In-flight FAQ knowledge base (secondary venue: Kesar Air cabin). Pure data (no imports) so both
// the browser bot and server.js can use it. Same shape as faq.js: q = example phrasings, k = keyword
// phrases checked before the intents, a = Meera's answer, g = optional hand-written gloss.
// NOTE: facts here are demo placeholders for the fictional Kesar Air flight KR 214, Mumbai to Jaipur.

export const FLIGHT = {
  airline: 'Kesar Air',
  number: 'KR 214',
  from: { city: 'Mumbai', code: 'BOM' },
  to: { city: 'Jaipur', code: 'JAI' },
  minutes: 110, // block time
  aircraft: 'Airbus A320neo',
  gate: 'Terminal 2',
  belt: '3',
  wifi: { network: 'KesarAir_Sky', password: 'none (free for messaging)' },
};

export const FLIGHT_FACTS = `Airline: Kesar Air (fictional), flight KR 214 from Mumbai (BOM) to Jaipur (JAI), about 1 hour 50 minutes, Airbus A320neo with 180 seats (rows 1–3 business, 4–30 economy, seats A–F; A and F are windows).
Complimentary meal on board: vegetarian paneer biryani or non-vegetarian chicken curry with rice; snack box; tea, coffee, juice and water free. Jain, diabetic and child meals only if pre-ordered (spares are limited).
Restrooms at the front (behind business) and two at the rear; not usable during take-off, landing or when the seatbelt sign is on.
Free Wi-Fi network KesarAir_Sky for messaging and browsing (no video). USB-C and USB-A charging under every seat. Seatback screens have captioned films and the live flight map.
Arrival: Jaipur Terminal 2, baggage belt 3; wheelchair and meet-and-assist available on request; local time same as Mumbai (IST). Connections are handled at the transfer desk in the arrival hall.
Crew call button is above the seat, it lights up. Sick bags in the seat pocket. Medical kit and defibrillator on board; crew are first-aid trained.
Safety: seatbelt low and tight; oxygen masks drop from above, put your own on first; life vest under the seat; 6 exits (2 front, 2 over the wings, 2 rear) with floor lights. Electronic cigarettes and smoking are banned.`;

export const FLIGHT_FAQ = [
  // ---------- seats & comfort ----------
  { q: ['can i change my seat', 'i want a window seat', 'can i move to an empty seat'], k: ['change my seat', 'change seat', 'another seat', 'different seat', 'empty seat', 'move seat', 'window seat', 'aisle seat', 'sit together'], a: 'After the seatbelt sign goes off, I can check for a free seat. Window seats are A and F, aisle seats are C and D. Please tell me your seat number.', g: 'CHAIR CHANGE CAN WAIT FS:BELT LIGHT OFF YOU CHAIR NUMBER WHAT' },
  { q: ['can i upgrade to business class', 'how much is business class'], k: ['upgrade', 'business class', 'front row'], a: 'Upgrades to business class can be bought on board if a seat is free, from ₹6,500 on this flight. I will ask the cabin manager for you.', g: 'FS:BUSINESS MONEY 6500 ME ASK' },
  { q: ['can i recline my seat', 'how do i lean back'], k: ['recline', 'lean back', 'seat back', 'lie back'], a: 'Press the button on your armrest and lean back. Please bring the seat up again for meals, take-off and landing.' },
  { q: ['my seat is broken', 'tray table is broken', 'screen is not working'], k: ['seat is broken', 'seat broken', 'tray table', 'screen not working', 'screen is not working', 'broken screen', 'light not working', 'reading light'], a: 'Sorry about that. A crew member will come to fix it, or move you to another seat if one is free. Please tell me your seat number.', g: 'SORRY HELP COME FIX YOU CHAIR NUMBER WHAT' },
  { q: ['it is too cold', 'can you turn off the air', 'it is too hot'], k: ['too cold', 'very cold', 'feeling cold', 'too hot', 'very hot', 'air vent', 'air flow', 'temperature'], a: 'You can turn the air vent above your seat to close it. I will also ask the crew to adjust the cabin temperature and bring a blanket if you like.', g: 'TEMPERATURE CHANGE CAN BLANKET GIVE WANT' },
  { q: ['can i get an eye mask', 'do you have earplugs'], k: ['eye mask', 'sleep mask', 'earplugs', 'ear plugs', 'amenity kit'], a: 'Yes, eye masks are free. A crew member will bring one to your seat.' },

  // ---------- food & drink ----------
  { q: ['is the meal free', 'do i have to pay for food'], k: ['meal free', 'food free', 'pay for food', 'pay for the meal', 'free food', 'meal price'], a: 'Yes, your meal, snacks, tea, coffee, juice and water are all free on this flight.', g: 'EAT DRINK FREE' },
  { q: ['what is on the menu', 'what food do you have'], k: ['menu', 'what food', 'food options', 'meal options', 'what is for dinner', 'what is for lunch'], a: 'We have vegetarian paneer biryani, non-vegetarian chicken curry with rice, and a snack box. Drinks are tea, coffee, juice and water. What would you like?', g: 'EAT FS:VEG CHICKEN SNACK DRINK TEA COFFEE WATER YOU WANT WHAT' },
  { q: ['do you have jain food', 'do you have a diabetic meal', 'child meal'], k: ['jain', 'diabetic', 'child meal', 'kids meal', 'baby food', 'vegan', 'gluten', 'special meal'], a: 'Jain, diabetic, vegan and child meals are made for passengers who pre-ordered. I will check if we have a spare one, and the crew can also give fruit and plain snacks.', g: 'EAT SPECIAL ME CHECK HAVE WAIT' },
  { q: ['i have a food allergy', 'does this have nuts'], k: ['allergy', 'allergic', 'nuts', 'peanut', 'lactose', 'ingredients'], a: 'Thank you for telling me. The crew will show you the ingredients card for each meal before serving. Please tell them about your allergy too.', g: 'THANK-YOU EAT SHOW YOU PAPER ALLERGY' },
  { q: ['do you serve alcohol', 'can i have a beer'], k: ['alcohol', 'beer', 'wine', 'whisky', 'liquor'], a: 'Alcohol is not served on Kesar Air domestic flights. We have tea, coffee, juice and soft drinks.', g: 'ALCOHOL NOT DRINK TEA COFFEE HAVE' },
  { q: ['can i bring my own food'], k: ['own food', 'outside food', 'my own food'], a: 'Yes, you can eat your own food. Hot food cannot be heated on board, and please do not open strong-smelling food.' },
  { q: ['can i buy snacks', 'is there duty free'], k: ['duty free', 'buy snacks', 'shopping', 'buy something', 'merchandise'], a: 'Snacks are free. A small shop menu with gifts and travel items is in your seat pocket. You can pay by card or UPI.', g: 'SNACK FREE SHOP PAPER CHAIR' },

  // ---------- flight info ----------
  { q: ['how high are we flying', 'what is our altitude', 'how fast are we going'], k: ['altitude', 'how high', 'how fast', 'speed of the plane', 'flying at'], a: 'We are cruising at about 11,000 metres, at around 830 kilometres per hour. The live map on your screen shows where we are.', g: 'UP HIGH SEE FS:MAP' },
  { q: ['what is the weather in jaipur', 'is it raining in jaipur'], k: ['weather', 'raining', 'temperature in jaipur', 'hot in jaipur'], a: 'Jaipur is clear tonight at about 27 degrees. The captain will share an update before landing.', g: 'WEATHER GOOD 27' },
  { q: ['is the flight delayed', 'are we on time'], k: ['delay', 'delayed', 'on time', 'late flight', 'running late'], a: 'We are on time. The captain will tell us if anything changes.', g: 'TIME GOOD NOT LATE' },
  { q: ['what plane is this', 'which aircraft is this'], k: ['which plane', 'what plane', 'aircraft', 'airplane model', 'plane type'], a: 'This is an Airbus A320neo with 180 seats.' },
  { q: ['what is turbulence', 'why is the plane shaking', 'is it safe'], k: ['turbulence', 'shaking', 'bumpy', 'is it safe', 'scared', 'afraid', 'nervous', 'anxious', 'fear of flying'], a: 'The shaking is turbulence, which is normal and safe. It is like a bumpy road. Please keep your seatbelt on while seated. I am here if you need anything.', g: 'SAFE CALM SIT FS:BELT KEEP ME HELP YOU' },
  { q: ['why is the seatbelt light on', 'can i stand up now'], k: ['seatbelt sign', 'seat belt sign', 'seatbelt light', 'belt sign', 'stand up', 'get up', 'walk around'], a: 'When the seatbelt light is on, please stay seated with your belt fastened. When it goes off, you can walk to the restroom. I will tell you when it changes.', g: 'FS:BELT LIGHT SIT PLEASE LIGHT OFF WALK CAN' },
  { q: ['why are my ears hurting', 'my ears are blocked'], k: ['ears hurt', 'ear pain', 'ears blocked', 'ear pressure', 'ears popping', 'ears pop'], a: 'Ear pressure is common during descent. Swallow, yawn, or chew something. The crew can bring you water or a sweet.', g: 'DRINK WATER EAT CANDY HELP' },

  // ---------- devices & entertainment ----------
  { q: ['can i use my phone', 'flight mode'], k: ['flight mode', 'airplane mode', 'use my phone', 'phone on', 'mobile data', 'bluetooth', 'laptop'], a: 'Yes, phones and laptops can be used in flight mode during the whole flight. Bluetooth headphones are fine too.', g: 'PHONE USE CAN' },
  { q: ['how do i charge my phone', 'is there a usb port'], k: ['charge', 'charging', 'usb', 'power socket', 'charger', 'plug'], a: 'There are USB-C and USB-A ports under the front of your seat. The crew can lend you a cable.', g: 'PHONE POWER UNDER CHAIR' },
  { q: ['do movies have subtitles', 'are there captions on the screen'], k: ['subtitle', 'subtitles', 'caption', 'captions', 'movie', 'movies', 'films', 'entertainment', 'tv shows'], a: 'Yes, all films and shows on your screen have captions in English and Hindi. Press the CC button to turn them on.', g: 'MOVIE CAPTION HAVE TV' },

  // ---------- arrival ----------
  { q: ['where do i get my bags', 'which baggage belt'], k: ['baggage belt', 'baggage claim', 'collect my bags', 'collect my luggage', 'where are my bags', 'my suitcase', 'checked bag', 'luggage belt', 'belt number'], a: 'Your checked bags will be on belt 3 in the Jaipur arrival hall. The belt number is also shown on screens.', g: 'FS:BAG FS:BELT 3 ARRIVE' },
  { q: ['what if my bag is lost', 'my luggage did not arrive'], k: ['lost bag', 'lost luggage', 'bag lost', 'missing bag', 'bag did not arrive', 'luggage did not arrive', 'damaged bag'], a: 'Please go to the Kesar Air baggage desk next to belt 3 with your boarding pass. They will track your bag and send updates by text.', g: 'FS:BAG LOSE GO FS:DESK 3 TEXT YOU' },
  { q: ['i have a connecting flight', 'will i miss my connection'], k: ['connecting flight', 'connection', 'transfer', 'next flight', 'onward flight', 'miss my flight'], a: 'Please tell me your next flight number. Transfer staff will meet you at the aircraft door and take you to the transfer desk in the arrival hall.', g: 'NEXT FS:FLIGHT NUMBER WHAT STAFF MEET YOU DOOR' },
  { q: ['how do i get a taxi in jaipur', 'is there a prepaid taxi'], k: ['taxi', 'cab', 'uber', 'ola', 'prepaid', 'get to the city', 'get to my hotel', 'kesar palace'], a: 'Prepaid taxis are outside the arrival hall, to the right. The city centre is about 30 minutes away. Kesar Palace guests can book a hotel car pickup.', g: 'TAXI OUTSIDE RIGHT 30 MINUTE' },
  { q: ['do i get off first if i need help', 'can someone help me off the plane'], k: ['help me off', 'get off', 'deplane', 'meet and assist', 'escort', 'help at the airport', 'assistance at arrival'], a: 'Yes. Passengers who need help leave first or last, as you prefer. A ground staff member will meet you at the door and walk with you to the baggage belt.', g: 'STAFF MEET YOU DOOR WALK TOGETHER' },
  { q: ['i left something on the plane', 'lost item'], k: ['left something', 'lost my phone', 'lost my wallet', 'forgot my', 'lost and found', 'lost item'], a: 'Please tell the crew right away what you lost and your seat number. After landing, contact the Kesar Air desk in the arrival hall.', g: 'TELL STAFF NOW YOU CHAIR NUMBER WHAT' },

  // ---------- accessibility ----------
  { q: ['does the crew know sign language', 'can someone sign with me'], k: ['crew know sign', 'crew sign', 'anyone sign', 'sign language', 'interpreter'], a: 'Some crew know basic sign language, and I am here for the whole flight. Announcements are also shown as captions on your screen.', g: 'STAFF SIGN CAN ME STAY HELP CAPTION SEE' },
  { q: ['will i miss announcements', 'how will i know what the captain says'], k: ['announcement', 'announcements', 'captain says', 'pilot says', 'pa system'], a: 'Every announcement is shown as captions on your seat screen and here on my screen. The crew will also tap your shoulder for anything important.', g: 'CAPTION SEE TV STAFF TELL YOU' },
  { q: ['can you charge my hearing aid', 'my hearing aid battery died'], k: ['hearing aid', 'cochlear', 'battery'], a: 'Hearing aids are safe to use on board. Use the USB port under your seat to charge, and the crew has spare small batteries.', g: 'HEARING-AID SAFE POWER UNDER CHAIR' },
  { q: ['can you write it down', 'pen and paper please'], k: ['write it down', 'pen and paper', 'notepad', 'write down', 'in writing'], a: 'Of course. The crew have a notepad, and you can always type to me here.' },
  { q: ['you are signing too fast', 'can you sign slower', 'please repeat'], k: ['sign slower', 'slow down', 'too fast', 'slower', 'sign again', 'repeat that', 'please repeat'], a: 'Sure. Use the Speed slider under my signing to slow me down, or press Replay to see it again.' },

  // ---------- rules ----------
  { q: ['can i smoke', 'can i vape'], k: ['smoke', 'smoking', 'cigarette', 'vape', 'e cigarette'], a: 'Smoking and vaping are not allowed anywhere on the aircraft, including the restrooms. The smoke detectors are very sensitive.', g: 'FS:SMOKE NOT' },
  { q: ['where do i put my bag', 'my bag does not fit'], k: ['overhead bin', 'overhead', 'my bag', 'put my bag', 'cabin bag', 'hand luggage', 'backpack'], a: 'Small bags go under the seat in front of you. Bigger bags go in the overhead bin. A crew member can help you lift it.', g: 'BACKPACK UNDER CHAIR FRONT HELP CAN' },
  { q: ['can i travel with a baby', 'do you have a baby bassinet'], k: ['baby', 'infant', 'bassinet', 'diaper', 'nappy', 'changing table'], a: 'Yes. The front restroom has a baby changing table, and the crew can warm milk or baby food. Bassinets are at row 4 if pre-booked.', g: 'BABY HELP CAN BATHROOM FRONT' },
];
