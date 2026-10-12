import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { shapeArray, REST, buildFrames } from './signs.js';

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const UPV = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
// cubic from 0 to 1 with start / end slopes s0, s1 (0 = at rest, 1 = moving on at constant speed)
const hermite01 = (u, s0, s1) => (u * u * u - 2 * u * u + u) * s0 + (-2 * u * u * u + 3 * u * u) + (u * u * u - u * u) * s1;

export const SHOULDER_R = new THREE.Vector3(-0.19, 1.435, 0);
export const SHOULDER_L = new THREE.Vector3(0.19, 1.435, 0);
const UPPER = 0.285;
const FORE = 0.265;
export const PALM_OFFSET = 0.047; // wrist -> palm centre along finger direction

function orient(f, n) {
  const Y = V3(f).normalize();
  const Z = V3(n);
  Z.sub(Y.clone().multiplyScalar(Z.dot(Y)));
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).sub(Y.clone().multiplyScalar(Y.z));
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

// ---------- procedural textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A palace-hotel lobby wall, softly out of focus: sandstone, a scalloped Mughal arch behind the
// receptionist (a warm halo that lifts her head and hands off the wall), jaali lattice side panels,
// brass lantern glow and the hotel's signage. Kept muted so the signing hands stay the brightest thing.
function lobbyTexture() {
  const sharp = document.createElement('canvas');
  sharp.width = 2048;
  sharp.height = 1024;
  const g = sharp.getContext('2d'), w = 2048, h = 1024;
  const cx = w / 2;
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#2a1b1a');
  base.addColorStop(0.5, '#3a2620');
  base.addColorStop(1, '#2c1d17');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // sandstone blocks
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 2;
  for (let y = 0; y < h; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
    for (let x = (y / 64) % 2 ? 0 : 90; x < w; x += 180) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 64);
      g.stroke();
    }
  }
  // scalloped arch: outline path
  const arch = (x0, top, half, bottom) => {
    g.beginPath();
    g.moveTo(x0 - half, bottom);
    g.lineTo(x0 - half, top + half * 0.9);
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      const px = x0 + Math.cos(a) * half, py = top + half * 0.9 + Math.sin(a) * half * 0.95;
      if (i) g.quadraticCurveTo((px + g._lx) / 2 + Math.cos(a - Math.PI / n / 2) * 18, (py + g._ly) / 2 + Math.sin(a - Math.PI / n / 2) * 18, px, py);
      g._lx = px;
      g._ly = py;
    }
    g.lineTo(x0 + half, bottom);
  };
  // halo inside the central arch
  arch(cx, 150, 250, h);
  g.save();
  g.clip();
  // deep, cool niche: brown skin reads best against a dark, low-saturation ground
  g.fillStyle = 'rgba(18,16,30,0.72)';
  g.fillRect(0, 0, w, h);
  const halo = g.createRadialGradient(cx, 420, 60, cx, 470, 420);
  halo.addColorStop(0, 'rgba(70,80,110,0.28)');
  halo.addColorStop(0.7, 'rgba(40,40,70,0.1)');
  halo.addColorStop(1, 'rgba(200,140,80,0.1)');
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  g.restore();
  arch(cx, 150, 250, h);
  g.strokeStyle = 'rgba(222,178,104,0.45)';
  g.lineWidth = 7;
  g.stroke();
  arch(cx, 128, 276, h);
  g.strokeStyle = 'rgba(222,178,104,0.18)';
  g.lineWidth = 3;
  g.stroke();
  // side arches with jaali lattice
  for (const sx of [cx - 620, cx + 620]) {
    arch(sx, 230, 170, h);
    g.save();
    g.clip();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(230,180,110,0.22)';
    g.lineWidth = 3;
    for (let y = 200; y < h; y += 34) for (let x = sx - 180; x < sx + 180; x += 34) {
      g.beginPath();
      g.moveTo(x + 17, y);
      g.lineTo(x + 34, y + 17);
      g.lineTo(x + 17, y + 34);
      g.lineTo(x, y + 17);
      g.closePath();
      g.stroke();
    }
    g.restore();
    arch(sx, 230, 170, h);
    g.strokeStyle = 'rgba(222,178,104,0.3)';
    g.lineWidth = 5;
    g.stroke();
  }
  // brass lanterns: warm glow high up
  for (const [x, y, r] of [[cx - 380, 120, 70], [cx + 380, 120, 70], [cx - 880, 150, 60], [cx + 880, 150, 60], [cx - 1000, 420, 90], [cx + 1000, 420, 90]]) {
    const b = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    b.addColorStop(0, 'rgba(255,214,150,0.75)');
    b.addColorStop(0.18, 'rgba(255,180,100,0.35)');
    b.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = b;
    g.beginPath();
    g.arc(x, y, r * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  // signage to her right (viewer's left)
  g.textAlign = 'center';
  g.fillStyle = 'rgba(236,196,128,0.62)';
  g.font = '600 46px "Cormorant Garamond", Georgia, serif';
  g.fillText('K E S A R   P A L A C E', cx - 620, 420);
  g.font = '500 30px "Nirmala UI", "Noto Sans Devanagari", sans-serif';
  g.fillStyle = 'rgba(236,196,128,0.5)';
  g.fillText('केसर पैलेस', cx - 620, 468);
  g.font = '400 18px Inter, sans-serif';
  g.fillText('J A I P U R', cx - 620, 505);
  // soft depth of field
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const o = out.getContext('2d');
  o.filter = 'blur(5px)';
  o.drawImage(sharp, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function woodTexture() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#3d1f14';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = `rgba(${20 + Math.random() * 40},${10 + Math.random() * 20},5,${0.15 + Math.random() * 0.25})`;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6);
      g.stroke();
    }
  });
}

// Profile of the torso lathe (radius, y)
const TORSO = [[0.001, 0.88], [0.15, 0.88], [0.163, 1.0], [0.168, 1.12], [0.183, 1.25], [0.19, 1.33], [0.186, 1.39], [0.163, 1.435], [0.115, 1.47], [0.062, 1.488], [0.001, 1.492]];

function yToV(y) {
  for (let i = 0; i < TORSO.length - 1; i++) {
    const [, y0] = TORSO[i], [, y1] = TORSO[i + 1];
    if (y >= y0 && y <= y1) return (i + (y - y0) / (y1 - y0)) / (TORSO.length - 1);
  }
  return y < TORSO[0][1] ? 0 : 1;
}

function uniformTexture() {
  return canvasTex(2048, 1024, (g, w, h) => {
    const Y = (y) => (1 - yToV(y)) * h; // canvas row for a body height
    const U = (u) => u * w;
    g.fillStyle = '#1d2740';
    g.fillRect(0, 0, w, h);
    // fabric noise
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // shirt V
    g.fillStyle = '#f3f1ec';
    g.beginPath();
    g.moveTo(U(0.435), Y(1.49));
    g.lineTo(U(0.565), Y(1.49));
    g.lineTo(U(0.5), Y(1.26));
    g.closePath();
    g.fill();
    // gold scarf knot
    g.fillStyle = '#c9a24a';
    g.beginPath();
    g.moveTo(U(0.475), Y(1.45));
    g.lineTo(U(0.525), Y(1.45));
    g.lineTo(U(0.508), Y(1.33));
    g.lineTo(U(0.492), Y(1.33));
    g.closePath();
    g.fill();
    // lapels
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(U(0.425), Y(1.49));
    g.lineTo(U(0.5), Y(1.24));
    g.lineTo(U(0.575), Y(1.49));
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(U(0.41), Y(1.47));
    g.lineTo(U(0.455), Y(1.33));
    g.moveTo(U(0.59), Y(1.47));
    g.lineTo(U(0.545), Y(1.33));
    g.stroke();
    // buttons
    [1.17, 1.06].forEach((y) => {
      g.fillStyle = '#d8b464';
      g.beginPath();
      g.arc(U(0.5), Y(y), 9, 0, Math.PI * 2);
      g.fill();
    });
    // name badge on avatar's left chest
    const bx = U(0.575), by = Y(1.36);
    g.fillStyle = '#d8b464';
    g.fillRect(bx - 50, by - 16, 100, 32);
    g.fillStyle = '#1d2740';
    g.font = '700 20px Inter, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ARIA', bx, by + 1);
  });
}

// ---------- hand ----------
export function buildHand(skin, nail) {
  const root = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skin);
  palm.scale.set(0.04, 0.052, 0.0165);
  palm.position.set(0.002, 0.046, 0);
  palm.castShadow = true;
  root.add(palm);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
  heel.scale.set(0.028, 0.026, 0.016);
  heel.position.set(0.012, 0.018, 0.003);
  root.add(heel);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.023, 0.05, 20), skin);
  wrist.scale.z = 0.8;
  wrist.position.y = -0.012;
  root.add(wrist);

  const defs = [
    { x: 0.025, y: 0.09, len: 0.074, r: 0.0087 },
    { x: 0.0085, y: 0.095, len: 0.081, r: 0.0091 },
    { x: -0.0085, y: 0.092, len: 0.076, r: 0.0087 },
    { x: -0.0235, y: 0.084, len: 0.061, r: 0.0077 },
  ];
  const fingers = defs.map((d) => {
    const lens = [d.len * 0.45, d.len * 0.3, d.len * 0.25];
    const joints = [];
    let parent = root;
    lens.forEach((L, j) => {
      const g = new THREE.Group();
      if (j === 0) g.position.set(d.x, d.y, 0.001);
      else g.position.y = lens[j - 1];
      parent.add(g);
      const rr = d.r * (1 - j * 0.1);
      const geo = new THREE.CapsuleGeometry(rr, Math.max(0.002, L - rr), 6, 14);
      geo.translate(0, L / 2, 0);
      const m = new THREE.Mesh(geo, skin);
      m.scale.z = 0.9;
      m.castShadow = true;
      g.add(m);
      if (j === 2) {
        const nl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), nail);
        nl.scale.set(rr * 0.8, rr * 1.15, rr * 0.3);
        nl.position.set(0, L * 0.72, -rr * 0.72);
        g.add(nl);
      }
      joints.push(g);
      parent = g;
    });
    return joints;
  });

  // thumb
  const tLens = [0.04, 0.031, 0.027];
  const thumb = [];
  let parent = root;
  tLens.forEach((L, j) => {
    const g = new THREE.Group();
    if (j === 0) g.position.set(0.027, 0.02, 0.005);
    else g.position.y = tLens[j - 1];
    parent.add(g);
    const rr = [0.0125, 0.0105, 0.0095][j];
    const geo = new THREE.CapsuleGeometry(rr, L - rr, 6, 14);
    geo.translate(0, L / 2, 0);
    const m = new THREE.Mesh(geo, skin);
    m.castShadow = true;
    if (j === 0) m.scale.set(1.25, 1, 1.1);
    g.add(m);
    if (j === 2) {
      const nl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), nail);
      nl.scale.set(rr * 0.8, rr * 1.1, rr * 0.3);
      nl.position.set(0, L * 0.7, -rr * 0.72);
      g.add(nl);
    }
    thumb.push(g);
    parent = g;
  });
  return { root, fingers, thumb };
}

const MAXB = [1.55, 1.75, 1.2];
const SPREAD = [-0.2, -0.065, 0.075, 0.21];
export function applyShape(hand, a) {
  for (let f = 0; f < 4; f++) {
    for (let j = 0; j < 3; j++) hand.fingers[f][j].rotation.x = a[f * 3 + j] * MAXB[j];
    hand.fingers[f][0].rotation.z = SPREAD[f] * a[12];
  }
  const [ta, to, tc] = [a[13], a[14], a[15]];
  hand.thumb[0].rotation.set(0.3 + to * 0.5, 0, -0.4 - ta * 0.95 + to * 1.25, 'XYZ');
  hand.thumb[1].rotation.x = tc * 0.7 + to * 0.15;
  hand.thumb[2].rotation.x = tc * 1.05;
}

// ---------- the avatar ----------
export class Avatar {
  constructor(container) {
    this.container = container;
    this.speed = 1;
    this.queue = [];
    this.frame = null;
    this.talking = false;
    this.clock = new THREE.Clock();
    this.face = { brow: 0, smile: 0.25, tilt: 0, eyes: 1 };
    this.faceTarget = { brow: 0, smile: 0.25, tilt: 0, eyes: 1 };
    this.nextBlink = 2;
    this.blink = 0;
    this._initScene();
    this._buildBody();
    const rest = this._poseState(REST);
    this.state = rest;
    this._apply();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initScene() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#1f1614');
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.fog = new THREE.Fog('#1f1614', 4, 9);

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);

    const key = new THREE.DirectionalLight('#ffe3c4', 2.4);
    key.position.set(-1.4, 2.6, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1;
    key.shadow.camera.right = 1;
    key.shadow.camera.top = 2;
    key.shadow.camera.bottom = 0.5;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    scene.add(key);
    const fill = new THREE.DirectionalLight('#c9d8ff', 0.7);
    fill.position.set(1.8, 1.6, 1.8);
    scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffd08a', 1.6);
    rim.position.set(0.5, 2.2, -2);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight('#fff4e6', '#2a2018', 0.35));

    // backdrop
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshBasicMaterial({ map: lobbyTexture() }));
    back.position.set(0, 1.55, -1.6);
    scene.add(back);

    // desk
    const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4ae62', metalness: 1, roughness: 0.28 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.62), wood);
    top.position.set(0, 0.955, 0.43);
    top.receiveShadow = true;
    scene.add(top);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.012, 0.012), gold);
    trim.position.set(0, 0.93, 0.745);
    scene.add(trim);
    const front = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.04), wood);
    front.position.set(0, 0.63, 0.72);
    scene.add(front);
    // brass inlay along the desk front
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.006, 0.004), gold);
    inlay.position.set(0, 0.86, 0.742);
    scene.add(inlay);
    // brass service bell (her left, the viewer's right)
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.036, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    bell.position.set(0.46, 0.985, 0.5);
    bell.castShadow = true;
    scene.add(bell);
    const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.01, 32), gold);
    bellBase.position.set(0.46, 0.985, 0.5);
    scene.add(bellBase);
    // brass diya with a flame
    const brass2 = gold.clone();
    brass2.side = THREE.DoubleSide;
    const diya = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), brass2);
    diya.scale.set(1, 0.6, 0.75);
    diya.position.set(0.34, 1.0, 0.56);
    scene.add(diya);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffcf6a' }));
    flame.scale.set(0.7, 1.8, 0.7);
    flame.position.set(0.355, 1.018, 0.56);
    scene.add(flame);
    this.flame = flame;
    const glow = new THREE.PointLight('#ffb35c', 0.35, 0.6, 2);
    glow.position.set(0.355, 1.05, 0.58);
    scene.add(glow);
    // marigold urli (her right, the viewer's left)
    const urli = new THREE.Mesh(new THREE.SphereGeometry(0.1, 40, 12, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), brass2);
    urli.scale.set(1, 0.5, 1);
    urli.position.set(-0.5, 1.02, 0.48);
    scene.add(urli);
    const petalMats = ['#f39a1d', '#f7b52c', '#e8751a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, r = 0.018 + (i % 5) * 0.013;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 10), petalMats[i % 3]);
      m.scale.y = 0.6;
      m.position.set(-0.5 + Math.cos(a) * r, 0.99, 0.48 + Math.sin(a) * r);
      scene.add(m);
    }

    this.resize = () => {
      const w = this.container.clientWidth || 1, hgt = this.container.clientHeight || 1;
      r.setSize(w, hgt, false);
      const aspect = w / hgt;
      this.camera.aspect = aspect;
      // frame head + signing space in the upper ~70% of the view (captions sit below)
      const needH = 1.2, needW = 0.95;
      const fov = THREE.MathUtils.degToRad(this.camera.fov);
      const distH = needH / 2 / Math.tan(fov / 2);
      const distW = needW / 2 / (Math.tan(fov / 2) * aspect);
      const d = Math.max(distH, distW);
      const cy = 1.93 - d * Math.tan(fov / 2); // keep the top of the frame just above her head
      this.camera.position.set(0, cy + 0.05, 0.12 + d);
      this.camera.lookAt(0, cy, 0.12);
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(this.resize).observe(this.container);
    this.resize();
  }

  _buildBody() {
    const skin = (this.skin = new THREE.MeshPhysicalMaterial({ color: '#c68c69', roughness: 0.52, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ff9f84'), clearcoat: 0.06, clearcoatRoughness: 0.6 }));
    const nail = new THREE.MeshPhysicalMaterial({ color: '#e4b3a3', roughness: 0.25, clearcoat: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#1d2740', roughness: 0.78 });
    const shirt = new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.7 });
    const hairMat = new THREE.MeshPhysicalMaterial({ color: '#23150e', roughness: 0.45, sheen: 1, sheenColor: new THREE.Color('#6b4630'), sheenRoughness: 0.35 });
    const body = (this.body = new THREE.Group());
    this.scene.add(body);

    // torso
    const torsoGeo = new THREE.LatheGeometry(TORSO.map(([x, y]) => new THREE.Vector2(x, y)), 64, Math.PI);
    torsoGeo.scale(1, 1, 0.62);
    const torso = new THREE.Mesh(torsoGeo, new THREE.MeshStandardMaterial({ map: uniformTexture(), roughness: 0.75 }));
    torso.castShadow = true;
    body.add(torso);
    this.torso = torso;
    [SHOULDER_R, SHOULDER_L].forEach((s) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.048, 24, 16), cloth);
      d.position.copy(s).add(new THREE.Vector3(Math.sign(s.x) * -0.012, 0.006, 0));
      d.scale.set(1, 0.95, 0.95);
      body.add(d);
    });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.035, 32, 1, true), shirt);
    collar.scale.set(1, 1.6, 0.9);
    collar.position.set(0, 1.505, -0.004);
    body.add(collar);

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.12, 24), skin);
    neck.position.set(0, 1.53, -0.005);
    body.add(neck);
    const headPivot = (this.headPivot = new THREE.Group());
    headPivot.position.set(0, 1.57, 0);
    body.add(headPivot);
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.12, 0);
    headPivot.add(head);

    const hg = new THREE.SphereGeometry(0.1, 72, 54);
    const pos = hg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const yn = y / 0.1;
      if (yn < 0.15) {
        const t = (0.15 - yn) / 1.15;
        x *= 1 - 0.36 * t * t;
        z *= 1 - 0.12 * t * t;
      }
      if (z > 0 && yn < 0.35 && yn > -0.85) z *= 1.05;
      if (z < 0) z *= 1.06;
      // cheekbones
      if (z > 0.03 && Math.abs(yn + 0.05) < 0.3) x *= 1.02;
      const X = x * 0.86, Y = y * 1.13;
      // eye sockets
      for (const ex of [-0.033, 0.033]) {
        const d = Math.hypot(X - ex, (Y - 0.017) * 1.3);
        if (z > 0 && d < 0.024) z -= 0.011 * Math.pow(1 - (d / 0.024) ** 2, 2);
      }
      pos.setXYZ(i, X, Y, z);
    }
    hg.computeVertexNormals();
    const skull = new THREE.Mesh(hg, skin);
    skull.castShadow = true;
    head.add(skull);

    // ears
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin);
      ear.scale.set(0.011, 0.025, 0.017);
      ear.position.set(s * 0.083, 0.0, -0.008);
      head.add(ear);
    });

    // eyes
    const white = new THREE.MeshPhysicalMaterial({ color: '#f4f0ea', roughness: 0.15, clearcoat: 1 });
    const iris = new THREE.MeshPhysicalMaterial({ color: '#4a2c17', roughness: 0.2, clearcoat: 1 });
    const pupil = new THREE.MeshBasicMaterial({ color: '#0a0604' });
    const lash = new THREE.MeshStandardMaterial({ color: '#140c08', roughness: 0.6 });
    this.eyes = [];
    this.lids = [];
    [-1, 1].forEach((s) => {
      const eg = new THREE.Group();
      eg.position.set(s * 0.033, 0.017, 0.078);
      head.add(eg);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0128, 24, 16), white);
      eg.add(eye);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.0079, 20, 12), iris);
      ir.scale.z = 0.45;
      ir.position.z = 0.0103;
      eg.add(ir);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(0.0031, 16), pupil);
      pu.position.z = 0.0137;
      eg.add(pu);
      this.eyes.push(eg);
      const lidG = new THREE.Group();
      lidG.position.copy(eg.position);
      head.add(lidG);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin);
      lidG.add(lid);
      const lashes = new THREE.Mesh(new THREE.TorusGeometry(0.0138, 0.0011, 6, 24, Math.PI), lash);
      lashes.rotation.x = Math.PI / 2;
      lidG.add(lashes);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0136, 24, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), skin);
      lidG.add(lower);
      this.lids.push(lidG);
    });

    // brows
    const browMat = new THREE.MeshStandardMaterial({ color: '#23150e', roughness: 0.7 });
    this.brows = [-1, 1].map((s) => {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.0026, 0.026, 4, 8), browMat);
      b.rotation.z = Math.PI / 2 + s * -0.12;
      b.scale.z = 0.7;
      b.position.set(s * 0.034, 0.04, 0.088);
      b.userData = { s, y: 0.04 };
      head.add(b);
      return b;
    });

    // nose
    const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.03, 4, 12), skin);
    bridge.position.set(0, 0.0, 0.093);
    bridge.rotation.x = 0.28;
    head.add(bridge);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 16, 12), skin);
    tip.scale.set(1, 0.82, 0.9);
    tip.position.set(0, -0.019, 0.1);
    head.add(tip);
    [-1, 1].forEach((s) => {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 12, 10), skin);
      n.position.set(s * 0.0095, -0.022, 0.093);
      head.add(n);
    });

    // mouth
    const lipMat = new THREE.MeshPhysicalMaterial({ color: '#a4555a', roughness: 0.35, clearcoat: 0.4 });
    const mouth = (this.mouth = new THREE.Group());
    mouth.position.set(0, -0.047, 0.087);
    head.add(mouth);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: '#2a0d0f' }));
    inner.scale.set(0.014, 0.002, 0.006);
    inner.position.z = -0.001;
    mouth.add(inner);
    this.mouthInner = inner;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.0048, 0.024, 4, 12), lipMat);
    upper.rotation.z = Math.PI / 2;
    upper.scale.z = 0.75;
    upper.position.y = 0.0035;
    mouth.add(upper);
    this.lowerLips = [-1, 1].map((s) => {
      const g = new THREE.Group();
      mouth.add(g);
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.0056, 0.011, 4, 10), lipMat);
      l.rotation.z = Math.PI / 2;
      l.scale.z = 0.8;
      l.position.x = s * 0.0065;
      g.add(l);
      g.userData.s = s;
      return g;
    });
    this.upperLip = upper;

    // hair
    const cap = new THREE.SphereGeometry(0.108, 64, 40, 0, Math.PI * 2, 0, 1.95);
    const cp = cap.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setXYZ(i, cp.getX(i) * 0.9, cp.getY(i) * 1.12, cp.getZ(i) * (cp.getZ(i) < 0 ? 1.08 : 1.0));
    cap.computeVertexNormals();
    const hair = new THREE.Mesh(cap, hairMat);
    hair.rotation.x = -1.12; // tilt the cap back so the hairline sits on the forehead
    hair.position.set(0, 0.006, -0.006);
    hair.castShadow = true;
    head.add(hair);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.046, 32, 20), hairMat);
    bun.position.set(0, 0.035, -0.118);
    bun.scale.set(1, 0.9, 0.85);
    head.add(bun);
    [-1, 1].forEach((s) => {
      const side = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), hairMat);
      side.scale.set(0.02, 0.055, 0.05);
      side.position.set(s * 0.086, 0.03, -0.02);
      head.add(side);
    });

    // arms
    const mkLimb = (r0, r1, len, mat, cuff) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 24), mat);
      m.position.y = len / 2;
      m.castShadow = true;
      g.add(m);
      if (cuff) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r1 * 0.88, r1 * 0.92, 0.022, 24), shirt);
        c.position.y = len + 0.008;
        g.add(c);
      }
      const j = new THREE.Mesh(new THREE.SphereGeometry(r0, 20, 14), mat);
      g.add(j);
      body.add(g);
      return g;
    };
    this.arms = {
      R: { upper: mkLimb(0.041, 0.036, UPPER, cloth), fore: mkLimb(0.035, 0.029, FORE - 0.03, cloth, true), S: SHOULDER_R, pole: new THREE.Vector3(-0.35, -1, -0.3).normalize() },
      L: { upper: mkLimb(0.041, 0.036, UPPER, cloth), fore: mkLimb(0.035, 0.029, FORE - 0.03, cloth, true), S: SHOULDER_L, pole: new THREE.Vector3(0.35, -1, -0.3).normalize() },
    };
    this.hands = { R: buildHand(skin, nail), L: buildHand(skin, nail) };
    this.hands.L.root.scale.x = -1;
    body.add(this.hands.R.root, this.hands.L.root);
  }

  _handState(q) {
    // h is a handshape name, or 16 raw numbers from a dataset sign
    return { p: V3(q.p), q: orient(q.f, q.n), s: Array.isArray(q.h) ? q.h.slice() : shapeArray(q.h) };
  }
  _poseState(fr) {
    return { R: this._handState(fr.R || REST.R), L: this._handState(fr.L || REST.L) };
  }

  _solveArm(arm, palm, quat, hand) {
    const Y = UPV.clone().applyQuaternion(quat);
    const W = palm.clone().sub(Y.multiplyScalar(PALM_OFFSET));
    const S = arm.S;
    const d = W.clone().sub(S);
    const dist = clamp(d.length(), Math.abs(UPPER - FORE) + 0.01, UPPER + FORE - 0.002);
    const u = d.normalize();
    const cosA = (UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const w = arm.pole.clone().sub(u.clone().multiplyScalar(arm.pole.dot(u))).normalize();
    const Eb = S.clone().add(u.clone().multiplyScalar(UPPER * cosA)).add(w.multiplyScalar(UPPER * sinA));
    const Wc = S.clone().add(u.clone().multiplyScalar(dist));
    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(UPV, Eb.clone().sub(S).normalize());
    arm.fore.position.copy(Eb);
    arm.fore.quaternion.setFromUnitVectors(UPV, Wc.clone().sub(Eb).normalize());
    hand.root.position.copy(Wc);
    hand.root.quaternion.copy(quat);
  }

  _apply() {
    ['R', 'L'].forEach((side) => {
      const st = this.state[side];
      this._solveArm(this.arms[side], st.p, st.q, this.hands[side]);
      applyShape(this.hands[side], st.s);
    });
  }

  // ---------- public API ----------
  play(tokens, { onGloss, onDone } = {}) {
    this.queue = buildFrames(tokens);
    this.onGloss = onGloss;
    this.onDone = onDone;
    this.lastGi = -1;
    this.endVel = null; // a new reply starts from wherever the hands are, at rest
    this._next();
  }
  stop() {
    this.queue = [];
    this.frame = null;
    this._toRest();
  }
  setTalking(v) {
    this.talking = v;
  }
  get busy() {
    return !!this.frame && !this.frame.isRest;
  }

  // Motion between keyframes is a cubic Hermite spline per hand: the palm leaves each keyframe with
  // the velocity it arrived with and heads for the next one (Catmull-Rom tangents), so continuous
  // movements flow instead of stopping at every keyframe. Keyframes with a hold end at rest.
  _segment(to, t, hold, next) {
    const from = this._clone(this.state);
    const prev = this.frame;
    const flowing = prev && !prev.isRest && (prev.hold || 0) < 0.02 && this.endVel;
    const seg = { from, to, t, m0: {}, m1: {}, s0: 0, s1: 0 };
    const endVel = {};
    for (const sd of ['R', 'L']) {
      const v0 = flowing ? this.endVel[sd] : new THREE.Vector3();
      seg.m0[sd] = v0.clone().multiplyScalar(t);
      let v1 = new THREE.Vector3();
      if (next && hold < 0.02) {
        const C = V3((next[sd] || REST[sd]).p);
        v1 = C.sub(from[sd].p).divideScalar(t + Math.max(0.05, next.t || 0.3));
        if (v1.length() > 1.6) v1.setLength(1.6); // m/s
      }
      seg.m1[sd] = v1.clone().multiplyScalar(t);
      endVel[sd] = v1;
      if (v0.length() > 0.02) seg.s0 = 1;
      if (v1.length() > 0.02) seg.s1 = 1;
    }
    this.endVel = endVel;
    return seg;
  }

  _toRest() {
    const seg = this._segment(this._poseState(REST), 0.6, 0, null);
    this.frame = { ...seg, hold: 0, el: 0, isRest: true, face: null };
  }

  _next() {
    const f = this.queue.shift();
    if (!f) {
      this._toRest();
      const cb = this.onDone;
      this.onDone = null;
      cb && cb();
      return;
    }
    if (f.gi !== undefined && f.gi !== this.lastGi) {
      this.lastGi = f.gi;
      this.onGloss && this.onGloss(f.gi, f);
    }
    if (f.letter) this.onGloss && this.onGloss(f.gi, f);
    const seg = this._segment(this._poseState(f), f.t, f.hold || 0, this.queue[0]);
    this.frame = { ...seg, hold: f.hold || 0, el: 0, face: f.face, press: f.press };
    const fc = f.face || {};
    this.faceTarget.brow = fc.brow || 0;
    this.faceTarget.smile = fc.smile ? 0.9 : 0.25;
    this.faceTarget.tilt = fc.tilt || 0;
    this.faceTarget.eyes = fc.eyes ?? 1;
  }

  _clone(s) {
    const c = (h) => ({ p: h.p.clone(), q: h.q.clone(), s: h.s.slice() });
    return { R: c(s.R), L: c(s.L) };
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    const { nod, shake } = this._advance(dt);
    this._idle(time);
    this._apply();
    this._animateFace(dt, time, nod, shake);
    if (this.flame) this.flame.scale.set(0.7 + Math.sin(time * 17) * 0.05, 1.8 + Math.sin(time * 11) * 0.18 + Math.sin(time * 23) * 0.08, 0.7);
    this.renderer.render(this.scene, this.camera);
  }

  // move this.state along the current keyframe; returns head nod / shake for this instant
  _advance(dt) {
    const fr = this.frame;
    let nod = 0, shake = 0;
    if (fr) {
      fr.el += dt * this.speed;
      const u = clamp(fr.el / Math.max(0.01, fr.t), 0, 1);
      const u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      // orientation and handshape follow a matching 0..1 curve (flat where the palm is at rest);
      // handshapes settle a little ahead of the movement, as signers form the shape on the way
      const s = hermite01(u, fr.s0, fr.s1);
      const sh = hermite01(Math.min(1, u * 1.25), fr.s0, fr.s1);
      ['R', 'L'].forEach((sd) => {
        const a = fr.from[sd], b = fr.to[sd], st = this.state[sd];
        st.p.copy(a.p).multiplyScalar(h00).addScaledVector(fr.m0[sd], h10).addScaledVector(b.p, h01).addScaledVector(fr.m1[sd], h11);
        st.q.slerpQuaternions(a.q, b.q, s);
        for (let i = 0; i < 16; i++) st.s[i] = lerp(a.s[i], b.s[i], sh);
      });
      const ph = clamp(fr.el / (fr.t + fr.hold + 0.001), 0, 1);
      if (fr.face?.nod) nod = Math.sin(ph * Math.PI * 2) * 0.09;
      if (fr.face?.shake) shake = Math.sin(ph * Math.PI * 2) * 0.13;
      if (fr.el >= fr.t + fr.hold) {
        if (fr.isRest) this.frame = null;
        else this._next();
      }
    }
    return { nod, shake };
  }

  // idle life: breathing + sway, applied on top
  _idle(time) {
    const breathe = Math.sin(time * 1.6) * 0.004;
    this.body.position.y = breathe * 0.5;
    this.body.rotation.y = Math.sin(time * 0.35) * 0.02;
    this.torso.scale.set(1 + breathe, 1, 1 + breathe * 1.5);
  }

  // ease the expression toward its target and update blink timing; shared by both avatars
  _faceStep(dt) {
    const F = this.face, Tg = this.faceTarget;
    const k = 1 - Math.pow(0.001, dt);
    F.brow = lerp(F.brow, Tg.brow, k);
    F.smile = lerp(F.smile, Tg.smile, k);
    F.tilt = lerp(F.tilt, Tg.tilt, k);
    F.eyes = lerp(F.eyes, Tg.eyes, k);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    if (Math.random() < dt * 0.6) this.gaze = [(Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15];
    return k;
  }

  _animateFace(dt, time, nod, shake) {
    const F = this.face;
    const k = this._faceStep(dt);
    this.headPivot.rotation.x = nod + Math.sin(time * 0.7) * 0.015 - F.brow * 0.03;
    this.headPivot.rotation.y = shake + Math.sin(time * 0.43) * 0.03;
    this.headPivot.rotation.z = F.tilt * 0.22 + Math.sin(time * 0.5) * 0.01;
    this.brows.forEach((b) => {
      b.position.y = b.userData.y + F.brow * 0.004;
      b.rotation.z = Math.PI / 2 + b.userData.s * (-0.12 + F.brow * -0.1);
    });
    // blink
    const closed = Math.max(Math.sin(this.blink * Math.PI), 1 - F.eyes);
    this.lids.forEach((l) => (l.rotation.x = lerp(-0.95, 1.35, closed)));
    // eye saccades
    const gz = this.gaze || [0, 0];
    this.eyes.forEach((e) => {
      e.rotation.y = lerp(e.rotation.y, gz[0], k);
      e.rotation.x = lerp(e.rotation.x, gz[1], k);
    });
    // mouth: speaking/mouthing + smile
    let open = 0;
    if (this.talking || this.busy) open = (0.5 + 0.5 * Math.sin(time * 15)) * (0.5 + 0.5 * Math.sin(time * 6.3)) * (this.talking ? 1 : 0.45);
    this.mouthInner.scale.y = 0.0015 + open * 0.006;
    this.lowerLips.forEach((g) => {
      g.position.y = -0.0045 - open * 0.006;
      g.rotation.z = g.userData.s * F.smile * 0.28;
    });
    this.upperLip.scale.y = 1 + F.smile * 0.08;
  }
}
