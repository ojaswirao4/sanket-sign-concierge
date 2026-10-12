// Sign dictionary for the avatar.
// Signs are approximations of ASL, authored as keyframes for the right (dominant) hand
// in avatar body space: x = avatar's left (+) / right (-), y = up, z = toward the viewer.
// A hand pose is { p: palm-centre position, f: finger direction, n: palm normal, h: handshape }.

// ---------- Handshapes ----------
// Each finger is [mcp, pip, dip] bend (0 straight .. 1 fully bent).
// Thumb: a = abduction (out to side), o = opposition (across palm), c = curl.
// s = finger spread (-1 crossed .. 1 wide).
const E = [0, 0, 0];
const C = [1, 1, 1];
const HK = [0.1, 1, 0.9]; // hooked (X)
const BN = [1, 0.05, 0]; // bent at the knuckle
const HF = [0.35, 0.55, 0.35]; // half curve (C)
const OC = [0.55, 0.8, 0.55]; // meets thumb (O)
const FL = [0.7, 0.25, 0.1]; // flat-O
const CL = [0.15, 0.85, 0.6]; // claw
const RX = [0.12, 0.2, 0.1]; // relaxed

const T = {
  side: { a: 0, o: 0.32, c: 0.08 }, // upright against the side of the fist (A)
  across: { a: 0.12, o: 0.55, c: 0.18 }, // folded in front of the palm, joints only lightly bent
  out: { a: 1, o: 0, c: 0 },
  tuck: { a: 0.1, o: 0.85, c: 0.6 }, // under the bent fingertips (E, M, N)
  tip: { a: 0.35, o: 0.65, c: 0.45 },
  wrap: { a: 0, o: 0.75, c: 0.75 },
  up: { a: 0.35, o: 0, c: 0 },
  c: { a: 0.3, o: 0.62, c: 0.35 }, // curves opposite the fingers (C)
  between: { a: 0.1, o: 0.55, c: 0.3 },
  relax: { a: 0.3, o: 0.3, c: 0.2 },
};
const h = (i, m, r, p, t, s = 0) => ({ f: [i, m, r, p], t, s });

export const HANDSHAPES = {
  A: h(C, C, C, C, T.side),
  B: h(E, E, E, E, T.across),
  C: h(HF, HF, HF, HF, T.c),
  D: h(E, OC, OC, OC, T.tip),
  E: h(CL, CL, CL, CL, T.tuck),
  F: h(OC, E, E, E, T.tip, 0.6),
  G: h(E, C, C, C, T.up),
  H: h(E, E, C, C, T.across),
  I: h(C, C, C, E, T.across),
  J: h(C, C, C, E, T.across),
  K: h(E, [0.3, 0.1, 0], C, C, T.between, 0.5),
  L: h(E, C, C, C, T.out),
  M: h([0.8, 1, 0.5], [0.8, 1, 0.5], [0.8, 1, 0.5], C, T.tuck),
  N: h([0.8, 1, 0.5], [0.8, 1, 0.5], C, C, T.tuck),
  O: h(OC, OC, OC, OC, T.tip),
  P: h(E, [0.3, 0.1, 0], C, C, T.between, 0.5),
  Q: h(E, C, C, C, T.up),
  R: h(E, E, C, C, T.across, -0.7),
  S: h(C, C, C, C, T.wrap),
  T: h([0.7, 1, 0.6], C, C, C, T.between),
  U: h(E, E, C, C, T.across),
  V: h(E, E, C, C, T.across, 0.9),
  W: h(E, E, E, C, T.across, 0.9),
  X: h(HK, C, C, C, T.across),
  Y: h(C, C, C, E, T.out, 1),
  Z: h(E, C, C, C, T.across),
  0: h(OC, OC, OC, OC, T.tip),
  1: h(E, C, C, C, T.across),
  2: h(E, E, C, C, T.across, 0.9),
  3: h(E, E, C, C, T.out, 0.9),
  4: h(E, E, E, E, T.across, 0.9),
  5: h(E, E, E, E, T.out, 1),
  6: h(E, E, E, OC, T.tip, 0.8),
  7: h(E, E, OC, E, T.tip, 0.8),
  8: h(E, OC, E, E, T.tip, 0.8),
  9: h(OC, E, E, E, T.tip, 0.6),
  flatO: h(FL, FL, FL, FL, { a: 0.2, o: 0.8, c: 0.15 }),
  claw: h(CL, CL, CL, CL, { a: 0.7, o: 0.2, c: 0.4 }, 0.9),
  bentB: h(BN, BN, BN, BN, T.across),
  ILY: h(E, C, C, E, T.out, 0.6),
  noOpen: h(E, E, C, C, T.out),
  noClose: h([0.45, 0.3, 0.1], [0.45, 0.3, 0.1], C, C, { a: 0.3, o: 0.6, c: 0.35 }),
  flat: h(E, E, E, E, T.up), // fingers together, thumb upright alongside (namaste)
  rest: h(RX, RX, [0.15, 0.25, 0.12], [0.2, 0.3, 0.15], T.relax, 0.1),
};

// Flatten a handshape into the 16 numbers the avatar interpolates.
export function shapeArray(name) {
  const s = HANDSHAPES[name] || HANDSHAPES.rest;
  return [...s.f[0], ...s.f[1], ...s.f[2], ...s.f[3], s.s, s.t.a, s.t.o, s.t.c];
}

// ---------- Keyframe DSL ----------
const UP = [0, 1, 0], DN = [0, -1, 0], FW = [0, 0, 1], BK = [0, 0, -1], IN = [1, 0, 0], OUT = [-1, 0, 0];
const r = (p, f, n, hs) => ({ p, f, n, h: hs });
const mir = (q) => q && { p: [-q.p[0], q.p[1], q.p[2]], f: [-q.f[0], q.f[1], q.f[2]], n: [-q.n[0], q.n[1], q.n[2]], h: q.h };
const k = (R, L = null, t = 0.3, hold = 0.08, face = null) => ({ R, L, t, hold, face });
const kb = (R, t, hold, face) => k(R, mir(R), t, hold, face);
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const mv = (q, d, extra = {}) => ({ ...q, p: add(q.p, d), ...extra });

export const REST = {
  R: r([-0.13, 1.0, 0.3], [0.55, 0, 0.8], DN, 'rest'),
  L: r([0.13, 1.0, 0.3], [-0.55, 0, 0.8], DN, 'rest'),
};

// Frequently used non-dominant (left hand) bases, written in world space.
const L_PALM_UP = r([0.05, 1.2, 0.32], [-0.5, 0, 1], UP, 'B');
const L_ARM = r([0.1, 1.2, 0.3], [-1, 0, 0.25], DN, 'B');
const L_INDEX_UP = r([0.04, 1.26, 0.3], UP, [-1, 0, 0], '1');

const CHEST = [-0.05, 1.3, 0.19];
const circle = (base, rad, hs, f, n, steps = 4) => {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push(k(r(add(base, [Math.sin(a) * rad, Math.cos(a) * rad, 0]), f, n, hs), null, i === 0 ? 0.3 : 0.14, 0));
  }
  return out;
};

export const SIGNS = {
  // salute: fingertips at the side of the forehead, then out
  HELLO: [k(r([-0.1, 1.71, 0.15], [0.35, 1, 0], FW, 'B'), null, 0.35, 0.1, { smile: 1, brow: 0.5 }), k(r([-0.27, 1.68, 0.27], [0, 1, 0.15], FW, 'B'), null, 0.35, 0.12, { smile: 1 })],
  BYE: (() => {
    const o = r([-0.22, 1.48, 0.28], UP, FW, 'B');
    return [k(o, null, 0.3, 0, { smile: 1 }), k({ ...o, h: 'bentB' }, null, 0.16, 0), k(o, null, 0.16, 0), k({ ...o, h: 'bentB' }, null, 0.16, 0), k(o, null, 0.16, 0.05)];
  })(),
  WELCOME: [k(r([-0.32, 1.26, 0.34], [0.2, 0, 1], UP, 'B'), null, 0.35, 0, { smile: 1 }), k(r([-0.06, 1.2, 0.24], [1, 0, 0.3], UP, 'B'), null, 0.45, 0.1, { smile: 1 })],
  // flat hand, fingertips at the chin, then forward and down
  'THANK-YOU': [k(r([-0.02, 1.47, 0.16], UP, BK, 'B'), null, 0.35, 0.1, { smile: 1 }), k(r([-0.08, 1.4, 0.38], [0, 0.4, 1], UP, 'B'), null, 0.4, 0.12, { smile: 1, nod: 1 })],
  PLEASE: circle(CHEST, 0.035, 'B', [0.6, 1, 0], BK),
  SORRY: circle(CHEST, 0.035, 'A', [0.6, 1, 0], BK).map((f) => ({ ...f, face: { brow: 0.6 } })),
  YES: (() => {
    const a = r([-0.14, 1.3, 0.32], UP, FW, 'S');
    const b = r([-0.14, 1.27, 0.34], [0, 0.5, 0.85], [0, -0.85, 0.5], 'S');
    return [k(a, null, 0.28, 0, { nod: 1 }), k(b, null, 0.15, 0, { nod: 1 }), k(a, null, 0.15, 0, { nod: 1 }), k(b, null, 0.15, 0.05, { nod: 1 })];
  })(),
  NO: (() => {
    const a = r([-0.14, 1.32, 0.32], UP, FW, 'noOpen');
    const b = { ...a, h: 'noClose' };
    return [k(a, null, 0.28, 0, { shake: 1 }), k(b, null, 0.14, 0, { shake: 1 }), k(a, null, 0.12, 0, { shake: 1 }), k(b, null, 0.14, 0.05, { shake: 1 })];
  })(),
  // index pointing at her chest from just right of it, palm toward her, the wrist curling forward (its natural
  // direction) with the elbow relaxed at her side; found by searching for the least-strained wrist
  ME: [k(r([-0.156, 1.26, 0.192], [0.783, 0.249, -0.57], [-0.516, -0.251, -0.819], '1'), null, 0.3, 0), k(r([-0.14, 1.265, 0.18], [0.783, 0.249, -0.57], [-0.516, -0.251, -0.819], '1'), null, 0.14, 0.1)],
  YOU: [k(r([-0.1, 1.3, 0.36], FW, DN, '1'), null, 0.3, 0), k(r([-0.08, 1.31, 0.42], FW, DN, '1'), null, 0.14, 0.1)],
  WANT: [kb(r([-0.13, 1.22, 0.42], [0.1, 0.1, 1], UP, 'claw'), 0.3, 0), kb(r([-0.13, 1.23, 0.28], [0.1, 0.4, 1], UP, 'claw'), 0.3, 0.08)],
  NEED: (() => {
    const a = r([-0.12, 1.3, 0.33], FW, DN, 'X');
    const b = r([-0.12, 1.26, 0.34], [0, -0.6, 0.8], [0, -0.8, -0.6], 'X');
    return [k(a, null, 0.28, 0), k(b, null, 0.14, 0), k(a, null, 0.12, 0), k(b, null, 0.14, 0.06)];
  })(),
  HAVE: [kb(r([-0.08, 1.31, 0.33], UP, BK, 'bentB'), 0.28, 0), kb(r([-0.07, 1.3, 0.25], UP, BK, 'bentB'), 0.2, 0.1)],
  ROOM: [
    kb(r([-0.1, 1.25, 0.34], FW, IN, 'B'), 0.32, 0.08),
    k(r([0.0, 1.25, 0.43], IN, BK, 'B'), r([0.0, 1.25, 0.24], [-1, 0, 0], FW, 'B'), 0.32, 0.12),
  ],
  RESERVE: [
    k(r([-0.02, 1.3, 0.31], FW, DN, 'S'), r([0.06, 1.2, 0.31], [-0.3, 0, 1], DN, 'S'), 0.3, 0),
    ...circle([-0.01, 1.3, 0.31], 0.025, 'S', FW, DN, 3).slice(1).map((f) => ({ ...f, L: r([0.06, 1.2, 0.31], [-0.3, 0, 1], DN, 'S') })),
    k(r([0.02, 1.245, 0.31], FW, DN, 'S'), r([0.06, 1.2, 0.31], [-0.3, 0, 1], DN, 'S'), 0.16, 0.1),
  ],
  NIGHT: [k(r([-0.1, 1.3, 0.33], [0.3, 0, 1], DN, 'bentB'), L_ARM, 0.3, 0), k(r([-0.01, 1.26, 0.34], [0.3, -0.3, 1], DN, 'bentB'), L_ARM, 0.35, 0.1)],
  DAY: [k(r([-0.12, 1.43, 0.31], UP, BK, '1'), L_ARM, 0.3, 0), k(r([0.03, 1.29, 0.33], IN, BK, '1'), L_ARM, 0.45, 0.08)],
  MORNING: [k(r([-0.12, 1.2, 0.33], [0.3, 0, 1], UP, 'B'), L_ARM, 0.3, 0), k(r([-0.12, 1.33, 0.33], [0, 0.8, 0.6], [0, 0.4, -0.9], 'B'), L_ARM, 0.4, 0.08)],
  NOW: [kb(r([-0.14, 1.32, 0.32], FW, UP, 'Y'), 0.3, 0), kb(r([-0.14, 1.24, 0.34], FW, UP, 'Y'), 0.18, 0.08)],
  TOMORROW: [k(r([-0.08, 1.63, 0.13], UP, IN, 'A'), null, 0.3, 0.05), k(r([-0.13, 1.6, 0.3], [0, 0.5, 1], IN, 'A'), null, 0.3, 0.08)],
  YESTERDAY: [k(r([-0.07, 1.62, 0.13], UP, IN, 'A'), null, 0.3, 0.05), k(r([-0.12, 1.67, 0.05], UP, IN, 'A'), null, 0.3, 0.08)],
  TIME: [
    k(r([-0.02, 1.29, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.3, 0, { brow: 0.4 }),
    k(r([-0.02, 1.26, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.12, 0),
    k(r([-0.02, 1.29, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.12, 0),
    k(r([-0.02, 1.26, 0.31], [0.3, -0.6, 0.6], DN, '1'), r([0.06, 1.2, 0.31], [-1, 0, 0.3], DN, 'S'), 0.12, 0.05),
  ],
  EAT: [k(r([-0.02, 1.6, 0.24], [0.3, 0.3, -1], DN, 'flatO'), null, 0.3, 0), k(r([-0.02, 1.62, 0.19], [0.3, 0.3, -1], DN, 'flatO'), null, 0.14, 0), k(r([-0.02, 1.6, 0.24], [0.3, 0.3, -1], DN, 'flatO'), null, 0.12, 0), k(r([-0.02, 1.62, 0.19], [0.3, 0.3, -1], DN, 'flatO'), null, 0.14, 0.05)],
  DRINK: [k(r([-0.04, 1.54, 0.22], UP, IN, 'C'), null, 0.3, 0.05), k(r([-0.03, 1.6, 0.19], [0.3, 0.8, -0.5], IN, 'C'), null, 0.3, 0.1)],
  WATER: [k(r([-0.02, 1.53, 0.18], UP, IN, 'W'), null, 0.3, 0), k(r([-0.02, 1.54, 0.155], UP, IN, 'W'), null, 0.12, 0), k(r([-0.02, 1.53, 0.18], UP, IN, 'W'), null, 0.12, 0), k(r([-0.02, 1.54, 0.155], UP, IN, 'W'), null, 0.12, 0.05)],
  KEY: [
    k(r([-0.03, 1.28, 0.31], IN, DN, 'X'), r([0.05, 1.28, 0.31], UP, [-1, 0, 0], 'B'), 0.3, 0.05),
    k(r([-0.03, 1.28, 0.31], IN, BK, 'X'), r([0.05, 1.28, 0.31], UP, [-1, 0, 0], 'B'), 0.25, 0.1),
  ],
  MONEY: [
    k(r([0.03, 1.28, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.3, 0),
    k(r([0.03, 1.235, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.12, 0),
    k(r([0.03, 1.27, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.12, 0),
    k(r([0.03, 1.235, 0.32], DN, BK, 'flatO'), L_PALM_UP, 0.12, 0.05),
  ],
  PAY: [k(r([0.03, 1.24, 0.28], [0.1, -0.2, 1], DN, '1'), L_PALM_UP, 0.3, 0), k(r([-0.04, 1.27, 0.46], FW, DN, '1'), L_PALM_UP, 0.25, 0.08)],
  FREE: [kb(r([0.03, 1.3, 0.25], UP, BK, 'F'), 0.3, 0.05), kb(r([-0.2, 1.33, 0.3], [-0.2, 1, 0], FW, 'F'), 0.3, 0.08)],
  SLEEP: [k(r([-0.11, 1.66, 0.09], UP, IN, 'B'), null, 0.35, 0.35, { tilt: 1, eyes: 0.2 })],
  BATHROOM: (() => {
    const a = r([-0.14, 1.3, 0.32], UP, FW, 'T');
    return [k(a, null, 0.28, 0), k(mv(a, [-0.03, 0, 0]), null, 0.1, 0), k(mv(a, [0.03, 0, 0]), null, 0.12, 0), k(mv(a, [-0.03, 0, 0]), null, 0.12, 0), k(a, null, 0.1, 0.05)];
  })(),
  CLEAN: [k(r([0.02, 1.235, 0.25], [0.4, 0, 1], DN, 'B'), L_PALM_UP, 0.3, 0), k(r([0.02, 1.235, 0.42], [0.4, 0, 1], DN, 'B'), L_PALM_UP, 0.3, 0.06)],
  HELP: [
    k(r([0.02, 1.26, 0.32], UP, IN, 'A'), L_PALM_UP, 0.3, 0.05),
    k(r([0.02, 1.34, 0.32], UP, IN, 'A'), mv(L_PALM_UP, [0, 0.08, 0]), 0.3, 0.08),
  ],
  WHERE: (() => {
    const a = r([-0.12, 1.34, 0.33], UP, FW, '1');
    const f = { brow: -1 };
    return [k(a, null, 0.28, 0, f), k(mv(a, [-0.035, 0, 0], { f: [-0.3, 1, 0] }), null, 0.12, 0, f), k(mv(a, [0.035, 0, 0], { f: [0.3, 1, 0] }), null, 0.14, 0, f), k(mv(a, [-0.035, 0, 0], { f: [-0.3, 1, 0] }), null, 0.14, 0, f), k(a, null, 0.12, 0.05, f)];
  })(),
  WHAT: (() => {
    const a = r([-0.17, 1.24, 0.33], [0.3, 0, 1], UP, '5');
    const f = { brow: -1 };
    return [kb(a, 0.3, 0, f), kb(mv(a, [-0.03, 0, 0]), 0.13, 0, f), kb(a, 0.13, 0, f), kb(mv(a, [-0.03, 0, 0]), 0.13, 0.05, f)];
  })(),
  HOW: [kb(r([-0.03, 1.28, 0.3], DN, BK, 'bentB'), 0.3, 0.05, { brow: -1 }), kb(r([-0.05, 1.28, 0.34], FW, UP, 'bentB'), 0.3, 0.08, { brow: -1 })],
  WHEN: [
    k(r([-0.03, 1.36, 0.31], [0.3, 0.3, 1], DN, '1'), L_INDEX_UP, 0.3, 0, { brow: -1 }),
    ...circle([-0.02, 1.36, 0.31], 0.03, '1', [0.3, 0.3, 1], DN, 3).slice(1).map((f) => ({ ...f, L: L_INDEX_UP, face: { brow: -1 } })),
    k(r([0.02, 1.33, 0.31], [0.3, -0.4, 1], DN, '1'), L_INDEX_UP, 0.16, 0.08, { brow: -1 }),
  ],
  WHY: [k(r([-0.07, 1.8, 0.14], [0.3, 1, 0], BK, 'B'), null, 0.3, 0.05, { brow: -1 }), k(r([-0.12, 1.72, 0.3], [0.2, 1, 0.3], BK, 'Y'), null, 0.3, 0.08, { brow: -1 })],
  GOOD: [k(r([-0.02, 1.57, 0.13], UP, BK, 'B'), mv(L_PALM_UP, [0, 0.04, 0]), 0.35, 0.05, { smile: 1 }), k(r([0.0, 1.29, 0.33], [0.3, 0, 1], UP, 'B'), mv(L_PALM_UP, [0, 0.04, 0]), 0.4, 0.08, { smile: 1, nod: 1 })],
  FINE: [k(r([-0.05, 1.33, 0.25], UP, IN, '5'), null, 0.3, 0), k(r([-0.05, 1.33, 0.22], UP, IN, '5'), null, 0.12, 0), k(r([-0.05, 1.33, 0.25], UP, IN, '5'), null, 0.12, 0.08, { smile: 1 })],
  WAIT: [kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, '5'), 0.3, 0), kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, 'claw'), 0.14, 0), kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, '5'), 0.14, 0), kb(r([-0.2, 1.22, 0.3], [-0.1, 0, 1], UP, 'claw'), 0.14, 0.05)],
  PHONE: [k(r([-0.1, 1.64, 0.12], [0.3, -0.35, 1], IN, 'Y'), null, 0.35, 0.3)],
  CAR: (() => {
    const R1 = r([-0.12, 1.3, 0.33], UP, IN, 'S');
    const L1 = mir(R1);
    return [k(R1, L1, 0.3, 0), k(mv(R1, [0, 0.04, 0]), mv(L1, [0, -0.04, 0]), 0.2, 0), k(mv(R1, [0, -0.04, 0]), mv(L1, [0, 0.04, 0]), 0.2, 0), k(R1, L1, 0.18, 0.05)];
  })(),
  FLOOR: [kb(r([-0.04, 1.2, 0.34], FW, DN, 'B'), 0.3, 0), kb(r([-0.22, 1.2, 0.34], FW, DN, 'B'), 0.35, 0.05)],
  UP: [k(r([-0.14, 1.33, 0.32], UP, FW, '1'), null, 0.3, 0), k(r([-0.14, 1.5, 0.3], UP, FW, '1'), null, 0.25, 0.08)],
  DOWN: [k(r([-0.14, 1.32, 0.33], DN, BK, '1'), null, 0.3, 0), k(r([-0.14, 1.2, 0.34], DN, BK, '1'), null, 0.25, 0.08)],
  LEFT: [k(r([-0.14, 1.3, 0.33], UP, FW, 'L'), null, 0.3, 0), k(r([0.04, 1.3, 0.33], UP, FW, 'L'), null, 0.3, 0.08)],
  RIGHT: [k(r([-0.08, 1.3, 0.33], UP, FW, 'R'), null, 0.3, 0), k(r([-0.26, 1.3, 0.33], UP, FW, 'R'), null, 0.3, 0.08)],
  NUMBER: [
    k(r([-0.035, 1.3, 0.32], IN, DN, 'flatO'), r([0.035, 1.3, 0.32], [-1, 0, 0], UP, 'flatO'), 0.3, 0),
    k(r([-0.035, 1.3, 0.32], IN, UP, 'flatO'), r([0.035, 1.3, 0.32], [-1, 0, 0], DN, 'flatO'), 0.3, 0.06),
  ],
  NAME: [
    k(r([0.01, 1.3, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.3, 0),
    k(r([0.01, 1.275, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.12, 0),
    k(r([0.01, 1.3, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.12, 0),
    k(r([0.01, 1.275, 0.32], [1, 0, 0.3], BK, 'H'), r([0.05, 1.26, 0.33], [-1, 0, 0.3], BK, 'H'), 0.12, 0.05),
  ],
  FINISH: [kb(r([-0.13, 1.3, 0.28], UP, BK, '5'), 0.3, 0.05), kb(r([-0.19, 1.28, 0.33], [-0.6, 0.8, 0], FW, '5'), 0.22, 0.08)],
  CHECK: [k(r([-0.02, 1.62, 0.2], [0.2, 0.3, 1], DN, '1'), L_PALM_UP, 0.3, 0.05), k(r([0.03, 1.26, 0.32], [0.2, -0.3, 1], DN, '1'), L_PALM_UP, 0.3, 0.06)],
  IN: [
    k(r([0.03, 1.33, 0.31], DN, BK, 'flatO'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.3, 0),
    k(r([0.03, 1.25, 0.31], DN, BK, 'flatO'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.25, 0.08),
  ],
  OUT: [
    k(r([0.03, 1.24, 0.31], DN, BK, '5'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.3, 0),
    k(r([0.03, 1.36, 0.31], DN, BK, 'flatO'), r([0.05, 1.22, 0.31], [-1, 0, 0.2], BK, 'C'), 0.25, 0.08),
  ],
  STAY: [kb(r([-0.14, 1.3, 0.33], FW, DN, 'Y'), 0.3, 0), kb(r([-0.14, 1.23, 0.34], FW, DN, 'Y'), 0.25, 0.08)],
  LOVE: [k(r([0.05, 1.33, 0.2], [0.7, 1, 0], BK, 'S'), r([-0.05, 1.33, 0.22], [-0.7, 1, 0], BK, 'S'), 0.35, 0.3, { smile: 1 })],
  ILY: [k(r([-0.16, 1.4, 0.32], UP, FW, 'ILY'), null, 0.35, 0.35, { smile: 1 })],
  HAPPY: [
    k(r([-0.05, 1.27, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.3, 0, { smile: 1 }),
    k(r([-0.05, 1.36, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.14, 0, { smile: 1 }),
    k(r([-0.05, 1.27, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.12, 0, { smile: 1 }),
    k(r([-0.05, 1.36, 0.2], [0.5, 1, 0], BK, 'B'), null, 0.14, 0.05, { smile: 1 }),
  ],
  DEAF: [k(r([-0.13, 1.69, 0.08], [0.5, 0.5, 0.2], BK, '1'), null, 0.35, 0.05), k(r([-0.04, 1.6, 0.17], [0.3, 0.5, -0.4], BK, '1'), null, 0.3, 0.08)],
  SIGN: (() => {
    const out = [];
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const R1 = r([-0.1 + Math.sin(a) * 0.04, 1.32 + Math.cos(a) * 0.04, 0.33], [0.4, 0.4, 1], DN, '1');
      const L1 = r([0.1 - Math.sin(a + Math.PI) * 0.04, 1.32 + Math.cos(a + Math.PI) * 0.04, 0.33], [-0.4, 0.4, 1], DN, '1');
      out.push(k(R1, L1, i === 0 ? 0.3 : 0.14, 0));
    }
    return out;
  })(),
  UNDERSTAND: [k(r([-0.1, 1.77, 0.12], UP, BK, 'S'), null, 0.35, 0.05, { brow: 0.5 }), k(r([-0.1, 1.78, 0.12], UP, BK, '1'), null, 0.12, 0.1, { brow: 0.5, nod: 1 })],
  AGAIN: [k(r([-0.02, 1.33, 0.32], [0.3, 0.3, 1], UP, 'bentB'), L_PALM_UP, 0.3, 0), k(r([0.03, 1.25, 0.32], [0.3, -0.2, 1], DN, 'bentB'), L_PALM_UP, 0.25, 0.08)],
  SEE: [k(r([-0.06, 1.66, 0.18], [0.2, 0.2, 1], DN, 'V'), null, 0.35, 0.05), k(r([-0.07, 1.58, 0.4], [0.1, 0, 1], DN, 'V'), null, 0.3, 0.08)],
  GIVE: [k(r([-0.1, 1.3, 0.25], [0, 0.5, 1], UP, 'flatO'), null, 0.3, 0), k(r([-0.1, 1.28, 0.45], FW, UP, 'flatO'), null, 0.3, 0.08)],
  MORE: [
    k(r([-0.07, 1.3, 0.33], IN, BK, 'flatO'), r([0.07, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.3, 0),
    k(r([-0.03, 1.3, 0.33], IN, BK, 'flatO'), r([0.03, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.12, 0),
    k(r([-0.07, 1.3, 0.33], IN, BK, 'flatO'), r([0.07, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.12, 0),
    k(r([-0.03, 1.3, 0.33], IN, BK, 'flatO'), r([0.03, 1.3, 0.33], [-1, 0, 0], BK, 'flatO'), 0.12, 0.05),
  ],
  CAN: [kb(r([-0.14, 1.34, 0.33], FW, DN, 'S'), 0.3, 0), kb(r([-0.14, 1.25, 0.34], FW, DN, 'S'), 0.2, 0.08, { nod: 1 })],
  NOT: [k(r([-0.03, 1.53, 0.15], UP, IN, 'A'), null, 0.3, 0.05, { shake: 1 }), k(r([-0.06, 1.48, 0.36], [0, 0.6, 1], IN, 'A'), null, 0.25, 0.08, { shake: 1 })],
  SWIM: [kb(r([-0.03, 1.28, 0.3], FW, DN, 'B'), 0.3, 0), kb(r([-0.2, 1.28, 0.42], [-0.4, 0, 1], DN, 'B'), 0.4, 0.05)],
  EXERCISE: [kb(r([-0.2, 1.5, 0.18], UP, FW, 'S'), 0.3, 0), kb(r([-0.2, 1.6, 0.18], UP, FW, 'S'), 0.18, 0), kb(r([-0.2, 1.5, 0.18], UP, FW, 'S'), 0.18, 0), kb(r([-0.2, 1.6, 0.18], UP, FW, 'S'), 0.18, 0.05)],
  DOCTOR: [
    k(r([0.06, 1.24, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.3, 0),
    k(r([0.06, 1.215, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.12, 0),
    k(r([0.06, 1.24, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.12, 0),
    k(r([0.06, 1.215, 0.3], DN, BK, 'claw'), L_PALM_UP, 0.12, 0.05),
  ],
  EMERGENCY: (() => {
    const a = r([-0.17, 1.45, 0.3], UP, FW, 'E');
    const f = { brow: -1 };
    return [k(a, null, 0.28, 0, f), k(mv(a, [-0.04, 0, 0]), null, 0.1, 0, f), k(mv(a, [0.03, 0, 0]), null, 0.12, 0, f), k(mv(a, [-0.04, 0, 0]), null, 0.12, 0, f), k(a, null, 0.1, 0.05, f)];
  })(),
  LATE: [k(r([-0.3, 1.2, 0.12], DN, BK, 'B'), null, 0.3, 0), k(r([-0.3, 1.2, 0.1], [0, -1, -0.6], BK, 'B'), null, 0.14, 0), k(r([-0.3, 1.2, 0.12], DN, BK, 'B'), null, 0.14, 0.05)],
  ELEVATOR: [k(r([-0.02, 1.2, 0.3], UP, IN, 'E'), r([0.04, 1.28, 0.3], UP, [-1, 0, 0], '1'), 0.3, 0), k(r([-0.02, 1.4, 0.3], UP, IN, 'E'), r([0.04, 1.28, 0.3], UP, [-1, 0, 0], '1'), 0.4, 0.06)],
  HOTEL: [
    k(r([0.02, 1.36, 0.3], IN, BK, 'H'), r([0.04, 1.25, 0.3], UP, BK, '1'), 0.3, 0),
    k(r([0.02, 1.36, 0.3], [1, -0.4, 0], BK, 'H'), r([0.04, 1.25, 0.3], UP, BK, '1'), 0.14, 0),
    k(r([0.02, 1.36, 0.3], IN, BK, 'H'), r([0.04, 1.25, 0.3], UP, BK, '1'), 0.14, 0.05),
  ],
  PARKING: [k(r([0.02, 1.32, 0.3], [0.3, 0, 1], IN, '3'), L_PALM_UP, 0.3, 0), k(r([0.03, 1.25, 0.31], [0.3, 0, 1], IN, '3'), L_PALM_UP, 0.25, 0.08)],
};
// Namaste: the Indian greeting (not an ASL sign): palms pressed together at the chest, fingers up, a small bow
SIGNS.NAMASTE = [
  { ...k(r([-0.008, 1.34, 0.24], [0, 1, 0.22], IN, 'flat'), r([0.008, 1.34, 0.24], [0, 1, 0.22], [-1, 0, 0], 'flat'), 0.45, 0.1, { smile: 1 }), press: 1 },
  { ...k(r([-0.008, 1.33, 0.25], [0, 1, 0.3], IN, 'flat'), r([0.008, 1.33, 0.25], [0, 1, 0.3], [-1, 0, 0], 'flat'), 0.35, 0.45, { smile: 1, nod: 1 }), press: 1 },
];
SIGNS.CALL = SIGNS.PHONE;
SIGNS.TAXI = SIGNS.CAR;

export const VOCAB = Object.keys(SIGNS);

// ---------- Dataset signs ----------
// Signs converted from the WLASL video dataset by tools/wlasl/extract.py (licence: C-UDA,
// non-commercial). One JSON file per sign, fetched the first time it is needed.
// Hand-authored SIGNS above take priority over dataset signs with the same name.
const DATASET_URL = 'signs/wlasl/';
const DATASET = {}; // token -> frames
let datasetIndex = new Set();
let datasetPhrases = []; // [regex, token] for multi-word signs like WAKE-UP, HEART-ATTACK
export const datasetReady = fetch(DATASET_URL + 'index.json')
  .then((r) => (r.ok ? r.json() : []))
  .then((list) => {
    datasetIndex = new Set(list);
    datasetPhrases = list
      .filter((t) => t.includes('-') && !SIGNS[t])
      .sort((a, b) => b.length - a.length)
      .map((t) => [new RegExp(`\\b${t.toLowerCase().split('-').join('\\s+')}\\b`, 'g'), t]);
    return datasetIndex;
  })
  .catch(() => datasetIndex);

export const hasSign = (tok) => !!SIGNS[tok] || datasetIndex.has(tok);

// Fetch the dataset signs a gloss needs before playing it.
export async function loadSigns(tokens) {
  await datasetReady;
  const need = [...new Set(tokens)].filter((t) => !SIGNS[t] && datasetIndex.has(t) && !DATASET[t]);
  await Promise.all(
    need.map((t) =>
      fetch(DATASET_URL + encodeURIComponent(t) + '.json')
        .then((r) => r.json())
        .then((d) => (DATASET[t] = d.frames))
        .catch(() => datasetIndex.delete(t))
    )
  );
}

// ---------- Fingerspelling & numbers ----------
const FS_POS = [-0.17, 1.36, 0.29];
function letterPose(ch) {
  const base = r(FS_POS, UP, FW, ch);
  if ('GH'.includes(ch)) return r(FS_POS, IN, BK, ch);
  if ('PQ'.includes(ch)) return r(add(FS_POS, [0, -0.02, 0.02]), [0.3, -0.7, 0.6], BK, ch);
  if (/[0-9]/.test(ch)) return r(FS_POS, UP, '12345'.includes(ch) && false ? BK : FW, ch);
  return base;
}

export function fingerspellFrames(word, gi) {
  const frames = [];
  const chars = word.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
  chars.forEach((ch, i) => {
    let pose = letterPose(ch);
    if (i > 0 && chars[i - 1] === ch) pose = mv(pose, [-0.035, 0, 0]); // doubled letters slide
    const fr = k(pose, null, i === 0 ? 0.3 : 0.2, 0.22);
    fr.gi = gi;
    fr.letter = ch;
    frames.push(fr);
    if (ch === 'J') frames.push({ ...k(r(add(FS_POS, [0.02, -0.04, 0]), [0.4, 0.6, 0], BK, 'J'), null, 0.25, 0.05), gi });
    if (ch === 'Z') {
      [[0.03, 0.03], [-0.03, 0.03], [0.03, -0.03], [-0.03, -0.03]].forEach(([dx, dy]) => frames.push({ ...k(r(add(FS_POS, [dx, dy, 0]), UP, FW, 'Z'), null, 0.12, 0), gi }));
    }
  });
  return frames;
}

// Turn a list of gloss tokens into playable keyframes.
// Tokens: sign names (ROOM), 'FS:WORD' for fingerspelling, or pure digit strings.
export function buildFrames(tokens) {
  const frames = [];
  tokens.forEach((tok, gi) => {
    const sign = SIGNS[tok] || DATASET[tok];
    if (sign) {
      sign.forEach((f) => frames.push({ ...f, gi }));
    } else if (/^\d+$/.test(tok)) {
      frames.push(...fingerspellFrames(tok, gi));
    } else {
      const w = tok.startsWith('FS:') ? tok.slice(3) : tok;
      frames.push(...fingerspellFrames(w, gi));
    }
    // small pause between signs
    if (frames.length) frames[frames.length - 1] = { ...frames[frames.length - 1], hold: (frames[frames.length - 1].hold || 0) + 0.08 };
  });
  return frames;
}

// ---------- English -> gloss ----------
const PHRASES = [
  [/\bthank(s| you)\b/g, ' THANK-YOU '],
  [/\bcheck[\s-]?in\b/g, ' CHECK IN '],
  [/\bcheck[\s-]?out\b/g, ' CHECK OUT '],
  [/\bwi[\s-]?fi\b/g, ' FS:WIFI '],
  [/\bi love you\b/g, ' ILY '],
  [/\bbreakfast\b/g, ' EAT MORNING '],
  [/\bdinner\b/g, ' EAT NIGHT '],
  [/\blunch\b/g, ' EAT DAY '],
  [/\btonight\b/g, ' NOW NIGHT '],
  [/\btoday\b/g, ' NOW DAY '],
  [/\bsign language\b/g, ' SIGN '],
  [/\bwould like\b/g, ' WANT '],
  [/\bfront desk\b|\breception\b/g, ' HOTEL '],
  [/\broom service\b/g, ' ROOM GIVE '],
];
const SYN = {
  hi: 'HELLO', hello: 'HELLO', hey: 'HELLO', welcome: 'WELCOME', bye: 'BYE', goodbye: 'BYE',
  please: 'PLEASE', sorry: 'SORRY', apologize: 'SORRY', yes: 'YES', yeah: 'YES', sure: 'YES', certainly: 'YES',
  no: 'NO', not: 'NOT', "don't": 'NOT', "can't": 'NOT', cannot: 'NOT', never: 'NOT',
  i: 'ME', me: 'ME', my: 'ME', mine: 'ME', we: 'ME', our: 'ME', us: 'ME',
  you: 'YOU', your: 'YOU', yours: 'YOU',
  want: 'WANT', wanted: 'WANT', need: 'NEED', needs: 'NEED', have: 'HAVE', has: 'HAVE',
  room: 'ROOM', rooms: 'ROOM', suite: 'ROOM', book: 'RESERVE', booking: 'RESERVE', booked: 'RESERVE', reserve: 'RESERVE', reservation: 'RESERVE', reserved: 'RESERVE',
  night: 'NIGHT', nights: 'NIGHT', day: 'DAY', days: 'DAY', morning: 'MORNING', now: 'NOW',
  tomorrow: 'TOMORROW', yesterday: 'YESTERDAY', time: 'TIME', hour: 'TIME', hours: 'TIME', minutes: 'TIME', clock: 'TIME',
  when: 'WHEN', where: 'WHERE', what: 'WHAT', which: 'WHAT', how: 'HOW', why: 'WHY',
  eat: 'EAT', food: 'EAT', meal: 'EAT', meals: 'EAT', restaurant: 'EAT', menu: 'EAT', drink: 'DRINK', drinks: 'DRINK', coffee: 'DRINK', tea: 'DRINK', bar: 'DRINK', water: 'WATER',
  key: 'KEY', keycard: 'KEY', card: 'KEY', money: 'MONEY', price: 'MONEY', prices: 'MONEY', cost: 'MONEY', costs: 'MONEY', rate: 'MONEY', rates: 'MONEY', charge: 'MONEY', fee: 'MONEY', bill: 'MONEY', invoice: 'MONEY', rupees: 'MONEY',
  pay: 'PAY', payment: 'PAY', paid: 'PAY', free: 'FREE', complimentary: 'FREE', included: 'FREE',
  sleep: 'SLEEP', bed: 'SLEEP', beds: 'SLEEP', pillow: 'SLEEP', pillows: 'SLEEP',
  bathroom: 'BATHROOM', toilet: 'BATHROOM', restroom: 'BATHROOM', washroom: 'BATHROOM',
  clean: 'CLEAN', cleaning: 'CLEAN', housekeeping: 'CLEAN', laundry: 'CLEAN', towel: 'CLEAN', towels: 'CLEAN',
  help: 'HELP', assist: 'HELP', assistance: 'HELP', support: 'HELP',
  good: 'GOOD', great: 'GOOD', nice: 'GOOD', excellent: 'GOOD', wonderful: 'GOOD', fine: 'FINE', ok: 'FS:OK', okay: 'FS:OK',
  wait: 'WAIT', moment: 'WAIT', phone: 'PHONE', call: 'CALL', dial: 'CALL',
  car: 'CAR', taxi: 'TAXI', cab: 'TAXI', drive: 'CAR', airport: 'FS:AIRPORT',
  floor: 'FLOOR', level: 'FLOOR', up: 'UP', upstairs: 'UP', rooftop: 'UP', down: 'DOWN', downstairs: 'DOWN', basement: 'DOWN', left: 'LEFT',
  number: 'NUMBER', name: 'NAME', finish: 'FINISH', done: 'FINISH', finished: 'FINISH', confirmed: 'FINISH', check: 'CHECK',
  stay: 'STAY', staying: 'STAY', love: 'LOVE', happy: 'HAPPY', glad: 'HAPPY', pleased: 'HAPPY', enjoy: 'HAPPY',
  deaf: 'DEAF', sign: 'SIGN', understand: 'UNDERSTAND', again: 'AGAIN', repeat: 'AGAIN',
  see: 'SEE', look: 'SEE', view: 'SEE', give: 'GIVE', bring: 'GIVE', send: 'GIVE', deliver: 'GIVE', provide: 'GIVE',
  more: 'MORE', extra: 'MORE', another: 'MORE', additional: 'MORE', can: 'CAN', could: 'CAN', able: 'CAN',
  swim: 'SWIM', pool: 'SWIM', swimming: 'SWIM', gym: 'EXERCISE', exercise: 'EXERCISE', fitness: 'EXERCISE', workout: 'EXERCISE',
  doctor: 'DOCTOR', medical: 'DOCTOR', hospital: 'DOCTOR', clinic: 'DOCTOR', pharmacy: 'DOCTOR', medicine: 'DOCTOR',
  emergency: 'EMERGENCY', fire: 'EMERGENCY', urgent: 'EMERGENCY', late: 'LATE',
  elevator: 'ELEVATOR', lift: 'ELEVATOR', hotel: 'HOTEL', parking: 'PARKING', park: 'PARKING',
};
// Not signed (ASL drops articles, "be" verbs and most prepositions, which are shown by placement).
const STOP = new Set(
  ('a an the is are am was were be been being to of for at on in into by with and or it its this that these those there here ' +
    'do does did will would shall should just so very also as from about any some then than if let lets let\'s i\'ll we\'ll ' +
    'you\'ll i\'m it\'s that\'s there\'s get got make made per each our is has had having may might must ' +
    'above across against along among around behind below beneath beside between beyond during except inside near off ' +
    'onto outside over past through throughout toward towards under underneath upon within without via ' +
    'i\'d you\'d we\'re you\'re they\'re i\'ve we\'ve you\'ve isn\'t aren\'t wasn\'t oh um uh').split(' ')
);
const MAX_SPELL = 10; // longer unknown words are left out rather than spelled letter by letter

// "booked" -> book, "rooms" -> room, "stopping" -> stop, "cities" -> city
function lemmas(w) {
  const c = [w];
  if (w.endsWith('ies')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) c.push(w.slice(0, -2));
  if (w.endsWith('s')) c.push(w.slice(0, -1));
  if (w.endsWith('ied')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) c.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('ing')) c.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  const stem = c[c.length - 1];
  if (/(ed|ing)$/.test(w) && /([b-df-hj-np-tv-z])\1$/.test(stem)) c.push(stem.slice(0, -1)); // stopp -> stop
  return c;
}
const NUMWORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10', ground: '0',
};

export function textToGloss(text, max = 16) {
  let s = ' ' + String(text || '').toLowerCase() + ' ';
  PHRASES.forEach(([re, rep]) => (s = s.replace(re, rep)));
  datasetPhrases.forEach(([re, tok]) => (s = s.replace(re, ` ${tok} `)));
  const originalWords = String(text || '').split(/\s+/);
  const proper = new Set(originalWords.filter((w, i) => i > 0 && /^[A-Z][a-z]+/.test(w)).map((w) => w.toLowerCase().replace(/[^a-z]/g, '')));
  const out = [];
  s.split(/\s+/).forEach((raw) => {
    if (!raw) return;
    if (/^[A-Z'-]+$/.test(raw) || raw.startsWith('FS:')) return out.push(raw);
    const w = raw.replace(/[^a-z0-9'₹:]/g, '');
    if (!w) return;
    if (/^\d{1,2}:\d{2}$/.test(w)) return out.push(w.replace(':00', '').replace(':', ''));
    const digits = w.replace(/[^0-9]/g, '');
    if (digits && digits.length === w.replace(/[₹,]/g, '').length) return out.push(digits.slice(0, 6));
    if (/^\d+(st|nd|rd|th)$/.test(w)) return out.push(digits);
    if (/^\d+(am|pm)$/.test(w)) return out.push(w.replace(/\D/g, ''), 'FS:' + w.replace(/\d/g, '').toUpperCase());
    if (w === 'am' || w === 'pm') return out.push('FS:' + w.toUpperCase());
    if (NUMWORDS[w]) return out.push(NUMWORDS[w]);
    if (STOP.has(w)) return;
    const base = SYN[w] || SYN[w.replace(/s$/, '')];
    if (base) return out.push(base);
    const word = w.replace(/'s$/, '').replace(/[^a-z]/g, '');
    if (!word) return;
    if (proper.has(w) && word.length <= 8) return out.push('FS:' + word.toUpperCase());
    // dataset sign for the word (or its base form)?
    const known = lemmas(word).map((l) => l.toUpperCase()).find(hasSign);
    if (known) return out.push(known);
    // anything else is fingerspelled
    if (word.length <= MAX_SPELL) out.push('FS:' + word.toUpperCase());
  });
  // collapse immediate repeats
  const dedup = out.filter((t, i) => t !== out[i - 1]);
  return dedup.slice(0, max);
}

// Human-readable label for a gloss token
export function glossLabel(tok) {
  if (tok.startsWith('FS:')) return tok.slice(3).split('').join('-');
  if (/^\d+$/.test(tok)) return tok;
  return tok.replace('-', ' ');
}
