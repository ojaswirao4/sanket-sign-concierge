// Webcam sign recognition: MediaPipe hand + face tracking, then rule-based
// classification of handshapes, location (relative to the face) and motion.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const dist = (a, b) => len(sub(a, b));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (v) => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

// ---------- per-hand features ----------
function features(w, img) {
  const palm = dist(w[0], w[9]) || 1;
  // E = extended, B = bent at the knuckle only, H = hooked (knuckle straight, finger curled), C = curled
  const state = FINGERS.map(([m, p, , t]) => {
    const straight = dot(norm(sub(w[p], w[m])), norm(sub(w[t], w[p])));
    const mcpBend = Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(w[m], w[0])), norm(sub(w[p], w[m]))))));
    if (straight > 0.65 && mcpBend < 0.75) return 'E';
    if (straight > 0.6) return 'B';
    return mcpBend < 0.75 ? 'H' : 'C';
  });
  const thumbTip = w[4];
  const thumbOut = dist(thumbTip, w[5]) / palm > 0.62 && dist(thumbTip, w[9]) / palm > 0.75;
  const thumbTouch = (i) => dist(thumbTip, w[i]) / palm;
  const idxDir = norm(sub(w[8], w[5]));
  const midDir = norm(sub(w[12], w[9]));
  const spreadIM = Math.acos(Math.max(-1, Math.min(1, dot(idxDir, midDir))));
  // image-space
  const i5 = img[5], i8 = img[8];
  const idx2dLen = d2(i8, i5) / (d2(img[0], img[9]) || 1);
  const pointUp = i8.y < i5.y - 0.03 && Math.abs(i8.x - i5.x) < Math.abs(i8.y - i5.y);
  const horizontal = Math.abs(i8.x - i5.x) > Math.abs(i8.y - i5.y) * 1.4;
  const palm2d = d2(img[0], img[9]) || 1;
  const thumbStraight = dot(norm(sub(w[3], w[2])), norm(sub(w[4], w[3]))) > 0.75 && dist(w[4], w[2]) / palm > 0.5;
  const topOfFingers = Math.min(...[6, 10, 14, 18, 8, 12].map((i) => img[i].y));
  const thumbUp = thumbStraight && img[4].y < topOfFingers - 0.15 * palm2d;
  const crossed = (img[8].x - img[12].x) * (img[5].x - img[9].x) < 0;
  const idxTipFar = dist(w[8], w[0]) / palm;
  return { state, thumbOut, thumbTouch, spreadIM, idx2dLen, pointUp, horizontal, thumbUp, crossed, palm, idxTipFar, tipZ: img[8].z - img[5].z };
}

// Handshape label from features
function classify(F) {
  const [i, m, r, p] = F.state;
  const ext = F.state.map((s) => s === 'E');
  const n = ext.filter(Boolean).length;
  const curled = F.state.every((s) => s === 'C' || s === 'B');
  if (curled) {
    const allBent = F.state.every((s) => s === 'B');
    // O / flat-O: fingertips stay away from the palm and meet the thumb
    if (F.idxTipFar > 1.05 && (F.thumbTouch(8) < 0.35 || F.thumbTouch(12) < 0.4)) return allBent && F.thumbTouch(8) >= 0.3 ? 'flatO' : 'O';
    if (F.thumbUp) return 'thumbUp';
    if (allBent && F.thumbTouch(12) > 0.5) return 'C';
    // S: thumb wraps across the fingers; A: thumb rests along the side
    return F.thumbTouch(10) < F.thumbTouch(6) ? 'S' : 'A';
  }
  if (n === 4) {
    if (F.thumbTouch(8) < 0.3) return 'flatO';
    return F.thumbOut ? '5' : 'B';
  }
  if (!ext[0] && ext[1] && ext[2] && ext[3]) return F.thumbTouch(8) < 0.35 ? 'F' : '9';
  if (ext[0] && ext[1] && ext[2] && !ext[3]) return F.thumbTouch(20) < 0.4 ? '6' : 'W';
  if (ext[0] && ext[1] && !ext[2] && ext[3]) return '7';
  if (ext[0] && !ext[1] && ext[2] && ext[3]) return '8';
  if (ext[0] && !ext[1] && !ext[2] && ext[3]) return F.thumbOut ? 'ILY' : 'horns';
  if (!ext[0] && !ext[1] && !ext[2] && ext[3]) return F.thumbOut ? 'Y' : 'I';
  if (ext[0] && ext[1] && !ext[2] && !ext[3]) {
    if (F.thumbTouch(8) < 0.3 && F.thumbTouch(12) < 0.35) return 'noClose';
    if (F.crossed) return 'R';
    if (F.thumbOut && F.spreadIM > 0.25) return '3';
    if (F.thumbTouch(10) < 0.3 && F.spreadIM > 0.2) return 'K';
    if (F.horizontal) return 'H';
    return F.spreadIM > 0.28 ? 'V' : 'U';
  }
  if (ext[0] && n === 1) {
    if (F.thumbOut && !F.horizontal) return 'L';
    if (F.horizontal) return 'G';
    if (F.thumbTouch(12) < 0.35) return 'D';
    return '1';
  }
  if (i === 'H' && n === 0) return 'X';
  if (F.state.every((s) => s !== 'E') && F.thumbTouch(8) < 0.35) return 'O';
  if (F.state.every((s) => s === 'B' || s === 'H')) return F.thumbOut ? 'C' : 'E';
  return '?';
}

export const _test = { features, classify };

// ---------- recognizer ----------
export class SignRecognizer {
  constructor(video, overlay, { onFrame, onGloss, onLetter, onIdle } = {}) {
    this.video = video;
    this.canvas = overlay;
    this.ctx = overlay.getContext('2d');
    this.cb = { onFrame, onGloss, onLetter, onIdle };
    this.mode = 'words';
    this.hist = { a: [], b: [] };
    this.cand = { key: null, n: 0 };
    this.cooldown = 0;
    this.lastCommit = { key: null, t: 0 };
    this.noHandSince = performance.now();
    this.idleFired = true;
    this.running = false;
    this.armed = null;
  }

  async init() {
    const vision = await import(`${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const mk = async (Cls, model, extra) => {
      try {
        return await Cls.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'GPU' }, runningMode: 'VIDEO', ...extra });
      } catch {
        return await Cls.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'CPU' }, runningMode: 'VIDEO', ...extra });
      }
    };
    this.hands = await mk(vision.HandLandmarker, HAND_MODEL, { numHands: 2, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
    this.faces = await mk(vision.FaceDetector, FACE_MODEL, { minDetectionConfidence: 0.5 });
    this.Draw = vision.DrawingUtils;
    this.HandLandmarker = vision.HandLandmarker;
  }

  // Returns false if stop() (or a newer start()) was called while this one was still loading.
  async start() {
    this.stop();
    const gen = this._gen;
    // load the models once, even if start() is called again while they download
    this._ready ||= this.init().catch((e) => {
      this._ready = null;
      throw e;
    });
    await this._ready;
    if (gen !== this._gen) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    if (gen !== this._gen) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (e) {
      if (gen !== this._gen) return false;
      throw e;
    }
    if (gen !== this._gen) return false;
    this.running = true;
    this._tick();
    return true;
  }

  stop() {
    this._gen = (this._gen || 0) + 1; // cancels any start() still in progress
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setMode(m) {
    this.mode = m;
    this.cand = { key: null, n: 0 };
  }

  _tick() {
    if (!this.running) return;
    requestAnimationFrame(() => this._tick());
    const v = this.video;
    if (v.readyState < 2) return;
    const now = performance.now();
    if (now - (this._last || 0) < 33) return;
    this._last = now;
    const hr = this.hands.detectForVideo(v, now);
    let face = null;
    if ((this._faceN = (this._faceN || 0) + 1) % 3 === 0 || !this._face) {
      const fr = this.faces.detectForVideo(v, now);
      const d = fr.detections?.[0];
      if (d) {
        const W = v.videoWidth, H = v.videoHeight, bb = d.boundingBox;
        const kp = d.keypoints || [];
        this._face = {
          x: (bb.originX + bb.width / 2) / W,
          y: (bb.originY + bb.height / 2) / H,
          w: bb.width / W,
          h: bb.height / H,
          mouth: kp[3] ? { x: kp[3].x, y: kp[3].y } : { x: (bb.originX + bb.width / 2) / W, y: (bb.originY + bb.height * 0.78) / H },
          eyes: kp[0] && kp[1] ? { x: (kp[0].x + kp[1].x) / 2, y: (kp[0].y + kp[1].y) / 2 } : null,
          ears: kp[4] && kp[5] ? [kp[4], kp[5]] : null,
        };
      } else if (fr.detections && !fr.detections.length) this._face = null;
    }
    face = this._face;
    this._draw(hr, face);
    this._process(hr, face, now);
  }

  _draw(hr, face) {
    const c = this.canvas, g = this.ctx, v = this.video;
    if (c.width !== v.videoWidth) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
    }
    g.clearRect(0, 0, c.width, c.height);
    const du = new this.Draw(g);
    (hr.landmarks || []).forEach((lm, i) => {
      du.drawConnectors(lm, this.HandLandmarker.HAND_CONNECTIONS, { color: i ? '#8fd3ff' : '#f2c46d', lineWidth: 3 });
      du.drawLandmarks(lm, { color: '#ffffff', fillColor: i ? '#3aa0ff' : '#d99a2b', radius: 3, lineWidth: 1 });
    });
    if (face) {
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.setLineDash([6, 6]);
      g.strokeRect((face.x - face.w / 2) * c.width, (face.y - face.h / 2) * c.height, face.w * c.width, face.h * c.height);
      g.setLineDash([]);
    }
  }

  _zone(pt, face) {
    if (!face) return 'neutral';
    const fw = face.w || 0.2;
    const mouth = face.mouth;
    const chin = { x: mouth.x, y: mouth.y + face.h * 0.28 };
    const fore = face.eyes ? { x: face.eyes.x, y: face.eyes.y - face.h * 0.32 } : { x: face.x, y: face.y - face.h * 0.45 };
    const dm = d2(pt, mouth) / fw, dc = d2(pt, chin) / fw, df = d2(pt, fore) / fw;
    const de = face.ears ? Math.min(...face.ears.map((e) => d2(pt, e))) / fw : 9;
    const m = Math.min(dm, dc, df, de);
    if (m > 0.75) {
      if (pt.y > chin.y + face.h * 0.3 && Math.abs(pt.x - face.x) < fw * 1.5) return 'chest';
      return 'neutral';
    }
    if (m === de) return 'ear';
    if (m === dm) return 'mouth';
    if (m === dc) return 'chin';
    return 'forehead';
  }

  _motion(h, now) {
    const pts = h.filter((p) => now - p.t < 900);
    if (pts.length < 6) return { osc: 0, oscY: 0, dy: 0, dx: 0 };
    let cx = 0, cy = 0, lx = 0, ly = 0;
    let ampX = 0, ampY = 0;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    ampX = Math.max(...xs) - Math.min(...xs);
    ampY = Math.max(...ys) - Math.min(...ys);
    for (let i = 2; i < pts.length; i++) {
      const vx = pts[i].x - pts[i - 2].x, vy = pts[i].y - pts[i - 2].y;
      if (Math.abs(vx) > 0.006) {
        if (lx && Math.sign(vx) !== lx) cx++;
        lx = Math.sign(vx);
      }
      if (Math.abs(vy) > 0.006) {
        if (ly && Math.sign(vy) !== ly) cy++;
        ly = Math.sign(vy);
      }
    }
    return { osc: ampX > 0.05 ? cx : 0, oscY: ampY > 0.04 ? cy : 0, dy: pts[pts.length - 1].y - pts[0].y, dx: pts[pts.length - 1].x - pts[0].x, ampX, ampY };
  }

  _process(hr, face, now) {
    const lms = hr.landmarks || [], wls = hr.worldLandmarks || [];
    if (!lms.length) {
      this.hist.a = [];
      this.hist.b = [];
      this.cand = { key: null, n: 0 };
      if (!this.idleFired && now - this.noHandSince > 1800) {
        this.idleFired = true;
        this.cb.onIdle?.();
      }
      this.cb.onFrame?.({ shape: '–', zone: '' });
      return;
    }
    this.noHandSince = now;
    this.idleFired = false;
    // raw (unmirrored) camera frame: the signer's right hand has the smaller x — treat it as dominant
    const hands = lms
      .map((img, i) => {
        const F = features(wls[i] || img, img);
        const shape = classify(F);
        const c = img[9];
        const tip = /^(1|D|G|L|X)$/.test(shape) ? img[8] : c;
        return { img, F, shape, center: { x: c.x, y: c.y }, zone: this._zone(tip, face) };
      })
      .sort((a, b) => a.center.x - b.center.x);
    const dom = hands[0];
    this.hist.a.push({ ...dom.center, t: now, shape: dom.shape, zone: dom.zone });
    if (this.hist.a.length > 40) this.hist.a.shift();
    const mot = this._motion(this.hist.a, now);
    this.cb.onFrame?.({ shape: dom.shape, zone: dom.zone, hands: hands.length });

    if (now < this.cooldown) return;
    let key = null, instant = false;
    if (this.mode === 'letters') key = /^[A-Z]$/.test(dom.shape) ? dom.shape : { thumbUp: 'A', 1: 'D', flatO: 'O', 0: 'O', 2: 'V', 6: 'W', 9: 'F', 3: 'K' }[dom.shape] || null;
    else if (this.mode === 'numbers') key = { '1': '1', D: '1', V: '2', U: '2', '3': '3', B: '4', '5': '5', '6': '6', W: '6', '7': '7', '8': '8', '9': '9', F: '9', O: '0', flatO: '0' }[dom.shape] || null;
    else ({ key, instant } = this._word(hands, dom, mot, face, now));

    if (!key) {
      this.cand = { key: null, n: 0 };
      return;
    }
    if (this.cand.key === key) this.cand.n++;
    else this.cand = { key, n: 1 };
    const need = instant ? 1 : this.mode === 'words' ? 9 : 12;
    this.cb.onFrame?.({ shape: dom.shape, zone: dom.zone, hands: hands.length, progress: Math.min(1, this.cand.n / need), pending: key });
    if (this.cand.n >= need) {
      if (this.lastCommit.key === key && now - this.lastCommit.t < (this.mode === 'words' ? 2500 : 900) && this.mode === 'words') return;
      this.lastCommit = { key, t: now };
      this.cand = { key: null, n: 0 };
      this.cooldown = now + (this.mode === 'words' ? 900 : 550);
      this.hist.a = [];
      if (this.mode === 'words') this.cb.onGloss?.(key);
      else this.cb.onLetter?.(key);
    }
  }

  // Word-level rules. Returns { key, instant } (instant = motion event already satisfied).
  _word(hands, dom, mot, face, now) {
    const s = dom.shape, z = dom.zone;
    const two = hands.length === 2 ? hands[1] : null;
    const fh = face ? face.h : 0.25;
    // motion-based first
    if ((s === 'B' || s === '5') && mot.osc >= 2 && (z === 'neutral' || z === 'forehead' || z === 'ear')) return { key: 'HELLO', instant: true };
    if ((s === 'S' || s === 'A') && mot.oscY >= 2 && mot.osc < 2) return { key: 'YES', instant: true };
    if ((s === '1' || s === 'D') && mot.osc >= 2 && dom.F.pointUp) return { key: 'WHERE', instant: true };
    if ((s === 'A' || s === 'S' || s === 'T') && mot.osc >= 2 && mot.oscY < 2) return { key: 'BATHROOM', instant: true };
    if (s === 'X' && mot.oscY >= 2) return { key: 'NEED', instant: true };
    if (two && (s === 'S' || s === 'A') && (two.shape === 'S' || two.shape === 'A') && mot.oscY >= 2) return { key: 'CAR', instant: true };

    // THANK-YOU: flat hand at chin/mouth, then moves down/away
    if ((s === 'B' || s === '5') && (z === 'chin' || z === 'mouth')) this.armed = { key: 'THANK-YOU', t: now, y: dom.center.y };
    if (this.armed && now - this.armed.t < 1400 && (s === 'B' || s === '5') && dom.center.y - this.armed.y > fh * 0.45) {
      this.armed = null;
      return { key: 'THANK-YOU', instant: true };
    }
    // NO: U/V/H snapping closed to the thumb
    if (s === 'noClose' && this.hist.a.some((p) => now - p.t < 700 && /^(U|V|H|3|K)$/.test(p.shape))) return { key: 'NO', instant: true };

    // two-handed static
    if (two) {
      const a = dom, b = two;
      const flat = (x) => x.shape === 'B' || x.shape === '5' || x.shape === '4';
      const sameRow = Math.abs(a.center.y - b.center.y) < 0.12;
      if ((a.shape === 'thumbUp' || a.shape === 'A') && flat(b) && b.center.y > a.center.y) return { key: 'HELP' };
      if ((b.shape === 'thumbUp' || b.shape === 'A') && flat(a) && a.center.y > b.center.y) return { key: 'HELP' };
      if ((a.shape === 'flatO' || a.shape === 'O') && flat(b) && b.center.y > a.center.y) return { key: 'MONEY' };
      if (a.shape === 'X' && flat(b)) return { key: 'KEY' };
      if ((a.shape === 'flatO' || a.shape === 'O') && (b.shape === 'flatO' || b.shape === 'O') && sameRow) return { key: 'MORE' };
      if (a.shape === 'B' && b.shape === 'B' && sameRow && z !== 'mouth') return { key: 'ROOM' };
      if (a.shape === '5' && b.shape === '5' && sameRow) return { key: 'WHAT' };
      if (a.shape === 'claw' && b.shape === 'claw') return { key: 'WANT' };
      if (a.shape === 'S' && b.shape === 'S' && sameRow && z === 'chest') return { key: 'LOVE' };
      if ((a.shape === '1' || a.shape === 'D') && (b.shape === '1' || b.shape === 'D') && mot.ampX > 0.04) return { key: 'SIGN' };
    }
    // one-handed static
    if (s === 'Y' && (z === 'ear' || z === 'chin' || z === 'mouth')) return { key: 'CALL' };
    if ((s === 'flatO' || s === 'O') && (z === 'mouth' || z === 'chin')) return { key: 'EAT' };
    if (s === 'C' && (z === 'mouth' || z === 'chin')) return { key: 'DRINK' };
    if (s === 'W' && (z === 'chin' || z === 'mouth')) return { key: 'WATER' };
    if ((s === 'B' || s === '5') && z === 'ear') return { key: 'SLEEP' };
    if (s === 'ILY') return { key: 'LOVE' };
    if (s === 'thumbUp' && z !== 'chin' && z !== 'mouth') return { key: 'GOOD' };
    if (s === '1' && (z === 'ear')) return { key: 'DEAF' };
    if ((s === '1' || s === 'D') && dom.F.idx2dLen < 0.45) return { key: dom.F.tipZ < 0 ? 'YOU' : 'ME' };
    if (s === 'bentB' || (s === 'B' && z === 'chest' && Math.abs(mot.dy) < 0.01)) return { key: null };
    return { key: null };
  }
}
