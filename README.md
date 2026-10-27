# Sanket · Sign Language Concierge

**Sanket** (संकेत, "sign") is a hotel front-desk assistant for Deaf and hard-of-hearing guests, shown here at the fictional **Kesar Palace, Jaipur**. **Meera**, a 3D receptionist built for this project, answers in sign language with captions. Guests can type, speak, sign to the webcam, or tap a sign board.

By [Ojaswi Rao](https://github.com/ojaswirao4).

## Run

```bash
npm install
npm start
```

Open http://localhost:5173 in **Chrome or Edge** (they support the Web Speech API for the mic). Camera and mic need `localhost` or HTTPS. Add `?start` to the URL to skip the welcome screen.

**Optional: Claude AI for open-ended questions.** Set `ANTHROPIC_API_KEY` before `npm start`. Questions the offline brain can't answer then go to Claude (model set in `server.js`). Claude replies with both English and a sign gloss. Without a key, everything runs offline.

**Tests:** with the server running, `npm test` drives the real page in headless Chrome (27 checks: welcome, all service tiles, booking flow, room lookup, Call staff, interpreter mode, sign board, camera, kiosk reset, motion smoothness, every dataset sign, the flight venue's tiles, order flow and sign board, the welfare venue's tiles, official links and find-my-schemes flow, the live sentence preview, phone layout, console errors). Screenshots go to `tests/shots/`.

## What it does

| Input | What happens |
|---|---|
| ⌨️ Type | Meera answers in sign, with captions (and voice, if on) |
| 🎤 Speak | Speech-to-text, then the same as typing |
| 🤟 Sign (camera) | MediaPipe hand and face tracking detects signs, fingerspelling (A–Z) and numbers, then turns them into a full English sentence |
| 🤟 Sign board | Tap signs to build a sentence (works without a camera) |

**Modes**
- **Concierge:** Meera answers the guest. Ten one-tap service tiles (check-in, booking, my room, Wi-Fi, dining, room service, taxi, housekeeping, accessibility, emergency).
- **Interpreter:** hearing staff speak or type and Meera signs it to the guest. The guest signs back and it is shown as text and spoken aloud.

**Front-desk touches:** a नमस्ते welcome screen (Meera greets with a namaste; the tap also unlocks the browser's audio), a live clock, a **Call staff** button, a booking-confirmation ticket card, a **New guest** button, and **kiosk privacy**: after 3 minutes without activity the conversation is cleared and the welcome screen returns, so the next guest never sees the previous guest's name or room.

> **Demo note:** *Call staff* only shows a confirmation and Meera signs it; it doesn't alert anyone yet. Connect it to the hotel's paging or SMS system before real use.

**Hotel knowledge (offline):** room booking (a step-by-step flow ending with a booking ID and room number), room-number lookup by name or booking ID (e.g. "Priya Sharma" or `KSR1022`), prices, check-in/out, Wi-Fi, food, room service, pool, gym, spa, towels, housekeeping, laundry, taxis and the airport, parking, lost key, repairs, Deaf-friendly room features, doctor, payment, cancellation, emergencies, and more. Edit `public/js/bot.js` to change the hotel data. `public/js/faq.js` holds about 135 more Q&A topics (veg, Jain, halal, allergies, ID rules, accessibility, safety, complaints, small talk). All facts are demo placeholders.

## Second venue: in-flight cabin

Sanket also runs as a **signing cabin assistant** on a fictional Kesar Air flight (KR 214, Mumbai → Jaipur). Pick it with the switch on the welcome screen, in Settings, or lock a kiosk to it with `?venue=flight` (`?venue=hotel` locks the hotel). The flight venue changes:

- **Scene:** a night aircraft cabin behind Meera (overhead bins, oval windows, galley curtain) with a galley counter, a paper cup and a folded blanket, kept dark so her hands stay clear.
- **Tiles:** safety briefing, my seat, meals, drinks, blanket, restroom, landing time, connections, feeling unwell, emergency.
- **Brain** (`public/js/flight.js`): seat lookup by name or booking code (`K7Q2XM` → 12A), an **order flow** that brings meals, drinks, blankets and pillows to the seat and ends with an *Order placed* card, landing time, restrooms, safety, feeling unwell, call crew and emergencies. `public/js/flight-faq.js` holds about 40 Q&A topics (bags, connections, turbulence, ear pressure, devices, captions, babies…), shared with Claude's flight prompt.
- **Flight strip:** route, live progress and minutes to landing above the tiles.
- **Interpreter phrases** for crew, a flight **sign board** (CHAIR, ARRIVE, BLANKET, SICK, …) and gloss → English templates such as BLANKET → "Could I have a blanket, please?" or CHAIR 12 A → "My seat is 12A."

## Third venue: welfare schemes guide

Meera also works as a **guide to Indian government schemes for Deaf, hard-of-hearing and speech-impaired people** (`?venue=schemes`, or the welcome screen / Settings). It covers 18 schemes and rights:
- UDID card
- ADIP hearing aids and cochlear implants
- disability pension
- scholarships, fellowships and free coaching
- education and job reservation
- PM-DAKSH training
- NDFDC loans
- railway concession and driving licence
- income tax deductions
- ISLRTC, free hearing screening and the Sugamya Bharat app
- state schemes

- **Official documents with every answer:** each scheme reply shows a card with how to apply, the documents you need (checklist) and buttons to the official portal / guidelines PDF (only `gov.in` / `nic.in` links; the test suite checks this).
- **Find my schemes:** four questions (certificate %, age, studying/working/job-seeking, BPL), then a tappable list of the schemes that fit.
- Follow-ups such as "what documents do I need?" and "how do I apply?" refer to the scheme just discussed.
- Data lives in `public/js/schemes-data.js` (shared with Claude's prompt). Figures that couldn't be confirmed on an official page carry a `check` note that is shown to the user. **Research date: 23 Oct 2026. Re-verify before real use.** It is an independent guide, not an official government service.

## Signs → full sentences

Signs from the camera or the sign board are turned into a natural English sentence, shown live under the signs (**Meaning**) and sent as the message: `HELLO BATHROOM WHERE` → "Hello! Where is the restroom?", `YOU NAME WHAT` → "What is your name?", `ME UNDERSTAND NOT` → "I do not understand.", `ME SICK DOCTOR NEED` → "I am sick. I need a doctor." Venue templates are used when they cover everything signed; otherwise a small ASL-to-English grammar (`composeSentence` in `bot.js`) moves question words to the front, adds "is / am / the", handles negation, yes/no questions, durations and possessives.

Venues are defined in `public/js/venues.js`; adding another (a hospital desk, a railway counter) means adding an entry there plus a brain with the same `reply` / `fallback` interface.

**Sign vocabulary:** about 80 signs are hand-authored in `signs.js` (plus NAMASTE for greetings). About 500 more come from the WLASL video dataset (see below). English words with no sign are fingerspelled. As in ASL, Meera doesn't sign articles, "be" verbs or most prepositions.

## Meera, the avatar

Meera is built entirely in code in `public/js/meera.js`: no downloaded model, no textures from outside. She is an Indian receptionist in a deep-teal silk saree with a gold-bordered pallu, a low bun with a jasmine gajra, a bindi, gold jhumkas and bangles.

Design choices made for **sign clarity**:
- **Solid, dark, long-sleeved clothing** (as sign interpreters wear) so the hands stand out, against a dark, low-saturation niche in the lobby wall.
- **Lighter palms than the backs of the hands** (as with real brown skin), so palm orientation reads at a glance.
- **A face scaled 7% larger than life** (friendlier at kiosk distance), sculpted on real proportions: eyes at mid-head, nose, mouth and chin spacing from standard facial proportions, the nose tip placed exactly where the sign keyframes expect it.

How she is built:
- **Head:** a sphere reshaped by height profiles (width, front and back depth) with smooth spline interpolation, then features added as smooth displacements (eye sockets, nose, cheekbones, lips, chin). Morph targets for smile, jaw and raised brows. Separate eyes (painted irises, kajal), lids that blink, sculpted brows and lips.
- **Hair:** the scalp surface pushed outward above a hairline curve. The shell passes below the skin at the hairline, so the edge is a smooth curve, not stair-stepped triangles. Centre parting, low bun.
- **Hands:** each hand is **one continuous skinned surface**, like real skin, not rigid pieces. The hand is modelled as a smooth signed-distance field (palm with thumb and little-finger pads, tapered fingers blended into the palm with webbing, the wrist), turned into a seamless mesh with surface nets (normals from the field gradient), and every vertex is weighted to the nearest finger bones so knuckles bend smoothly. The bones keep the joint layout the handshapes and dataset maths expect (3 joints per finger, 16 handshape numbers). Built once at load (~0.5–1 s) and shared by both hands.
- **Body:** torso, neck, shoulders and both sleeved arms are **one continuous surface** built the same way as the hands, with a feminine profile (waist, bust, softly sloping shoulders), a U blouse neckline, and the necklace resting on the skin. It is skinned to the spine and the arm bones (two-bone IK, with a shared elbow hinge so sleeves bend without twisting).
- **Dual-quaternion skinning** for hands and body: bent knuckles and elbows keep a round, full shape instead of pinching (standard skinning made folded fingers look snapped).
- **Keeping hands out of the body and apart:** palms are kept outside her head and chest, and two-handed signs are resolved with an exact minimal separation (sphere pairs over 26 directions), preferring to pull the hands straight apart, so contact signs (MORE, NAMASTE, NAME) touch instead of passing through each other or sliding past.
- **Face while signing:** blinking, gaze, question brows, smile, mouthing; dataset signs replay the original signer's facial expression.

**Motion:** each hand follows a cubic Hermite spline through the keyframes (Catmull-Rom tangents): it leaves each keyframe with the velocity it arrived with and only stops where the sign holds, so movement flows instead of stopping at every keyframe. Handshapes settle slightly ahead of the movement, as signers do. The test suite checks palm speed and acceleration for spikes.

The earlier avatars are still available: `?avatar=rocketbox` (the Microsoft Rocketbox model, MIT, in `public/models/aria/`) and `?avatar=classic` (the first procedural avatar). `tools/avatar/shoot.mjs` renders test poses, face, eye and hand close-ups; `tools/avatar/evalpage.mjs` runs measurements in the live page.

## Sign dataset (WLASL)

`tools/wlasl/` converts [WLASL](https://github.com/dxli94/WLASL) (Word-Level American Sign Language, 2,000 words) videos into keyframes:

1. `select_words.py` picks the words the hotel actually uses first.
2. `download.py` downloads 2 clean studio clips per word from the dictionary sites WLASL links to.
3. `extract.py` runs MediaPipe Holistic on each clip, maps body pose and hands onto the avatar's shoulders and face, fits the thumb by forward kinematics, trims the clip to the sign, reduces it to keyframes and records the signer's face. Output: `public/signs/wlasl/<WORD>.json` plus `index.json`.
4. `preview.mjs` + `sheet.py` build side-by-side sheets (video frame vs avatar).

`index.json` lists only usable signs: tracking quality ≥ 0.5 and at most 60 keyframes (clips taken from long videos are left out). 497 of the 520 converted signs pass.

```bash
cd tools/wlasl
python -m venv .venv && .venv\Scripts\pip install mediapipe opencv-python-headless numpy requests yt-dlp
.venv\Scripts\python download.py --top 2000 --per 2
.venv\Scripts\python extract.py          # resumable; --force to redo everything
```

> **Licence:** WLASL is released under the [C-UDA](https://github.com/dxli94/WLASL/blob/master/C-UDA-1.0.pdf) licence: **academic and computational use only, no commercial use.** The sign files in `public/signs/wlasl/` are derived from it. Before any commercial deployment, replace them with a dataset you're allowed to use commercially, e.g. [INCLUDE](https://zenodo.org/records/4010759) (Indian Sign Language, CC-BY 4.0), or license [ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/) from Microsoft. The pipeline stays the same; only the videos change.

## Project layout

```
server.js              static server + /api/chat, /api/translate (Claude)
public/index.html      UI (header, stage, service panel, welcome screen, settings)
public/styles.css      ivory / teal / saffron theme, responsive down to phones
public/js/main.js      UI logic: chat, tiles, modes, welcome, kiosk reset, call staff, booking ticket
public/js/meera.js     Meera, the avatar built in code
public/js/avatar.js    scene (Kesar Palace lobby / Kesar Air cabin), spline playback, and the classic procedural avatar
public/js/human.js     the Rocketbox avatar (?avatar=rocketbox)
public/js/signs.js     handshapes, sign keyframes, fingerspelling, English→gloss
public/js/bot.js       hotel brain (intents, booking flow, FAQ matcher) + gloss→English
public/js/faq.js       hotel FAQ dataset (shared with the server's Claude prompt)
public/js/venues.js    venue definitions (hotel, flight): wording, tiles, phrases, sign board
public/js/flight.js    in-flight brain (seat lookup, order flow, landing time) + gloss templates
public/js/flight-faq.js in-flight facts and FAQ (shared with the server's Claude prompt)
public/js/schemes.js    welfare-schemes brain (scheme answers, documents, find-my-schemes flow)
public/js/schemes-data.js government schemes data with official links (shared with Claude's prompt)
public/js/recognizer.js webcam sign recognition (MediaPipe + rules)
public/js/speech.js    speech recognition / synthesis (prefers an Indian-English voice)
public/signs/wlasl/    dataset signs (generated by tools/wlasl, WLASL licence applies)
tests/e2e.mjs          end-to-end checks (npm test)
tools/wlasl/           WLASL download + video-to-keyframe pipeline
tools/avatar/          render and measurement tools for the avatars
```

Add a new sign: add an entry to `SIGNS` in `signs.js` (keyframes of palm position, finger direction, palm direction and handshape) and add its name to `AUTHORED` in `server.js`. Dataset signs are added to Claude's vocabulary automatically.

## Indian Sign Language (pilot)

Settings → **Sign language** switches Meera to Indian Sign Language (or open the app with `?sign=isl`). The signs come from [INCLUDE](https://zenodo.org/records/4010759) (CC BY 4.0, 262 everyday words: greetings, family, colours, days, places, jobs). A word without an Indian sign is signed in ASL and marked **ASL** in the sign strip, and fingerspelling still uses the one-handed ASL alphabet.

INCLUDE is 56.8 GB of zips, but Zenodo serves byte ranges, so `tools/include/fetch.py` reads each zip's table of contents over HTTP and downloads only 2 videos per word (~7 GB). The same `extract.py` converts them:

```bash
cd tools/include
..\wlasl\.venv\Scripts\python fetch.py list          # data/catalog.json (word -> videos)
..\wlasl\.venv\Scripts\python fetch.py get --per 2   # data/videos + data/manifest.json
cd ..\wlasl
.venv\Scripts\python extract.py --set isl                # -> public/signs/isl/
set SET=isl&& node preview.mjs HELLO STUDENT && .venv\Scripts\python sheet.py   # comparison sheets in preview/isl
```

The INCLUDE signers stand further from the camera than WLASL's, so fine handshapes are tracked from fewer pixels and are less exact. Have an ISL signer review the signs before relying on them.

## Honest limitations

- **Sign language:** Meera signs approximations of **ASL**. Guests in India mostly use Indian Sign Language (ISL), which differs. **Validate with Deaf signers before real use**; an Indian Sign Language pilot (262 INCLUDE words, ASL for the rest) is in Settings.
- **Dataset signs** come from one video per word, so they carry that signer's style; depth is estimated from a single camera.
- **Recognition** is rule-based: about 30 word signs plus static fingerspelling and digits. It works best with good lighting, one signer and a plain background. J/Z and most motion-heavy signs aren't recognized.
- **Meera** is a stylised avatar built from code, not a scanned human. Her face and hands are designed for legibility rather than photorealism.

## License

The project code is [MIT](LICENSE), © 2026 Ojaswi Rao. Third-party parts keep their own licences (details in [LICENSE](LICENSE)):
- `public/signs/wlasl/`: derived from WLASL, **C-UDA, non-commercial use only**
- `public/models/aria/`: Microsoft Rocketbox, MIT
