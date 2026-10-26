// Meera: the project's own signing avatar, built entirely in code (no downloaded model).
// An Indian receptionist in a deep-teal silk saree with long sleeves. Sign interpreters wear solid,
// dark clothing so the hands stand out; she does the same. Her palms are lighter than the backs of
// her hands (as with real brown skin), which makes palm orientation easy to read, and her nails
// are dark so fingertips read clearly.
//
// She uses the same keyframe space as the classic avatar (shoulders at y 1.435, nose tip at
// (0, 1.685, 0.1)), so every hand-authored and dataset sign plays on her unchanged.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Avatar, applyShape, PALM_OFFSET } from './avatar.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const g1 = (v, c, s) => Math.exp(-((v - c) ** 2) / (2 * s * s));
const g2 = (x, y, cx, cy, sx, sy) => g1(x, cx, sx) * g1(y, cy, sy);
const sgnpow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const lin = (hex) => new THREE.Color(hex); // THREE.Color stores linear values (colour management on)

const UPPER = 0.285, FORE = 0.265; // must match avatar.js
const UPV = new THREE.Vector3(0, 1, 0);
const PIVOT_Y = 1.555; // neck pivot
const HEAD_SCALE = 1.07; // a touch larger than life: friendlier, and faces read better at kiosk distance
const PALETTE = {
  skin: '#98603f', // warm medium brown
  palm: '#b47a5b', // lighter palms
  blush: '#b0604e',
  lip: '#7a2838',
  saree: '#0d4a55', // deep peacock teal
  sareeDark: '#093840',
  zari: '#d4a647', // gold border
  hair: '#0c0806',
  nail: '#6e0f22', // maroon polish
  gold: '#d6ad5c',
  bindi: '#a3101f',
};

// ---------- head sculpt ----------
// Face coordinates: origin at eye level on the midline, +z = forward, metres. Real proportions:
// crown +0.11, hairline +0.075, brows +0.022, eyes 0, nose tip -0.035, mouth -0.062, chin -0.112.
// The face root sits 0.03 above the head origin, which puts the nose tip exactly where keyframe
// space expects it (0, 1.685, 0.1).
const EYE_UP = 0.03;
const NOSE = new THREE.Vector3(0, -0.035, 0.1); // nose tip in face coordinates
// eye level in body space (the face root is scaled about the nose tip)
const EYE_Y = PIVOT_Y + 0.12 + EYE_UP + NOSE.y * (1 - HEAD_SCALE);
// cross-section by height: half-width, front depth, back depth
const HEAD_PROFILE = [
  [0.11, 0.0, 0.0, 0.0],
  [0.104, 0.03, 0.028, 0.04],
  [0.094, 0.05, 0.05, 0.068],
  [0.08, 0.063, 0.066, 0.086],
  [0.06, 0.07, 0.076, 0.096],
  [0.04, 0.0725, 0.081, 0.1],
  [0.02, 0.073, 0.0835, 0.1],
  [0.0, 0.0725, 0.083, 0.098],
  [-0.02, 0.071, 0.0835, 0.093],
  [-0.04, 0.0675, 0.0845, 0.084],
  [-0.055, 0.0635, 0.0845, 0.074],
  [-0.07, 0.0575, 0.0835, 0.06],
  [-0.085, 0.049, 0.081, 0.047],
  [-0.098, 0.037, 0.0775, 0.036],
  [-0.106, 0.025, 0.066, 0.03], // the underside of the chin curves back to meet the front of the neck
  [-0.112, 0.013, 0.042, 0.02],
  [-0.116, 0.0, 0.0, 0.0],
];
// Smooth (C1) interpolation through profile rows [y, a, b, c] sorted by y (either direction):
// Catmull-Rom with tangents from the neighbouring rows, so there are no ridges at the rows.
function profileSpline(P, y) {
  const asc = P[0][0] < P[P.length - 1][0];
  const R = asc ? P : P.slice().reverse();
  if (y <= R[0][0]) return R[0].slice(1);
  if (y >= R[R.length - 1][0]) return R[R.length - 1].slice(1);
  let i = 0;
  while (y > R[i + 1][0]) i++;
  const p0 = R[Math.max(0, i - 1)], p1 = R[i], p2 = R[i + 1], p3 = R[Math.min(R.length - 1, i + 2)];
  const h = p2[0] - p1[0], t = (y - p1[0]) / h;
  const t2 = t * t, t3 = t2 * t;
  return [1, 2, 3].map((j) => {
    const m1 = ((p2[j] - p0[j]) / (p2[0] - p0[0] || 1)) * h;
    const m2 = ((p3[j] - p1[j]) / (p3[0] - p1[0] || 1)) * h;
    return (2 * t3 - 3 * t2 + 1) * p1[j] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[j] + (t3 - t2) * m2;
  });
}
function headProfile(y) {
  const top = HEAD_PROFILE[0][0], bot = HEAD_PROFILE[HEAD_PROFILE.length - 1][0];
  if (y >= top || y <= bot) return [0, 0, 0];
  const v = profileSpline(HEAD_PROFILE.slice(1, -1), y);
  // round off the crown and the underside of the chin like a sphere cap (radius ~ sqrt(distance to the pole))
  const y1 = HEAD_PROFILE[1][0], yn = HEAD_PROFILE[HEAD_PROFILE.length - 2][0];
  if (y > y1) return HEAD_PROFILE[1].slice(1).map((r) => r * Math.sqrt(Math.max(0, (top - y) / (top - y1))));
  if (y < yn) return HEAD_PROFILE[HEAD_PROFILE.length - 2].slice(1).map((r) => r * Math.sqrt(Math.max(0, (y - bot) / (yn - bot))));
  return v.map((r) => Math.max(0, r));
}

// Unit-sphere direction -> head surface point in face coordinates.
function sculptHead(ux, uy, uz) {
  const y = uy > 0 ? uy * 0.11 : uy * 0.116;
  const [Rx, Rf, Rb] = headProfile(y);
  const hl = Math.hypot(ux, uz) || 1;
  const cx = ux / hl, cz = uz / hl;
  const n = cz > 0 ? 2.25 : 2.0; // a slightly squarer face, rounder skull
  let x = Rx * sgnpow(cx, 2 / n);
  let z = (cz > 0 ? Rf : Rb) * sgnpow(cz, 2 / n);
  const wf = smooth(0.25, 0.7, cz) * smooth(-0.117, -0.1, y); // face weight
  let dz = 0;
  // eye sockets, brow ridge, upper-lid fold
  dz -= 0.012 * (g2(x, y, 0.031, 0.0, 0.0155, 0.0105) + g2(x, y, -0.031, 0.0, 0.0155, 0.0105));
  dz += 0.003 * (g2(x, y, 0.029, 0.023, 0.02, 0.006) + g2(x, y, -0.029, 0.023, 0.02, 0.006));
  // nose: bridge rising to the tip, bulb, wings, then a quick return to the lip (subnasale)
  const nx = g1(x, 0, 0.0068 + 0.0022 * smooth(0.0, -0.03, y));
  const ramp = 0.0132 * smooth(0.014, -0.03, y) * (y > -0.034 ? 1 : g1(y, -0.034, 0.0048));
  dz += ramp * nx;
  dz += 0.0042 * g2(x, y, 0, -0.0325, 0.0085, 0.0068);
  dz += 0.0052 * (g2(x, y, 0.0115, -0.0385, 0.0048, 0.0048) + g2(x, y, -0.0115, -0.0385, 0.0048, 0.0048));
  // cheekbones and soft cheeks
  dz += 0.005 * (g2(x, y, 0.045, -0.017, 0.016, 0.012) + g2(x, y, -0.045, -0.017, 0.016, 0.012));
  dz += 0.0025 * (g2(x, y, 0.035, -0.05, 0.013, 0.013) + g2(x, y, -0.035, -0.05, 0.013, 0.013));
  // muzzle, philtrum, the groove under the lower lip, chin
  dz += 0.0035 * g2(x, y, 0, -0.062, 0.021, 0.013);
  dz -= 0.0011 * g2(x, y, 0, -0.051, 0.0032, 0.0035);
  dz -= 0.0017 * g2(x, y, 0, -0.08, 0.012, 0.0038);
  dz += 0.0028 * g2(x, y, 0, -0.097, 0.012, 0.007);
  z += dz * wf;
  // temples
  x -= Math.sign(x) * 0.003 * g2(y, z, 0.035, 0.045, 0.02, 0.02) * smooth(0.03, 0.06, Math.abs(x));
  return [x, y, z];
}

// z of the front-most surface at (x, y), looking along -z: forward-facing triangles bucketed on a
// 4 mm grid, then a 2D point-in-triangle test (far cheaper than raycasting the whole head each time).
function frontSurface(geo) {
  const P = geo.attributes.position, I = geo.index.array, CELL = 0.004;
  const buckets = new Map();
  const key = (i, j) => i * 10007 + j;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ax = P.getX(a), ay = P.getY(a), bx = P.getX(b), by = P.getY(b), cx = P.getX(c), cy = P.getY(c);
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 0) continue; // faces away from +z
    if (P.getZ(a) + P.getZ(b) + P.getZ(c) < 0) continue;
    const i0 = Math.floor(Math.min(ax, bx, cx) / CELL), i1 = Math.floor(Math.max(ax, bx, cx) / CELL);
    const j0 = Math.floor(Math.min(ay, by, cy) / CELL), j1 = Math.floor(Math.max(ay, by, cy) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(a, b, c);
    }
  }
  return (x, y) => {
    const list = buckets.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) || [];
    let best = -1;
    for (let t = 0; t < list.length; t += 3) {
      const a = list[t], b = list[t + 1], c = list[t + 2];
      const ax = P.getX(a), ay = P.getY(a), bx = P.getX(b), by = P.getY(b), cx = P.getX(c), cy = P.getY(c);
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-14) continue;
      const w1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
      const w2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
      const w3 = 1 - w1 - w2;
      if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
      best = Math.max(best, w1 * P.getZ(a) + w2 * P.getZ(b) + w3 * P.getZ(c));
    }
    return best;
  };
}

function sphereGeo(ws, hs) {
  // seam at the back of the head (hidden under the hair)
  return new THREE.SphereGeometry(1, ws, hs, Math.PI * 1.5);
}

// ---------- procedural textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function irisTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#efe6df';
    g.fillRect(0, 0, w, h);
    // faint veins toward the corners
    g.strokeStyle = 'rgba(190,90,90,0.12)';
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const y = h / 2 + (Math.random() - 0.5) * 60;
      g.moveTo(w * 0.25 + (Math.random() > 0.5 ? 70 : -70), y);
      g.quadraticCurveTo(w * 0.25 + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 40, w * 0.25 + (Math.random() > 0.5 ? 150 : -150), y + (Math.random() - 0.5) * 50);
      g.stroke();
    }
    const cx = w * 0.25, cy = h / 2, R = 58;
    const ir = g.createRadialGradient(cx, cy, 6, cx, cy, R);
    ir.addColorStop(0, '#5a3419');
    ir.addColorStop(0.45, '#3e2210');
    ir.addColorStop(0.85, '#27150a');
    ir.addColorStop(1, '#120904');
    g.fillStyle = ir;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      g.strokeStyle = `rgba(${120 + Math.random() * 60},${70 + Math.random() * 40},30,${0.15 + Math.random() * 0.2})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
      g.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
      g.stroke();
    }
    g.fillStyle = '#050302';
    g.beginPath();
    g.arc(cx, cy, 19, 0, Math.PI * 2);
    g.fill();
  });
}

function hairTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#6d6d6d';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w;
      const v = 70 + Math.random() * 130;
      g.strokeStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.35})`;
      g.lineWidth = 0.6 + Math.random() * 1.4;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (Math.random() - 0.5) * 8, h * 0.33, x + (Math.random() - 0.5) * 8, h * 0.66, x + (Math.random() - 0.5) * 10, h);
      g.stroke();
    }
  });
}

// Body texture: u = angle around the body (her left side at u = 0.25, front centre 0.5, her right side
// 0.75, seam at the centre back), v = height 0.9..1.56 m; the neck maps to the top rows (skin).
// mode 'color' paints the saree; 'sheen' and 'rough' paint matching sheen colours and roughness, so the
// neck and neckline shade exactly like her face (silk: strong teal sheen; skin: the face's settings).
const TORSO_Y0 = 0.9, TORSO_Y1 = 1.56;
const NECKLINE = (x) => 1.56 - 0.095 * Math.cos((clamp(x, -0.075, 0.075) / 0.075) * (Math.PI / 2)); // a soft U
function sareeTexture(torsoW, mode = 'color', srgb = true) {
  const sheen = mode === 'sheen', rough = mode === 'rough';
  return canvasTex(mode === 'color' ? 2048 : 512, mode === 'color' ? 1024 : 256, (g, W, H) => {
    const Y = (y) => (1 - (y - TORSO_Y0) / (TORSO_Y1 - TORSO_Y0)) * H;
    // x on the front -> u; the cross-section is a superellipse (x = W * sgnpow(cos(theta), 2/2.4))
    const U = (x, y) => (0.25 + Math.acos(clamp(sgnpow(x / torsoW(y), 1.2), -1, 1)) / (Math.PI * 2)) * W;
    // skin: sheen 0.55 x #ff8a66 and roughness 0.5 like the face (the body material uses sheen 0.85)
    const SKIN = rough ? '#808080' : sheen ? '#a55942' : PALETTE.skin;
    g.fillStyle = rough ? '#999999' : sheen ? '#4fa3a3' : PALETTE.saree;
    g.fillRect(0, 0, W, H);
    const path = (pts) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    };
    if (!sheen && !rough) {
      // silk: a fine horizontal weave
      for (let i = 0; i < 30000; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.022})`;
        g.fillRect(Math.random() * W, Math.random() * H, 3, 1);
      }
      // pallu: a band from her right hip over her left shoulder
      const edge = (side, inset = 0) => {
        const pts = [];
        for (let y = 0.94; y <= 1.535; y += 0.005) {
          const t = (y - 0.94) / 0.56;
          const xc = lerp(-0.16, 0.115, t);
          const hw = lerp(0.062, 0.07, t) - inset;
          pts.push([U(clamp(xc + side * hw, -torsoW(y) + 0.0005, torsoW(y) - 0.0005), y), Y(y)]);
        }
        return pts;
      };
      const a = edge(-1), b = edge(1);
      path([...a, ...b.slice().reverse()]);
      g.closePath();
      const pg = g.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
      pg.addColorStop(0, '#0f5360');
      pg.addColorStop(1, '#0b4550');
      g.fillStyle = pg;
      g.fill();
      // a scatter of tiny gold butis on the pallu
      g.save();
      g.clip();
      g.fillStyle = 'rgba(214,170,80,0.55)';
      for (let yy = 0; yy < H; yy += 26) for (let xx = (yy / 26) % 2 ? 13 : 0; xx < W; xx += 26) {
        g.beginPath();
        g.arc(xx, yy, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      // soft fold shadows running along the drape
      for (let i = 1; i < 5; i++) {
        const f = i / 5;
        g.strokeStyle = 'rgba(0,20,25,0.12)';
        g.lineWidth = 10;
        path(a.map(([x, y], j) => [lerp(x, b[j][0], f), y]));
        g.stroke();
      }
      g.restore();
      // gold zari borders: a solid band with a darker inner rule
      [[-1, a], [1, b]].forEach(([side, pts]) => {
        g.strokeStyle = PALETTE.zari;
        g.lineWidth = 16;
        path(pts);
        g.stroke();
        g.strokeStyle = 'rgba(120,80,20,0.55)';
        g.lineWidth = 2;
        path(edge(side, 0.004));
        g.stroke();
      });
      // back: the pallu falls down behind the left shoulder
      g.fillStyle = PALETTE.sareeDark;
      g.fillRect(W * 0.03, 0, W * 0.2, Y(1.05));
    }
    // skin: the base of the neck all round, and the blouse's U neckline at the front
    g.fillStyle = SKIN;
    g.fillRect(0, 0, W, Y(1.552));
    const nl = [];
    for (let x = -0.075; x <= 0.0751; x += 0.003) nl.push([U(x, NECKLINE(x)), Y(NECKLINE(x))]);
    path([[nl[0][0], 0], ...nl, [nl[nl.length - 1][0], 0]]);
    g.closePath();
    g.fill();
    if (sheen || rough) return;
    // neckline piping in gold
    g.strokeStyle = PALETTE.zari;
    g.lineWidth = 7;
    path(nl);
    g.stroke();
    // name badge: small and dark, high on her left shoulder (on the pallu), well away from the space in
    // front of her chest where the hands sign; a bright badge there hid the hands against it
    const bx = U(0.105, 1.415), by = Y(1.415);
    // the canvas runs right-to-left across her front (u grows toward her right), so draw the badge mirrored
    g.save();
    g.translate(bx, 0);
    g.scale(-1, 1);
    g.translate(-bx, 0);
    g.fillStyle = '#082f36';
    g.strokeStyle = PALETTE.zari;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(bx - 44, by - 14, 88, 28, 5);
    g.fill();
    g.stroke();
    g.fillStyle = '#e6c27a';
    g.font = '700 15px Inter, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MEERA', bx, by + 1);
    g.restore();
  }, srgb);
}

// ---------- body ----------
// Torso, neck, shoulders and both sleeved arms are ONE continuous surface, skinned to a spine and
// the arm bones, so the shoulders round smoothly into the arms and the elbows bend like elbows.
// Torso cross-sections: half-width, front depth and back depth by height (metres): a soft, feminine
// line with a defined waist, bust and gently sloping shoulders.
const TORSO_PROFILE = [
  // y      W      F      B
  [0.88, 0.152, 0.088, 0.096],
  [0.95, 0.146, 0.082, 0.09],
  [1.03, 0.132, 0.075, 0.082],
  [1.1, 0.12, 0.071, 0.078],
  [1.17, 0.126, 0.074, 0.08],
  [1.24, 0.137, 0.078, 0.084],
  [1.31, 0.145, 0.08, 0.087],
  [1.37, 0.151, 0.079, 0.088],
  [1.41, 0.154, 0.074, 0.084],
  [1.445, 0.146, 0.066, 0.074],
  [1.48, 0.13, 0.058, 0.062],
  [1.515, 0.097, 0.053, 0.055],
  [1.55, 0.062, 0.047, 0.048],
  [1.575, 0.05, 0.043, 0.044],
];
// lookup table (1 mm steps): the body field samples this hundreds of thousands of times
const PROF_Y0 = 0.86, PROF_STEP = 0.001, PROF = [];
for (let y = PROF_Y0; y <= 1.6; y += PROF_STEP) PROF.push(profileSpline(TORSO_PROFILE, y));
const _prof = [0, 0, 0];
const profileAt = (y) => {
  // linear interpolation between table rows (a nearest-row lookup leaves 1 mm terraces in the surface)
  const f = clamp((y - PROF_Y0) / PROF_STEP, 0, PROF.length - 1.001), i = Math.floor(f), t = f - i, a = PROF[i], b = PROF[i + 1];
  _prof[0] = a[0] + (b[0] - a[0]) * t;
  _prof[1] = a[1] + (b[1] - a[1]) * t;
  _prof[2] = a[2] + (b[2] - a[2]) * t;
  return _prof;
};
const torsoW = (y) => profileAt(y)[0];
const bustAt = (x, y) => 0.034 * g1(y, 1.29, 0.042) * (g1(x, 0.056, 0.038) + g1(x, -0.056, 0.038));
// front surface z at (x, y), including the bust
function torsoFrontZ(x, y) {
  const [Wd, F] = profileAt(y);
  const c = clamp(x / Wd, -1, 1);
  const s = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(c), 2.4)), 1 / 2.4);
  return (F + bustAt(x, y)) * s;
}
function sdTorso(px, py, pz) {
  const [Wd, F, B] = profileAt(py);
  const D = pz >= 0 ? F + bustAt(px, py) : B;
  const rho = Math.pow(Math.pow(Math.abs(px) / Wd, 2.4) + Math.pow(Math.abs(pz) / D, 2.4), 1 / 2.4);
  const d = (rho - 1) * Math.min(Wd, D) * 0.9;
  // the top closes with a smooth rounding into the neck (a hard cut left a visible rim round the neck)
  return Math.max(-smin(-d, -(py - 1.55), 0.035), 0.87 - py);
}
// her shoulder joints: a little narrower than the classic avatar's (the IK reaches the same palm targets)
const SH_R = new THREE.Vector3(-0.157, 1.446, 0), SH_L = new THREE.Vector3(0.157, 1.446, 0);
const POLE_R = new THREE.Vector3(-0.35, -1, -0.3).normalize(), POLE_L = new THREE.Vector3(0.35, -1, -0.3).normalize();
const SLEEVE = FORE - 0.03; // the sleeve ends just above the wrist bone
// bind pose: arms hanging straight, slightly away from the body (so the mesher keeps them separate)
const ARM_BIND = {
  R: { S: SH_R, d: new THREE.Vector3(-0.36, -1, 0.06).normalize(), pole: POLE_R },
  L: { S: SH_L, d: new THREE.Vector3(0.36, -1, 0.06).normalize(), pole: POLE_L },
};
// Bone frame for an arm segment: y along the bone, x = the elbow's hinge axis (from the pole), so the
// upper arm and forearm share a hinge and the elbow bends cleanly without twisting the sleeve.
function armFrame(origin, boneDir, reachDir, pole) {
  const w = pole.clone().sub(reachDir.clone().multiplyScalar(pole.dot(reachDir)));
  const x = w.lengthSq() > 1e-8 ? w.normalize().cross(reachDir).normalize() : new THREE.Vector3(1, 0, 0);
  const y = boneDir.clone().normalize();
  x.sub(y.clone().multiplyScalar(x.dot(y))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
}
function armBindFrames(side) {
  const { S, d, pole } = ARM_BIND[side];
  const E = S.clone().addScaledVector(d, UPPER);
  return { upper: armFrame(S, d, d, pole), fore: armFrame(E, d, d, pole), E, W: E.clone().addScaledVector(d, SLEEVE) };
}

let BODY = null; // geometry + field, built once
function bodyGeometry() {
  if (BODY) return BODY;
  const arms = ['R', 'L'].map((side) => {
    const { S, d } = ARM_BIND[side];
    const f = armBindFrames(side);
    const s = side === 'R' ? -1 : 1;
    const deltoid = S.clone().addScaledVector(d, 0.04).add(new THREE.Vector3(s * 0.007, -0.004, 0)).toArray(); // rounds the side of the shoulder, not its top
    return { side, s, S: S.toArray(), E: f.E.toArray(), W: f.W.toArray(), deltoid };
  });
  const sdUpper = (a, px, py, pz) => {
    const dx = px - a.deltoid[0], dy = py - a.deltoid[1], dz = pz - a.deltoid[2];
    return smin(sdRoundCone(px, py, pz, a.S, a.E, 0.036, 0.0285), Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.035, 0.024);
  };
  const sdFore = (a, px, py, pz) => sdRoundCone(px, py, pz, a.E, a.W, 0.0282, 0.0232);
  const sdNeck = (px, py, pz) => 0.95 * sdRoundCone(px, py, (pz + 0.012) / 0.9, [0, 1.49, 0], [0, 1.68, 0], 0.046, 0.041); // a slender, near-vertical column; its top sits inside the head
  const trunk = (px, py, pz) => smin(sdTorso(px, py, pz), sdNeck(px, py, pz), 0.035);
  const sdf = (px, py, pz) => {
    let d = trunk(px, py, pz);
    for (const a of arms) {
      if (Math.sign(px) !== a.s && Math.abs(px) > 0.05) continue;
      const arm = smin(sdUpper(a, px, py, pz), sdFore(a, px, py, pz), 0.012);
      // blend into the torso only around the shoulder and armpit: elsewhere arm and body stay apart
      const sx = px - a.S[0], sy = py - a.S[1], sz = pz - a.S[2];
      const k = 0.004 + 0.05 * Math.exp(-(sx * sx + sy * sy + sz * sz) / (2 * 0.065 * 0.065));
      d = smin(d, arm, k);
    }
    return d;
  };
  const { pos, idx } = surfaceNets(sdf, [-0.42, 0.86, -0.12], [0.42, 1.76, 0.16], 0.0034);
  const nrm = projectToSurface(sdf, pos);
  // skin weights (bones: 0 spine, 1 upper R, 2 fore R, 3 upper L, 4 fore L) and texture coordinates
  const n = pos.length / 3;
  const boneIdx = new Float32Array(n * 4), boneW = new Float32Array(n * 4), uv = new Float32Array(n * 2);
  const w = new Float32Array(5);
  const EPS = 0.006, POW = 4;
  for (let v = 0; v < n; v++) {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    w.fill(0);
    w[0] = 1 / Math.pow(Math.max(0, trunk(px, py, pz)) + EPS, POW);
    const a = arms[px < 0 ? 0 : 1], o = px < 0 ? 1 : 3;
    w[o] = 1 / Math.pow(Math.max(0, sdUpper(a, px, py, pz)) + EPS, POW);
    w[o + 1] = 1 / Math.pow(Math.max(0, sdFore(a, px, py, pz)) + EPS, POW);
    const tw = topWeights(w);
    tw.forEach(([k, wt], j) => {
      boneIdx[v * 4 + j] = k;
      boneW[v * 4 + j] = wt;
    });
    // texture: a cylindrical map of the torso (seam at the centre back), the neck in the top (skin) rows,
    // the sleeves in the plain silk at the matching side
    const [Wd, F, B] = profileAt(py);
    const D = pz >= 0 ? F + bustAt(px, py) : B;
    const th = Math.atan2(sgnpow(pz / D, 1.2), sgnpow(px / Wd, 1.2));
    let u = (((0.25 + th / (Math.PI * 2)) % 1) + 1) % 1;
    let vv = clamp((py - TORSO_Y0) / (TORSO_Y1 - TORSO_Y0), 0, 1);
    const armW = tw.reduce((acc, [k, wt]) => acc + (k ? wt : 0), 0);
    const t = smooth(0.35, 0.9, armW);
    u = lerp(u, px > 0 ? 0.25 : 0.75, t);
    vv = lerp(vv, 0.55, t);
    uv[v * 2] = u;
    uv[v * 2 + 1] = vv;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aBoneIdx', new THREE.BufferAttribute(boneIdx, 4));
  geo.setAttribute('aBoneW', new THREE.BufferAttribute(boneW, 4));
  geo.setIndex(idx);
  BODY = { geo, trunk };
  return BODY;
}
// z of the body's front surface at (x, y) (bisection on the field): for jewellery that rests on her
function bodyFrontZ(x, y) {
  const { trunk } = bodyGeometry();
  let lo = -0.05, hi = 0.2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (trunk(x, y, mid) < 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------- dual-quaternion skinning ----------
// Standard (linear) skinning pinches a joint when it bends far, which made folded fingers look snapped.
// Dual-quaternion skinning blends the bones' rigid motions instead of their matrices, so a bent
// knuckle or elbow keeps its round, full shape. Bones are uploaded as dual quaternions (uDQr, uDQd)
// and each vertex blends up to four of them (aBoneIdx, aBoneW).
const DQS_GLSL = (n) => /* glsl */ `
uniform vec4 uDQr[${n}];
uniform vec4 uDQd[${n}];
attribute vec4 aBoneIdx;
attribute vec4 aBoneW;
void dqsBlend(out vec4 r, out vec4 d) {
  ivec4 i = ivec4(aBoneIdx + 0.5);
  vec4 r0 = uDQr[i.x];
  r = r0 * aBoneW.x;
  d = uDQd[i.x] * aBoneW.x;
  vec4 q = uDQr[i.y]; float s = dot(q, r0) < 0.0 ? -aBoneW.y : aBoneW.y; r += q * s; d += uDQd[i.y] * s;
  q = uDQr[i.z]; s = dot(q, r0) < 0.0 ? -aBoneW.z : aBoneW.z; r += q * s; d += uDQd[i.z] * s;
  q = uDQr[i.w]; s = dot(q, r0) < 0.0 ? -aBoneW.w : aBoneW.w; r += q * s; d += uDQd[i.w] * s;
  float l = length(r);
  r /= l;
  d /= l;
}
vec3 dqsRotate(vec4 r, vec3 v) { return v + 2.0 * cross(r.xyz, cross(r.xyz, v) + r.w * v); }
vec3 dqsPoint(vec4 r, vec4 d, vec3 p) { return dqsRotate(r, p) + 2.0 * (r.w * d.xyz - d.w * r.xyz + cross(r.xyz, d.xyz)); }
`;
function dqsUniforms(n) {
  return { uDQr: { value: Array.from({ length: n }, () => new THREE.Vector4(0, 0, 0, 1)) }, uDQd: { value: Array.from({ length: n }, () => new THREE.Vector4()) } };
}
function dqsPatch(mat, n, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDQr = uniforms.uDQr;
    sh.uniforms.uDQd = uniforms.uDQd;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + DQS_GLSL(n))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ vec4 qr, qd; dqsBlend(qr, qd); objectNormal = dqsRotate(qr, objectNormal); }')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 qr, qd; dqsBlend(qr, qd); transformed = dqsPoint(qr, qd, transformed); }');
  };
  mat.customProgramCacheKey = () => 'dqs' + n;
  return mat;
}
// A mesh deformed by dual-quaternion skinning, with matching shadows.
function dqsMesh(geo, baseMat, n) {
  const uniforms = dqsUniforms(n);
  const mesh = new THREE.Mesh(geo, dqsPatch(baseMat.clone(), n, uniforms));
  mesh.customDepthMaterial = dqsPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), n, uniforms);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // deformed on the GPU: the bounds don't follow the bones
  mesh.userData.dq = uniforms;
  return mesh;
}
const _dq = { q: new THREE.Quaternion(), t: new THREE.Vector3(), s: new THREE.Vector3() };
function setDQ(m, r, d) {
  m.decompose(_dq.t, _dq.q, _dq.s);
  const q = _dq.q, t = _dq.t;
  r.set(q.x, q.y, q.z, q.w);
  d.set(0.5 * (q.w * t.x + t.y * q.z - t.z * q.y), 0.5 * (q.w * t.y + t.z * q.x - t.x * q.z), 0.5 * (q.w * t.z + t.x * q.y - t.y * q.x), -0.5 * (t.x * q.x + t.y * q.y + t.z * q.z));
}

// ---------- hands ----------
// Each hand is ONE continuous skinned surface (like real skin), not a stack of rigid pieces:
//   1. the hand is described as a smooth signed-distance field (palm with thumb and little-finger pads,
//      tapered fingers blended into the palm with webbing, the wrist) in a relaxed, open bind pose,
//   2. that field is turned into a seamless mesh (surface nets, vertices projected onto the surface,
//      normals from the field's gradient, so shading is smooth everywhere),
//   3. every vertex is weighted to its own finger's bones (never a neighbour's), with wide, soft
//      blends at the knuckles, and deformed by dual-quaternion skinning, so fingers bend, not break.
// The bones keep the joint layout of buildHand() in avatar.js, which the handshape presets, the
// retargeting and the dataset maths depend on.
const FINGER_DEFS = [
  { x: 0.025, y: 0.09, len: 0.074, r: 0.0079 },
  { x: 0.0085, y: 0.095, len: 0.081, r: 0.0082 },
  { x: -0.0085, y: 0.092, len: 0.076, r: 0.0078 },
  { x: -0.0235, y: 0.084, len: 0.061, r: 0.0069 },
];
const THUMB_LENS = [0.04, 0.031, 0.027];
const THUMB_R = [0.0114, 0.0094, 0.0086];
const fingerR = (d, j) => d.r * (1 - j * 0.09); // radius at joint j (3 = tip)

// skeleton: bones in the same hierarchy / positions as buildHand()
function handBones() {
  const root = new THREE.Bone();
  const fingers = FINGER_DEFS.map((d) => {
    const lens = [d.len * 0.45, d.len * 0.3, d.len * 0.25];
    let parent = root;
    return lens.map((L, j) => {
      const b = new THREE.Bone();
      if (j === 0) b.position.set(d.x, d.y, 0.001);
      else b.position.y = lens[j - 1];
      b.userData.len = L;
      parent.add(b);
      parent = b;
      return b;
    });
  });
  let parent = root;
  const thumb = THUMB_LENS.map((L, j) => {
    const b = new THREE.Bone();
    // (the thumb's root sits 3 mm further forward than in buildHand(), so a thumb folded across the palm
    // rests on the folded fingers instead of sinking into the palm)
    if (j === 0) b.position.set(0.027, 0.02, 0.008);
    else b.position.y = THUMB_LENS[j - 1];
    b.userData.len = L;
    parent.add(b);
    parent = b;
    return b;
  });
  return { root, fingers, thumb };
}

// the relaxed, open pose the surface is modelled in: fingers straight and slightly spread, thumb out
const BIND_SHAPE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.55, 0.15, 0.05];

// --- signed-distance helpers (plain numbers: these run ~10^6 times at load) ---
function sdRoundCone(px, py, pz, a, b, r1, r2) {
  // Inigo Quilez's exact round cone: a sphere of radius r1 at a swept to radius r2 at b
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const ax = x / rx, ay = y / ry, az = z / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
function sdPalm(px, py, pz) {
  // a rounded slab, narrower at the wrist, thicker at the heel
  const hw = lerp(0.0245, 0.0322, smooth(0.0, 0.07, py));
  const ht = lerp(0.0128, 0.0112, smooth(0.02, 0.08, py));
  const r = 0.0085;
  const qx = Math.abs(px - 0.0015) - (hw - r), qy = Math.abs(py - 0.046) - (0.043 - r), qz = Math.abs(pz) - (ht - r);
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
  const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
  let d = outside + Math.min(Math.max(qx, qy, qz), 0) - r;
  d = smin(d, sdEllipsoid(px, py, pz, 0.018, 0.025, 0.005, 0.0135, 0.02, 0.0098), 0.009); // thenar (thumb) pad
  d = smin(d, sdEllipsoid(px, py, pz, -0.019, 0.034, 0.004, 0.011, 0.024, 0.0105), 0.008); // little-finger pad
  // wrist: flattened, tapering into the forearm (the sleeve and bangles cover its lower end)
  d = smin(d, 0.85 * sdRoundCone(px, py, pz / 0.78, [0.0015, -0.055, 0], [0.0015, 0.012, 0], 0.0215, 0.0205), 0.014);
  return d;
}

// Surface nets over the field on a regular grid: one vertex per surface cell, quads across sign changes.
function surfaceNets(sdf, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz);
  const at = (x, y, z) => x + nx * (y + ny * z);
  // Sample in 4x4x4 blocks: if the field at a block's centre says the surface is farther away than the
  // block's half-diagonal, every point in the block has the same sign, so the centre value is used for all.
  const B = 4, reach = B * h * 0.9;
  for (let bz = 0; bz < nz; bz += B) for (let by = 0; by < ny; by += B) for (let bx = 0; bx < nx; bx += B) {
    const c = sdf(min[0] + (bx + 1.5) * h, min[1] + (by + 1.5) * h, min[2] + (bz + 1.5) * h);
    const far = Math.abs(c) > reach;
    for (let z = bz; z < Math.min(nz, bz + B); z++) for (let y = by; y < Math.min(ny, by + B); y++) for (let x = bx; x < Math.min(nx, bx + B); x++) {
      val[at(x, y, z)] = far ? c : sdf(min[0] + x * h, min[1] + y * h, min[2] + z * h);
    }
  }
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (x, y, z) => x + (nx - 1) * (y + (ny - 1) * z);
  const pos = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) {
      corner[c] = val[at(x + (c & 1), y + ((c >> 1) & 1), z + ((c >> 2) & 1))];
      if (corner[c] < 0) neg++;
    }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b];
      if (va < 0 === vb < 0) continue;
      const t = va / (va - vb);
      sx += (a & 1) + t * ((b & 1) - (a & 1));
      sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
      sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
      n++;
    }
    cellVert[cid(x, y, z)] = pos.length / 3;
    pos.push(min[0] + (x + sx / n) * h, min[1] + (y + sy / n) * h, min[2] + (z + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => (flip ? idx.push(a, d, c, a, c, b) : idx.push(a, b, c, a, c, d));
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const v0 = val[at(x, y, z)] < 0;
    if (v0 !== val[at(x + 1, y, z)] < 0) {
      const q = [cellVert[cid(x, y - 1, z - 1)], cellVert[cid(x, y, z - 1)], cellVert[cid(x, y, z)], cellVert[cid(x, y - 1, z)]];
      if (q.every((v) => v >= 0)) quad(...q, !v0);
    }
    if (v0 !== val[at(x, y + 1, z)] < 0) {
      const q = [cellVert[cid(x - 1, y, z - 1)], cellVert[cid(x - 1, y, z)], cellVert[cid(x, y, z)], cellVert[cid(x, y, z - 1)]];
      if (q.every((v) => v >= 0)) quad(...q, !v0);
    }
    if (v0 !== val[at(x, y, z + 1)] < 0) {
      const q = [cellVert[cid(x - 1, y - 1, z)], cellVert[cid(x, y - 1, z)], cellVert[cid(x, y, z)], cellVert[cid(x - 1, y, z)]];
      if (q.every((v) => v >= 0)) quad(...q, !v0);
    }
  }
  return { pos, idx };
}

// Move surface-net vertices onto the surface (one Newton step) and take normals from the gradient.
function projectToSurface(sdf, pos) {
  const e = 0.0004, nrm = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    const d = sdf(x, y, z);
    pos[i] -= (gx / l) * d;
    pos[i + 1] -= (gy / l) * d;
    pos[i + 2] -= (gz / l) * d;
    nrm[i] = gx / l;
    nrm[i + 1] = gy / l;
    nrm[i + 2] = gz / l;
  }
  return nrm;
}

// Keep the n strongest entries of w (a small selection, no sorting: this runs for every vertex).
function topWeights(w, n = 4) {
  const top = [];
  for (let s = 0; s < w.length; s++) {
    if (!(w[s] > 0)) continue;
    let j = top.length;
    while (j > 0 && w[s] > w[top[j - 1]]) j--;
    if (j < n) {
      top.splice(j, 0, s);
      if (top.length > n) top.length = n;
    }
  }
  const sum = top.reduce((acc, k) => acc + w[k], 0) || 1;
  const out = top.map((k) => [k, w[k] / sum]);
  while (out.length < n) out.push([out.length ? out[0][0] : 0, 0]);
  return out;
}

let HAND_GEO = null; // built once, shared by both hands
function handGeometry() {
  if (HAND_GEO) return HAND_GEO;
  // joint positions in the bind pose
  const bones = handBones();
  applyShape(bones, BIND_SHAPE);
  bones.root.updateMatrixWorld(true);
  const P = (o, len = 0) => o.localToWorld(new THREE.Vector3(0, len, 0)).toArray();
  const chains = bones.fingers.map((ch, f) => ({ pts: [...ch.map((b) => P(b)), P(ch[2], ch[2].userData.len)], r: [0, 1, 2, 3].map((j) => fingerR(FINGER_DEFS[f], j)) }));
  const thumb = { pts: [...bones.thumb.map((b) => P(b)), P(bones.thumb[2], THUMB_LENS[2])], r: [THUMB_R[0], THUMB_R[1], THUMB_R[2], THUMB_R[2] * 0.86] };
  const chainSD = (c, px, py, pz) => {
    let d = 1;
    for (let j = 0; j < 3; j++) d = smin(d, sdRoundCone(px, py, pz, c.pts[j], c.pts[j + 1], c.r[j], c.r[j + 1]), 0.0025);
    return d;
  };
  // bounding boxes (grown by the radius) let the field skip fingers that are nowhere near the point
  const box = (pts, grow) => {
    const b = [0, 1, 2].map((k) => [Math.min(...pts.map((p) => p[k])) - grow, Math.max(...pts.map((p) => p[k])) + grow]);
    const x0 = b[0][0], x1 = b[0][1], y0 = b[1][0], y1 = b[1][1], z0 = b[2][0], z1 = b[2][1];
    return (px, py, pz) => {
      const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0, dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0, dz = pz < z0 ? z0 - pz : pz > z1 ? pz - z1 : 0;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
  };
  chains.forEach((c) => (c.box = box(c.pts, c.r[0])));
  thumb.box = box(thumb.pts, thumb.r[0]);
  const palmBox = box([[-0.031, -0.056, -0.022], [0.035, 0.09, 0.022]], 0);
  const FAR = 0.004; // beyond this, only the sign of the field matters to the mesher
  const sdf = (px, py, pz) => {
    let palm = palmBox(px, py, pz);
    if (palm < FAR) palm = sdPalm(px, py, pz);
    let d = palm;
    const tb = thumb.box(px, py, pz);
    if (tb < d + 0.003) d = smin(palm, tb < FAR ? chainSD(thumb, px, py, pz) : tb, 0.012); // the thumb web
    for (const c of chains) {
      const cb = c.box(px, py, pz);
      if (cb > d + 0.002) continue;
      d = Math.min(d, smin(palm, cb < FAR ? chainSD(c, px, py, pz) : cb, 0.0065)); // fingers blend into the palm, not into each other
    }
    return d;
  };
  const all = [...chains.flatMap((c) => c.pts), ...thumb.pts];
  // the grid must contain the whole hand: the thumb reaches well past the palm on the palm side, and a
  // grid that cut it off left an open hole in the thumb
  const min = [Math.min(-0.04, ...all.map((p) => p[0])) - 0.014, -0.056, Math.min(-0.03, ...all.map((p) => p[2])) - 0.014];
  const max = [Math.max(0.05, ...all.map((p) => p[0])) + 0.014, Math.max(...all.map((p) => p[1])) + 0.014, Math.max(0.03, ...all.map((p) => p[2])) + 0.014];
  const { pos, idx } = surfaceNets(sdf, min, max, 0.0014);
  const nrm = projectToSurface(sdf, pos);

  // Skin weights. Bone order: root, index 0-2, middle 0-2, ring 0-2, little 0-2, thumb 0-2.
  // A vertex belongs to its nearest digit and may blend only with that digit's bones and the palm,
  // with a wide soft falloff so each knuckle bends in a smooth curve.
  const digits = [...chains, thumb];
  const segDist = (px, py, pz, a, b) => {
    const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
    const t = clamp(((px - a[0]) * bx + (py - a[1]) * by + (pz - a[2]) * bz) / (bx * bx + by * by + bz * bz), 0, 1);
    const dx = px - a[0] - bx * t, dy = py - a[1] - by * t, dz = pz - a[2] - bz * t;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  const n = pos.length / 3;
  const boneIdx = new Float32Array(n * 4), boneW = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const dorsal = lin(PALETTE.skin), palmC = lin(PALETTE.palm);
  const w = new Float32Array(16);
  const EPS = 0.0022, POW = 4;
  const WRIST = 16; // extra bone: the wrist skin follows the forearm, then bends smoothly into the hand
  for (let v = 0; v < n; v++) {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    // Fingers never share skin with each other (a hard choice of the nearest finger), but the thumb
    // and the palm blend continuously with everything: the web between thumb and index stretches
    // smoothly instead of tearing open when the thumb spreads or folds.
    let best = 0, bestD = 1;
    const segD = digits.map((c, ci) => [0, 1, 2].map((j) => {
      const d = segDist(px, py, pz, c.pts[j], c.pts[j + 1]);
      if (ci < 4 && d - c.r[j] < bestD) (bestD = d - c.r[j]), (best = ci);
      return d;
    }));
    w.fill(0);
    w[0] = 1 / Math.pow(Math.max(0, sdPalm(px, py, pz) + 0.0115) + EPS, POW);
    for (let j = 0; j < 3; j++) w[1 + best * 3 + j] = 1 / Math.pow(segD[best][j] + EPS, POW);
    for (let j = 0; j < 3; j++) w[13 + j] = 1 / Math.pow(segD[4][j] + EPS, POW);
    // the thumb pad (thenar) rides partly on the thumb's base bone, as its muscles do
    const thenar = smooth(0.007, -0.004, sdEllipsoid(px, py, pz, 0.018, 0.025, 0.005, 0.0135, 0.02, 0.0098));
    if (thenar > 0) w[13] += thenar * w[0] * 0.9;    // below the palm the skin belongs to the forearm (fully by 2 cm down), blending to the hand above
    const ww = smooth(-0.004, -0.03, py); // entirely below the palm, so the palm itself stays flat
    let tw = topWeights(w);
    if (ww > 0) tw = [[WRIST, ww], ...tw.map(([k, wt]) => [k, wt * (1 - ww)])].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sw = tw.reduce((acc, e) => acc + e[1], 0) || 1;
    tw.forEach(([k, wt], j) => {
      boneIdx[v * 4 + j] = k;
      boneW[v * 4 + j] = wt / sw;
    });
    // lighter palm side
    const t = smooth(-0.25, 0.65, nrm[v * 3 + 2]);
    col[v * 3] = lerp(dorsal.r, palmC.r, t);
    col[v * 3 + 1] = lerp(dorsal.g, palmC.g, t);
    col[v * 3 + 2] = lerp(dorsal.b, palmC.b, t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aBoneIdx', new THREE.BufferAttribute(boneIdx, 4));
  geo.setAttribute('aBoneW', new THREE.BufferAttribute(boneW, 4));
  geo.setIndex(idx);
  HAND_GEO = geo;
  return geo;
}

export function buildMeeraHand(skinMat, nailMat) {
  const bones = handBones();
  const { root, fingers, thumb } = bones;
  const list = [root, ...fingers.flat(), ...thumb];
  // bind in the pose the surface was modelled in
  applyShape(bones, BIND_SHAPE);
  root.updateMatrixWorld(true);
  const bindInv = list.map((b) => b.matrixWorld.clone().invert());
  const mesh = dqsMesh(handGeometry(), skinMat, list.length + 1); // + the wrist (forearm) bone
  root.add(mesh);
  const U = mesh.userData.dq, rootInv = new THREE.Matrix4(), m = new THREE.Matrix4();
  // call after the bones have moved and their world matrices are current
  const up = new THREE.Vector3(0, 1, 0), fl = new THREE.Vector3(), qs = new THREE.Quaternion(), localInv = new THREE.Matrix4(), m3 = new THREE.Matrix3();
  // foreDir: the forearm's direction (elbow -> wrist) in the hand's parent space
  const update = (foreDir) => {
    rootInv.copy(root.matrixWorld).invert();
    list.forEach((b, i) => {
      m.multiplyMatrices(rootInv, b.matrixWorld).multiply(bindInv[i]);
      setDQ(m, U.uDQr.value[i], U.uDQd.value[i]);
    });
    // wrist bone: turns the hand's own axis onto the forearm's, so the wrist grows straight out of the sleeve
    if (foreDir) {
      fl.copy(foreDir).applyMatrix3(m3.setFromMatrix4(localInv.copy(root.matrix).invert())).normalize();
      qs.setFromUnitVectors(up, fl);
      setDQ(m.makeRotationFromQuaternion(qs), U.uDQr.value[list.length], U.uDQd.value[list.length]);
    }
  };
  // (no nail meshes: plain fingertips, per the client's preference)
  return { root, fingers, thumb, lens: FINGER_DEFS.map((d) => d.len * 0.25), thumbLen: THUMB_LENS[2], mesh, update };
}

// 26 directions tried when separating overlapping hands (see _escape)
const ESCAPE_DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) ESCAPE_DIRS.push(new THREE.Vector3(x, y, z).normalize());

export { bodyGeometry as _bodyGeometry }; // (for measurement tools)
export class MeeraAvatar extends Avatar {
  _buildBody() {
    this.ready = true;
    const body = (this.body = new THREE.Group());
    this.scene.add(body);
    const skinProps = { roughness: 0.5, sheen: 0.55, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff8a66'), clearcoat: 0.06, clearcoatRoughness: 0.5 };
    const skin = (this.skin = new THREE.MeshPhysicalMaterial({ color: PALETTE.skin, ...skinProps }));
    const skinV = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, ...skinProps });
    const nail = new THREE.MeshPhysicalMaterial({ color: PALETTE.nail, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.18 }); // glossy polish
    const silk = new THREE.MeshPhysicalMaterial({ color: PALETTE.saree, roughness: 0.55, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#5fb8b8') });
    const gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1, roughness: 0.28 });
    this.mats = { skin, skinV, nail, silk, gold };

    // body: torso, neck, shoulders and sleeved arms, one skinned surface (bones: spine, upper/fore R, upper/fore L)
    const bodyMat = new THREE.MeshPhysicalMaterial({
      map: sareeTexture(torsoW), sheenColorMap: sareeTexture(torsoW, 'sheen'), sheenColor: new THREE.Color('#ffffff'),
      roughnessMap: sareeTexture(torsoW, 'rough', false), sheen: 0.85, sheenRoughness: 0.45, roughness: 1,
    });
    const bodyMesh = dqsMesh(bodyGeometry().geo, bodyMat, 5);
    body.add(bodyMesh);
    this.torso = bodyMesh;
    this.bodyBind = {};
    for (const s of ['R', 'L']) {
      const f = armBindFrames(s);
      this.bodyBind[s] = { upperInv: f.upper.clone().invert(), foreInv: f.fore.clone().invert() };
    }
    setDQ(new THREE.Matrix4(), bodyMesh.userData.dq.uDQr.value[0], bodyMesh.userData.dq.uDQd.value[0]); // the spine stays put

    // gold chain resting on her skin inside the neckline, with a small pendant
    const chainPts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI - Math.PI / 2; // across the front, from one side of the neck to the other
      const x = Math.sin(a) * 0.05, y = 1.52 - 0.035 * Math.pow(Math.cos(a), 1.5);
      chainPts.push(new THREE.Vector3(x, y, bodyFrontZ(x, y) + 0.0013));
    }
    body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts), 96, 0.0011, 6), gold));
    const pend = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 16, 12), gold);
    const py = chainPts[24].y - 0.0055;
    pend.position.set(0, py, bodyFrontZ(0, py) + 0.0022);
    pend.scale.set(1, 1.3, 0.55);
    body.add(pend);

    this._buildHead(skin);

    // arm bones' holders (the IK places them): the forearm carries the sleeve's gold cuff and the bangles
    const mkUpper = () => {
      const g = new THREE.Group();
      body.add(g);
      return g;
    };
    const mkFore = () => {
      const g = new THREE.Group();
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0243, 0.0243, 0.007, 40, 1, true), gold);
      cuff.position.y = SLEEVE - 0.004;
      g.add(cuff);
      [[0.022, gold], [0.0165, new THREE.MeshPhysicalMaterial({ color: '#8c1026', roughness: 0.2, clearcoat: 1 })], [0.011, gold]].forEach(([d, mat]) => {
        const b = new THREE.Mesh(new THREE.TorusGeometry(0.0258, 0.0019, 10, 40), mat);
        b.rotation.x = Math.PI / 2;
        b.position.y = FORE - d;
        g.add(b);
      });
      body.add(g);
      return g;
    };
    this.arms = {
      R: { upper: mkUpper(), fore: mkFore(), S: SH_R, pole: POLE_R },
      L: { upper: mkUpper(), fore: mkFore(), S: SH_L, pole: POLE_L },
    };    this.hands = { R: buildMeeraHand(skinV, nail), L: buildMeeraHand(skinV, nail) };
    this.hands.L.root.scale.x = -1;
    body.add(this.hands.R.root, this.hands.L.root);
  }

  _buildHead(skin) {
    const headPivot = (this.headPivot = new THREE.Group());
    headPivot.position.set(0, PIVOT_Y, 0);
    this.body.add(headPivot);
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.12, 0);
    headPivot.add(head);
    const root = new THREE.Group(); // face coordinates: origin at eye level
    root.scale.setScalar(HEAD_SCALE);
    root.position.set(0, EYE_UP + NOSE.y * (1 - HEAD_SCALE), NOSE.z * (1 - HEAD_SCALE));
    head.add(root);
    this.faceRoot = root;

    // sculpted face and skull
    const base = sphereGeo(256, 192);
    const bp = base.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setXYZ(i, ...sculptHead(bp.getX(i), bp.getY(i), bp.getZ(i)));
    base.computeVertexNormals();
    const hairSrc = base.clone(); // keeps UVs for the hair strands
    const geo = mergeVertices(base.deleteAttribute('uv').deleteAttribute('normal'), 1e-6);
    geo.computeVertexNormals();
    // Under the jaw, turn the normals toward the neck's (outward from the neck's axis), so the head's
    // underside shades like the neck where the two surfaces meet and the join doesn't show.
    {
      const P0 = geo.attributes.position, N0 = geo.attributes.normal;
      const nz0 = (-0.013 - NOSE.z * (1 - HEAD_SCALE)) / HEAD_SCALE; // neck axis z in face coordinates
      for (let i = 0; i < P0.count; i++) {
        const y = P0.getY(i);
        const t = smooth(-0.088, -0.11, y);
        if (t <= 0) continue;
        const rx = P0.getX(i), rz = P0.getZ(i) - nz0, rl = Math.hypot(rx, rz) || 1;
        const nx = lerp(N0.getX(i), rx / rl, t), ny = lerp(N0.getY(i), 0, t), nzz = lerp(N0.getZ(i), rz / rl, t);
        const l = Math.hypot(nx, ny, nzz) || 1;
        N0.setXYZ(i, nx / l, ny / l, nzz / l);
      }
    }
    // vertex colours: soft blush on the cheeks, a touch of depth around the eyes
    const P = geo.attributes.position, col = [];
    const cSkin = lin(PALETTE.skin), cBlush = lin(PALETTE.blush), cDeep = lin('#7e4a34');
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const front = smooth(0.02, 0.06, z);
      const blush = 0.35 * front * (g2(x, y, 0.042, -0.03, 0.016, 0.013) + g2(x, y, -0.042, -0.03, 0.016, 0.013));
      const deep = 0.18 * front * (g2(x, y, 0.031, 0.009, 0.014, 0.006) + g2(x, y, -0.031, 0.009, 0.014, 0.006));
      const c = cSkin.clone().lerp(cBlush, blush).lerp(cDeep, deep);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // morph targets: 0 smile (cheeks lift), 1 jaw (lower face drops), 2 browUp (forehead lifts)
    const mk = (fn) => {
      const arr = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const [dx, dy, dz] = fn(x, y, z);
        arr[i * 3] = x + dx;
        arr[i * 3 + 1] = y + dy;
        arr[i * 3 + 2] = z + dz;
      }
      return new THREE.Float32BufferAttribute(arr, 3);
    };
    const front = (z) => smooth(0.025, 0.06, z);
    geo.morphAttributes.position = [
      mk((x, y, z) => {
        const w = front(z) * (g2(x, y, 0.036, -0.052, 0.014, 0.014) + g2(x, y, -0.036, -0.052, 0.014, 0.014));
        return [Math.sign(x) * 0.0012 * w, 0.0028 * w, 0.0012 * w];
      }),
      mk((x, y, z) => {
        const w = front(z) * smooth(-0.064, -0.09, y) * g1(x, 0, 0.04);
        return [0, -0.009 * w, -0.003 * w];
      }),
      mk((x, y, z) => {
        const w = front(z) * g1(y, 0.03, 0.012) * g1(x, 0, 0.05);
        return [0, 0.0035 * w, 0];
      }),
    ];
    const face = new THREE.Mesh(geo, this.mats.skinV);
    face.castShadow = true;
    face.receiveShadow = true;
    root.add(face);
    this.faceMesh = face;

    const surfaceZ = (this.surfaceZ = frontSurface(geo));

    this._buildEyes(root, surfaceZ);
    this._buildBrows(root, surfaceZ);
    this._buildMouth(root, surfaceZ);

    // bindi
    const bindi = new THREE.Mesh(new THREE.CircleGeometry(0.003, 24), new THREE.MeshStandardMaterial({ color: PALETTE.bindi, roughness: 0.55 }));
    bindi.position.set(0, 0.031, surfaceZ(0, 0.031) + 0.0006);
    bindi.rotation.x = -0.22;
    root.add(bindi);

    // ears
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), this.mats.skin);
      ear.scale.set(0.0105, 0.029, 0.018);
      ear.position.set(s * 0.0705, -0.012, -0.012);
      ear.rotation.set(0.1, s * 0.35, s * -0.08);
      root.add(ear);
      // gold jhumka: stud, bell and tiny pearl drops
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 14, 10), this.mats.gold);
      stud.position.set(s * 0.0745, -0.037, -0.008);
      root.add(stud);
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.0054, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mats.gold);
      bell.position.set(s * 0.0755, -0.046, -0.008);
      root.add(bell);
      const pearl = new THREE.MeshStandardMaterial({ color: '#f2e6d0', roughness: 0.3 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.001, 8, 6), pearl);
        d.position.set(s * 0.0755 + Math.cos(a) * 0.005, -0.0495, -0.008 + Math.sin(a) * 0.005);
        root.add(d);
      }
    });

    this._buildHair(root, hairSrc);
  }

  _buildEyes(head, surfaceZ) {
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTexture(), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
    const kajal = new THREE.MeshStandardMaterial({ color: '#0a0605', roughness: 0.6 });
    const R = 0.013;
    this.eyes = [];
    this.lids = [];
    [-1, 1].forEach((s) => {
      const ex = s * 0.031, ey = 0;
      const ez = surfaceZ(ex, ey) + 0.0046 - R; // the cornea stands ~4.5 mm proud of the socket so the lids frame the eye
      const eg = new THREE.Group();
      eg.position.set(ex, ey, ez);
      head.add(eg);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), eyeMat);
      eye.scale.set(1.0, 1.0, 1.0);
      eg.add(eye);
      this.eyes.push(eye);
      // lids (skin shells) in an almond-shaped group
      const lidG = new THREE.Group();
      lidG.position.copy(eg.position);
      lidG.scale.set(1.18, 1, 1);
      head.add(lidG);
      const upper = new THREE.Group();
      lidG.add(upper);
      const lidR = R * 1.07;
      upper.add(new THREE.Mesh(new THREE.SphereGeometry(lidR, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.skin));
      // kajal line + lashes along the upper lid edge
      // arcs stop just short of the corners so their ends stay under the skin
      const lash = new THREE.Mesh(new THREE.TorusGeometry(lidR, 0.00075, 6, 40, Math.PI * 0.9), kajal);
      lash.rotation.set(Math.PI / 2, 0, Math.PI * 0.05);
      upper.add(lash);
      const lashes = new THREE.Mesh(new THREE.TorusGeometry(lidR * 1.02, 0.0012, 4, 40, Math.PI * 0.84), kajal);
      lashes.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.08);
      lashes.scale.set(1, 1, 0.6);
      upper.add(lashes);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(lidR * 0.99, 36, 10, 0, Math.PI * 2, Math.PI * 0.64, Math.PI * 0.36), this.mats.skin);
      lidG.add(lower);
      const lowerKajal = new THREE.Mesh(new THREE.TorusGeometry(lidR * Math.sin(Math.PI * 0.64), 0.0005, 6, 40, Math.PI * 0.76), kajal);
      lowerKajal.rotation.set(Math.PI / 2, 0, Math.PI * 0.12);
      lowerKajal.position.y = lidR * Math.cos(Math.PI * 0.64);
      lidG.add(lowerKajal);
      this.lids.push(upper);
    });
  }

  _buildBrows(head, surfaceZ) {
    const mat = new THREE.MeshStandardMaterial({ color: '#150c08', roughness: 0.85 });
    this.brows = [-1, 1].map((s) => {
      const g = new THREE.Group();
      head.add(g);
      const N = 24, M = 8, pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        // quadratic bezier: inner (0.011, 0.036) -> control (0.03, 0.048) -> outer (0.052, 0.036)
        const bx = (1 - t) ** 2 * 0.0125 + 2 * t * (1 - t) * 0.031 + t * t * 0.054;
        const by = (1 - t) ** 2 * 0.0185 + 2 * t * (1 - t) * 0.0305 + t * t * 0.019;
        const x = s * bx, z = surfaceZ(x, by) + 0.0009;
        const r = lerp(0.0024, 0.0008, Math.pow(t, 1.3)) * (t < 0.08 ? 0.6 + 5 * t : 1);
        for (let j = 0; j <= M; j++) {
          const a = (j / M) * Math.PI * 2;
          pos.push(x, by + Math.cos(a) * r, z + Math.sin(a) * r * 0.45);
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1;
        // outward-facing winding depends on which way the tube runs along x
        if (s > 0) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      g.add(m);
      g.userData = { s };
      return g;
    });
  }

  _buildMouth(head, surfaceZ) {
    const W = 0.0235, YM = -0.062;
    const zAt = (x) => surfaceZ(x, YM) + 0.0019;
    const mouth = (this.mouth = new THREE.Group());
    head.add(mouth);
    // interior + teeth, revealed when the lips part
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#2a0c10' }));
    inner.position.set(0, YM, zAt(0) - 0.0005);
    inner.scale.set(W * 0.85, 0.0004, 1);
    mouth.add(inner);
    this.mouthInner = inner;
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(W * 1.1, 0.0035, 0.002), new THREE.MeshStandardMaterial({ color: '#f1ece4', roughness: 0.3 }));
    teeth.position.set(0, YM + 0.0012, zAt(0) - 0.0002);
    teeth.visible = false;
    mouth.add(teeth);
    this.teeth = teeth;
    const lipMat = new THREE.MeshPhysicalMaterial({ color: PALETTE.lip, roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color('#ff9a9a') });
    const lip = (upper) => {
      const N = 40, M = 16, pos = [], idx = [];
      const ry0 = upper ? 0.0039 : 0.0053, rz0 = upper ? 0.0036 : 0.0042;
      const sm = [], opn = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = (t - 0.5) * 2 * W;
        const s = Math.pow(Math.sin(Math.PI * t), 0.55);
        const bow = upper ? 0.0009 * (g1(x, 0.0045, 0.0035) + g1(x, -0.0045, 0.0035)) : 0;
        const yc = YM + (upper ? 1 : -1) * (upper ? ry0 : ry0) * s * 0.85 + bow + 0.0004 * (x / W) ** 2;
        const zc = zAt(x);
        const e = Math.abs(x) / W;
        for (let j = 0; j <= M; j++) {
          const a = (j / M) * Math.PI * 2;
          const px = x, py = yc + Math.cos(a) * ry0 * s, pz = zc + Math.sin(a) * rz0 * s;
          pos.push(px, py, pz);
          sm.push(px + Math.sign(x) * 0.0018 * e * e, py + 0.0026 * e * e, pz - 0.0014 * e * e);
          opn.push(px, py + (upper ? 0.0012 : -0.0055) * (1 - 0.7 * e * e), pz + (upper ? 0 : -0.0012));
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b); // outward-facing (the tube runs along +x)
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.morphAttributes.position = [new THREE.Float32BufferAttribute(sm, 3), new THREE.Float32BufferAttribute(opn, 3)];
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, lipMat);
      mouth.add(m);
      return m;
    };
    this.lips = [lip(true), lip(false)];
  }

  _buildHair(head, src) {
    // hair = the skull surface pushed outward above the hairline; centre parting; low bun with a gajra
    const P = src.attributes.position, N = src.attributes.normal;
    const pos = new Float32Array(P.count * 3);
    const keep = new Uint8Array(P.count);
    const hairline = (az) => {
      const a = Math.abs(az);
      // face coordinates: forehead hairline +0.075, dipping to ear level at the temples, nape at the back
      const K = [[0, 0.077], [0.4, 0.074], [0.75, 0.06], [1.1, 0.035], [1.35, 0.012], [1.8, 0.004], [2.3, -0.045], [Math.PI, -0.085]];
      for (let i = 0; i < K.length - 1; i++) if (a <= K[i + 1][0]) return lerp(K[i][1], K[i + 1][1], smooth(K[i][0], K[i + 1][0], a));
      return -0.085;
    };
    // The shell's offset goes from below the skin (-) to above it (+) across the hairline, so the
    // visible hair edge is where the two surfaces cross: a smooth curve, not stair-stepped triangles.
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const az = Math.atan2(x, z);
      const yh = hairline(az);
      const mask = smooth(yh - 0.012, yh + 0.01, y);
      keep[i] = mask > 0.01 ? 1 : 0;
      let t = -0.003 + 0.0095 * mask + 0.0028 * smooth(0.03, 0.1, y) * mask;
      // centre parting: a fine line of scalp along the midline at the front-top
      if (z > 0.01 && y > 0.05) t -= 0.009 * g1(x, 0, 0.0016) * smooth(0.05, 0.065, y);
      // fuller over and behind the ears (hair swept back to the bun)
      if (Math.abs(az) > 1.2 && Math.abs(az) < 2.7) t += 0.002 * mask;
      pos[i * 3] = x + N.getX(i) * t;
      pos[i * 3 + 1] = y + N.getY(i) * t;
      pos[i * 3 + 2] = z + N.getZ(i) * t;
    }
    const idx = [];
    const I = src.index.array;
    for (let i = 0; i < I.length; i += 3) if (keep[I[i]] || keep[I[i + 1]] || keep[I[i + 2]]) idx.push(I[i], I[i + 1], I[i + 2]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', src.attributes.uv);
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = hairTexture();
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    const hairMat = new THREE.MeshPhysicalMaterial({ color: '#1a100b', map: tex, roughness: 0.36, sheen: 1, sheenColor: new THREE.Color('#6b4a36'), sheenRoughness: 0.28, clearcoat: 0.2, clearcoatRoughness: 0.35 });
    this.hairMat = hairMat;
    const hair = new THREE.Mesh(geo, hairMat);
    hair.castShadow = true;
    head.add(hair);
    // low bun at the nape
    const bunGeo = new THREE.SphereGeometry(1, 40, 28);
    const bp = bunGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const tw = 1 + 0.06 * Math.sin(Math.atan2(y, x) * 5 + z * 3); // twisted coil
      bp.setXYZ(i, x * tw, y * tw, z);
    }
    bunGeo.computeVertexNormals();
    const bun = new THREE.Mesh(bunGeo, hairMat);
    bun.scale.set(0.042, 0.033, 0.03);
    bun.position.set(0, -0.058, -0.1);
    bun.castShadow = true;
    head.add(bun);
    // gajra: a ring of jasmine buds around the bun (it shows when she turns her head)
    const bud = new THREE.SphereGeometry(1, 10, 8);
    const white = new THREE.MeshStandardMaterial({ color: '#f7f2e4', roughness: 0.55 });
    const cream = new THREE.MeshStandardMaterial({ color: '#efe3c0', roughness: 0.55 });
    const leaf = new THREE.MeshStandardMaterial({ color: '#4d7a3a', roughness: 0.6 });
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const m = new THREE.Mesh(bud, i % 10 === 5 ? leaf : i % 3 ? white : cream);
      m.scale.set(0.0036, 0.0062, 0.0036);
      m.position.set(Math.cos(a) * 0.043, -0.058 + Math.sin(a) * 0.034, -0.108);
      m.rotation.z = a - Math.PI / 2;
      head.add(m);
    }
  }

  // ---------- keeping hands clear of the body and of each other ----------
  _keepOutside(p) {
    const MARGIN = 0.022;
    const hc = new THREE.Vector3(0, EYE_Y - 0.003, NOSE.z * (1 - HEAD_SCALE)), hr = new THREE.Vector3(0.074 * HEAD_SCALE + MARGIN, 0.114 * HEAD_SCALE + MARGIN, 0.09 * HEAD_SCALE + MARGIN);
    const d = p.clone().sub(hc);
    if ((d.x / hr.x) ** 2 + (d.y / hr.y) ** 2 + (d.z / hr.z) ** 2 < 1) {
      const zz = Math.sqrt(Math.max(0, 1 - (d.x / hr.x) ** 2 - (d.y / hr.y) ** 2)) * hr.z;
      p.z = hc.z + Math.max(zz, 0.02);
    }
    if (Math.abs(p.x) < 0.16 && p.y > 0.95 && p.y < 1.5) p.z = Math.max(p.z, torsoFrontZ(p.x, p.y) + MARGIN);
    return p;
  }

  _apply() {
    const off = { R: new THREE.Vector3(), L: new THREE.Vector3() };
    const solve = () => {
      for (const s of ['R', 'L']) {
        const st = this.state[s];
        const p = this._keepOutside(st.p.clone()).add(off[s]);
        this._solveArm(this.arms[s], p, st.q, this.hands[s]);
        applyShape(this.hands[s], st.s);
      }
      if (this.noHandCollision) return false;
      this.body.updateMatrixWorld(true);
      return this._handsOverlap();
    };
    for (let it = 0, c = solve(); c && it < 2; it++) {
      const { d, t } = this._escape();
      if (!t) break;
      // world -> body space (the body sways a little)
      const dl = d.clone().applyQuaternion(this.body.quaternion.clone().invert());
      off.R.addScaledVector(dl, -(t / 2 + 0.001));
      off.L.addScaledVector(dl, t / 2 + 0.001);
      c = solve();
    }
    // The separation above is recomputed from scratch every frame and picks one of 26 directions, so it
    // can switch direction or snap on / off between frames: the hands then popped up to 10 cm in a frame.
    // Let the applied separation glide toward it instead (at most 8 mm per frame per hand).
    const cur = (this._sep ||= { R: new THREE.Vector3(), L: new THREE.Vector3() });
    let glided = false;
    for (const s of ['R', 'L']) {
      const step = off[s].clone().sub(cur[s]);
      if (step.length() > 0.008) (step.setLength(0.008)), (glided = true);
      cur[s].add(step);
    }
    if (glided) {
      off.R.copy(cur.R);
      off.L.copy(cur.L);
      solve();
    }
    this._updateSkins();
  }

  // Two-bone IK (the base solver), plus bone frames for the skinned body: y along each bone and a
  // shared elbow hinge from the pole, matching the bind frames, so the sleeve bends without twisting.
  _solveArm(arm, palm, quat, hand) {
    // Two-bone IK where the elbow is free to swing around the shoulder-wrist line (as a real arm's is):
    // for each sign it takes the position that keeps the wrist straightest, so the hand continues the
    // forearm instead of bending at an angle no wrist can make.
    const handY = UPV.clone().applyQuaternion(quat);
    const S = arm.S;
    const W = palm.clone().sub(handY.clone().multiplyScalar(PALM_OFFSET));
    const toW = W.clone().sub(S);
    const dist = clamp(toW.length(), Math.abs(UPPER - FORE) + 0.01, UPPER + FORE - 0.002);
    const u = toW.normalize();
    const cosA = (UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const w0 = arm.pole.clone().sub(u.clone().multiplyScalar(arm.pole.dot(u))).normalize();
    const v0 = new THREE.Vector3().crossVectors(u, w0);
    const Wc = S.clone().addScaledVector(u, dist);
    const sgn = Math.sign(S.x);
    let best = null;
    const handN = new THREE.Vector3(0, 0, 1).applyQuaternion(quat); // palm normal
    // Continuity: while signing, the elbow glides from where it was instead of jumping to whichever
    // position scores best this frame (that jumping made the arms flip around, "breakdance"-like).
    // (resets only when the hand itself jumps, e.g. a pose set directly by a tool)
    const animating = arm.E !== undefined && arm.lastW !== undefined && Wc.distanceTo(arm.lastW) < 0.15; // (fast signing moves the wrist up to ~6 cm a frame)
    if (animating && arm.phiTick !== this._tick) {
      arm.Ebase = arm.E.clone();
      arm.phiTick = this._tick;
    }
    // where the elbow was, expressed on this frame's circle of possible elbow positions
    let base = 0, baseD = Infinity;
    for (let phi = -1.6; phi <= 1.6001; phi += 0.05) {
      const nrm = w0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(v0, Math.sin(phi));
      const E = S.clone().addScaledVector(u, UPPER * cosA).addScaledVector(nrm, UPPER * sinA);
      const f = Wc.clone().sub(E).normalize();
      // wrist bend, split like a real wrist: flexion / extension (toward the palm or the back of the hand)
      // is easy; sideways bending (toward the thumb or little finger) can only go ~25 degrees
      const side = new THREE.Vector3().crossVectors(handY, handN); // the hand's side axis
      const dev = Math.asin(clamp(Math.abs(f.dot(side)), 0, 1));
      const flex = Math.acos(clamp(f.dot(handY), -1, 1));
      let cost = flex * 0.6 + Math.max(0, dev - 0.35) * 4 + dev * 0.5 + 0.35 * Math.abs(phi);
      if (E.y > S.y - 0.04) cost += (E.y - S.y + 0.04) * 20; // elbows stay below the shoulders
      if (E.x * sgn < 0.08) cost += (0.08 - E.x * sgn) * 20; // and out to the side, not in front of the body
      if (E.z < -0.06) cost += (-0.06 - E.z) * 20; // and not pulled far behind her
      if (animating) {
        const dE = E.distanceTo(arm.Ebase);
        if (dE < baseD) (baseD = dE), (base = phi);
        cost += 2.5 * dE; // prefer staying near the current elbow position
      }
      if (!best || cost < best.cost) best = { cost, phi };
    }
    // move toward the best position smoothly: a fraction of the way each frame, never more than ~3 rad/s
    let phi = best.phi;
    if (animating) phi = base + clamp((best.phi - base) * 0.22, -0.05, 0.05);
    {
      const nrm = w0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(v0, Math.sin(phi));
      const E = S.clone().addScaledVector(u, UPPER * cosA).addScaledVector(nrm, UPPER * sinA);
      best = { E, f: Wc.clone().sub(E).normalize(), nrm };
      arm.E = E.clone();
      arm.lastW = Wc.clone();
    }
    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(UPV, best.E.clone().sub(S).normalize());
    arm.fore.position.copy(best.E);
    arm.fore.quaternion.setFromUnitVectors(UPV, best.f);
    hand.root.position.copy(Wc);
    hand.root.quaternion.copy(quat);
    arm.foreDir = best.f;
    arm.T = { upper: armFrame(S, best.E.clone().sub(S), u, best.nrm), fore: armFrame(best.E, best.f, u, best.nrm) };
  }

  _advance(dt) {
    this._tick = (this._tick || 0) + 1; // one tick per animation frame (several solves can happen per frame)
    return super._advance(dt);
  }

  _updateSkins() {
    this.body.updateMatrixWorld(true);
    const U = this.torso.userData.dq, m = new THREE.Matrix4();
    ['R', 'L'].forEach((s, i) => {
      const T = this.arms[s].T, B = this.bodyBind[s];
      if (!T) return;
      setDQ(m.multiplyMatrices(T.upper, B.upperInv), U.uDQr.value[1 + i * 2], U.uDQd.value[1 + i * 2]);
      setDQ(m.multiplyMatrices(T.fore, B.foreInv), U.uDQr.value[2 + i * 2], U.uDQd.value[2 + i * 2]);
      this.hands[s].update(this.arms[s].foreDir);
    });
  }

  _handSpheres(s) {
    const h = this.hands[s];
    const w = (o, v = new THREE.Vector3()) => o.localToWorld(v);
    // sized to her actual hand: the palm is ~25 mm thick, so it is a grid of 12 mm spheres, not one big ball.
    // In pressed-palm signs (namaste) the spheres shrink so the palms meet flat, as real hands press.
    const k = this.frame?.press || this.pressing ? 0.7 : 1;
    const out = [[w(h.root, new THREE.Vector3(0.002, 0.004, 0)), 0.015 * k]];
    for (const y of [0.028, 0.058]) for (const x of [-0.017, 0.0015, 0.02]) out.push([w(h.root, new THREE.Vector3(x, y, 0)), 0.0122 * k]);
    out.push([w(h.root, new THREE.Vector3(0.0015, 0.082, 0)), 0.0115 * k]);
    h.fingers.forEach((ch, f) => {
      ch.forEach((o, j) => out.push([w(o), (j ? 0.0068 : 0.0078) * k]));
      out.push([w(ch[1], new THREE.Vector3(0, 0.012, 0)), 0.0068 * k]);
      out.push([w(ch[2], new THREE.Vector3(0, h.lens[f] * 0.8, 0)), 0.0062 * k]);
    });
    // thumbs rest against each other in contact signs (namaste), so they get slim spheres
    h.thumb.forEach((o, j) => j && out.push([w(o), 0.0055]));
    out.push([w(h.thumb[2], new THREE.Vector3(0, h.thumbLen * 0.8, 0)), 0.005]);
    return out;
  }

  _handsOverlap() {
    const R = this._handSpheres('R'), L = this._handSpheres('L');
    if (R[1][0].distanceTo(L[1][0]) > 0.3) return false;
    for (const [pr, rr] of R) for (const [pl, rl] of L) if (pl.distanceTo(pr) < rr + rl - 0.001) return true;
    return false;
  }

  // Smallest rigid shift of the left hand relative to the right that clears every sphere overlap
  // (per sphere pair, |v + t·d| >= r1 + r2 excludes an interval of t: a quadratic's roots).
  _escape() {
    const R = this._handSpheres('R'), L = this._handSpheres('L');
    const pairs = [];
    for (const [pr, rr] of R) for (const [pl, rl] of L) {
      const v = pl.clone().sub(pr), S = rr + rl;
      if (v.length() < S + 0.12) pairs.push([v, S * S]);
    }
    // Prefer pulling the hands straight apart (along the line between the palms): contact signs like
    // MORE or NAMASTE then keep their fingertips / palms meeting, instead of sliding one hand past the other.
    const axis = L[1][0].clone().sub(R[1][0]).normalize();
    let best = null;
    for (const d of ESCAPE_DIRS) {
      const iv = [];
      for (const [v, S2] of pairs) {
        const b = v.dot(d), disc = b * b - v.lengthSq() + S2;
        if (disc <= 0) continue;
        const q = Math.sqrt(disc), t1 = -b - q, t2 = -b + q;
        if (t2 > 0) iv.push([t1, t2]);
      }
      iv.sort((x, y) => x[0] - y[0]);
      let t = 0;
      for (const [t1, t2] of iv) if (t1 < t && t2 > t) t = t2;
      const cost = t * (1 + 1.5 * (1 - Math.max(0, d.dot(axis))));
      if (!best || cost < best.cost) best = { d, t, cost };
    }
    return best;
  }

  // ---------- life ----------
  _idle(time) {
    const breathe = Math.sin(time * 1.5) * 0.0035;
    this.body.position.y = breathe * 0.4;
    this.body.rotation.y = Math.sin(time * 0.33) * 0.015;
  }

  // Dataset signs carry the signer's face per keyframe ({bs: {ARKit name: 0..1}, head: [pitch, yaw, roll]}).
  _datasetFace(dt) {
    const fr = this.frame;
    const target = fr && !fr.isRest && fr.face?.bs ? fr.face : null;
    const k = 1 - Math.pow(1e-5, dt);
    const cur = (this.ds ||= { bs: {}, head: [0, 0, 0] });
    const names = new Set([...Object.keys(cur.bs), ...Object.keys(target?.bs || {})]);
    for (const n of names) {
      cur.bs[n] = lerp(cur.bs[n] || 0, target?.bs[n] || 0, k);
      if (!target && cur.bs[n] < 0.005) delete cur.bs[n];
    }
    for (let i = 0; i < 3; i++) cur.head[i] = lerp(cur.head[i], (target?.head?.[i] || 0) * 0.6, k);
    cur.active = !!target;
    return cur;
  }

  _animateFace(dt, time, nod, shake) {
    const F = this.face;
    const k = this._faceStep(dt);
    const ds = this._datasetFace(dt);
    const bs = ds.bs;
    const avg = (a, b) => ((bs[a] || 0) + (bs[b] || 0)) / 2;
    // head
    this.headPivot.rotation.x = nod + ds.head[0] + Math.sin(time * 0.7) * 0.012 - F.brow * 0.03;
    this.headPivot.rotation.y = shake + ds.head[1] + Math.sin(time * 0.43) * 0.025;
    this.headPivot.rotation.z = F.tilt * 0.2 + ds.head[2] + Math.sin(time * 0.5) * 0.008;
    // brows: raised for yes/no questions (brow > 0), drawn together for wh-questions (brow < 0)
    const up = clamp(F.brow, 0, 1) + (bs.BrowInnerUp || 0) * 0.8 + avg('BrowOuterUpLeft', 'BrowOuterUpRight') * 0.4;
    const down = clamp(-F.brow, 0, 1) + avg('BrowDownLeft', 'BrowDownRight');
    this.brows.forEach((b) => {
      b.position.y = up * 0.0034 - down * 0.0018;
      b.position.x = b.userData.s * -down * 0.0012;
      b.rotation.z = b.userData.s * (up * 0.05 - down * 0.09);
    });
    this.faceMesh.morphTargetInfluences[2] = clamp(up, 0, 1);
    // eyes: blink, widen, gaze
    const closed = clamp(Math.max(Math.sin(this.blink * Math.PI), 1 - F.eyes, avg('EyeBlinkLeft', 'EyeBlinkRight') * 0.8), 0, 1);
    const wide = clamp(up * 0.25 + avg('EyeWideLeft', 'EyeWideRight') * 0.5, 0, 0.5);
    this.lids.forEach((l) => (l.rotation.x = lerp(-0.56 - wide * 0.4, 1.45, closed)));
    const gz = this.gaze || [0, 0];
    this.eyes.forEach((e) => {
      e.rotation.y = lerp(e.rotation.y, gz[0], k);
      e.rotation.x = lerp(e.rotation.x, gz[1], k);
    });
    // mouth: smile, mouthing while signing, speech while talking
    // The mouth moves only while she is signing (light mouthing, a little more while the voice is on);
    // when her hands are still it closes, even if the spoken reply is still playing.
    let target = 0;
    if (this.busy && !ds.active) target = (0.5 + 0.5 * Math.sin(time * 15)) * (0.5 + 0.5 * Math.sin(time * 6.3)) * (this.talking ? 0.6 : 0.35);
    this.mouthOpen = lerp(this.mouthOpen || 0, target, 1 - Math.pow(1e-4, dt)); // eases shut instead of snapping
    let open = clamp(Math.max(this.mouthOpen, (bs.JawOpen || 0) * 1.3), 0, 1);
    if (open < 0.02) open = 0;
    const smile = clamp(Math.max(F.smile, avg('MouthSmileLeft', 'MouthSmileRight') * 1.2), 0, 1);
    const pucker = clamp(Math.max(bs.MouthPucker || 0, bs.MouthFunnel || 0), 0, 1);
    this.faceMesh.morphTargetInfluences[0] = smile;
    this.faceMesh.morphTargetInfluences[1] = open;
    this.lips.forEach((l) => {
      l.morphTargetInfluences[0] = smile * 0.8;
      l.morphTargetInfluences[1] = open;
    });
    this.mouth.scale.x = 1 - pucker * 0.22;
    this.mouth.position.z = pucker * 0.002;
    this.mouthInner.scale.y = 0.0004 + open * 0.0055;
    this.teeth.visible = open > 0.25;
  }
}
