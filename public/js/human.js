// Realistic human avatar: the Microsoft Rocketbox "Business_Female_01" model (MIT licence),
// driven by the same keyframes as the procedural avatar.
//   arms    two-bone IK on the model's upper-arm / forearm bones
//   hands   palm orientation from each keyframe (finger direction + palm normal)
//   fingers every joint aimed along an invisible reference hand posed with the keyframe's
//           16 handshape numbers, so hand-authored and dataset signs look the same as before
//   face    ARKit blendshapes (blink, brows, smile, gaze, speech) + head bone nod / shake
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Avatar, buildHand, applyShape, PALM_OFFSET } from './avatar.js';

const MODEL_DIR = 'models/aria/';
const OUR_SHOULDER_C = new THREE.Vector3(0, 1.435, 0); // keyframe space (see signs.js)
const OUR_SHOULDER_W = 0.38;
const OUR_NOSE_UP = 0.25; // nose height above the shoulder line in keyframe space
const OUR_NOSE = new THREE.Vector3(0, 1.685, 0.1);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const FINGER_NAMES = ['Finger1', 'Finger2', 'Finger3', 'Finger4']; // index .. pinky (Finger0 = thumb)
// reference (procedural) hand dimensions, from buildHand() in avatar.js
const REF_MCP = 0.095; // wrist -> middle knuckle
const REF_DISTAL = [0.0185, 0.02025, 0.019, 0.01525]; // last segment of index .. pinky
const REF_THUMB_DISTAL = 0.027;
// 26 directions (cube faces, edges, corners) tried when separating overlapping hands
const ESCAPE_DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) ESCAPE_DIRS.push(new THREE.Vector3(x, y, z).normalize());

export class HumanAvatar extends Avatar {
  _buildBody() {
    // The base class calls this from its constructor; the model loads asynchronously.
    this.body = new THREE.Group();
    this.scene.add(this.body);
    this.ready = false;
    const dummy = new THREE.MeshBasicMaterial();
    this.ref = { R: buildHand(dummy, dummy), L: buildHand(dummy, dummy) };
    this.loaded = this._load().catch((e) => {
      console.warn('Human avatar failed to load, using the procedural avatar.', e);
      this.fallback = true;
      Avatar.prototype._buildBody.call(this);
    });
  }

  async _load() {
    const tex = new THREE.TextureLoader();
    const load = (f, srgb) =>
      new Promise((res, rej) =>
        tex.load(MODEL_DIR + f, (t) => {
          t.flipY = false; // glTF UV convention
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          res(t);
        }, undefined, rej)
      );
    const [gltf, bodyC, bodyN, headC, headN, opac] = await Promise.all([
      new GLTFLoader().loadAsync(MODEL_DIR + 'aria.glb'),
      load('body_color.jpg', true), load('body_normal.jpg'), load('head_color.jpg', true), load('head_normal.jpg'), load('opacity_color.png', true),
    ]);
    const model = (this.model = gltf.scene);
    this.meshes = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; // skinned: bounds don't follow the arms
      o.castShadow = true;
      o.receiveShadow = true; // a hand in front shades the one behind: the depth cue that keeps them apart
      const m = o.material;
      if (m.name === 'f014_body') Object.assign(m, { map: bodyC, normalMap: bodyN, roughness: 0.72, metalness: 0 });
      else if (m.name === 'f014_head') Object.assign(m, { map: headC, normalMap: headN, roughness: 0.55, metalness: 0 });
      else if (m.name === 'f014_opacity') Object.assign(m, { map: opac, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
      m.needsUpdate = true;
      if (o.morphTargetDictionary) this.meshes.push(o);
    });
    this.body.add(model);
    const bone = (n) => model.getObjectByName(n.replace(/ /g, '_')) || model.getObjectByName(n);

    // face the camera (+Z)
    model.updateMatrixWorld(true);
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const eyes = wp(bone('Bip01 REye')).add(wp(bone('Bip01 LEye'))).multiplyScalar(0.5);
    const fwd = eyes.sub(wp(bone('Bip01 Head'))).setY(0).normalize();
    model.rotation.y = Math.atan2(fwd.x, fwd.z) * -1;
    model.updateMatrixWorld(true);
    // put her shoulders where keyframe space expects them
    const shR = wp(bone('Bip01 R UpperArm')), shL = wp(bone('Bip01 L UpperArm'));
    const c = shR.clone().add(shL).multiplyScalar(0.5);
    model.position.sub(c.sub(OUR_SHOULDER_C));
    model.updateMatrixWorld(true);

    // keyframe space -> world: scale around the shoulder centre to her proportions
    const sw = wp(bone('Bip01 R UpperArm')).distanceTo(wp(bone('Bip01 L UpperArm')));
    const nose = (this.nose = wp(bone('Bip01 MNose')));
    this.k = { x: sw / OUR_SHOULDER_W, y: (nose.y - OUR_SHOULDER_C.y) / OUR_NOSE_UP };
    this.k.z = this.k.x;
    this._measureBody();

    // bones + rest pose
    this.bones = { head: bone('Bip01 Head'), neck: bone('Bip01 Neck'), spine: bone('Bip01 Spine1') };
    this.side = {};
    for (const s of ['R', 'L']) {
      const b = {
        upper: bone(`Bip01 ${s} UpperArm`), fore: bone(`Bip01 ${s} Forearm`), hand: bone(`Bip01 ${s} Hand`),
        thumb: [bone(`Bip01 ${s} Finger0`), bone(`Bip01 ${s} Finger01`), bone(`Bip01 ${s} Finger02`)],
        fingers: FINGER_NAMES.map((f) => [bone(`Bip01 ${s} ${f}`), bone(`Bip01 ${s} ${f}1`), bone(`Bip01 ${s} ${f}2`)]),
      };
      const P = (o) => wp(o);
      b.L1 = P(b.upper).distanceTo(P(b.fore));
      b.L2 = P(b.fore).distanceTo(P(b.hand));
      // rest hand frame: fingers toward the middle knuckle, palm normal from index/pinky knuckles
      const w = P(b.hand), mid = P(b.fingers[1][0]), idx = P(b.fingers[0][0]), pky = P(b.fingers[3][0]);
      const yA = mid.clone().sub(w).normalize();
      const v5 = idx.clone().sub(w), v17 = pky.clone().sub(w);
      const zA = (s === 'R' ? v5.clone().cross(v17) : v17.clone().cross(v5)).normalize();
      zA.sub(yA.clone().multiplyScalar(zA.dot(yA))).normalize();
      const xA = yA.clone().cross(zA);
      b.restBasisInv = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA)).invert();
      b.palmOffset = mid.distanceTo(w) * 0.5; // wrist -> palm centre
      b.refScale = mid.distanceTo(w) / REF_MCP; // reference hand -> her hand
      // tip bones have no child: estimate their length from the segment before
      const seg = (o) => P(o).distanceTo(P(o.children.find((ch) => ch.isBone)));
      b.tipLen = b.fingers.map((ch) => seg(ch[1]) * 0.85);
      b.thumbTipLen = seg(b.thumb[1]) * 0.85;
      b.pole = new THREE.Vector3(s === 'R' ? -0.35 : 0.35, -1, -0.3).normalize();
      this.side[s] = b;
    }
    // remember every bone's rest local rotation and the axis it points along
    this.rest = new Map();
    model.traverse((o) => {
      if (!o.isBone) return;
      const child = o.children.find((ch) => ch.isBone);
      this.rest.set(o, { q: o.quaternion.clone(), axis: child ? child.position.clone().normalize() : X.clone() });
    });
    // morph targets by short name: "blendShape1.AK_09_EyeBlinkLeft" -> "EyeBlinkLeft", "...AA_VI_10_aa" -> "aa"
    this.morph = {};
    for (const m of this.meshes) {
      for (const [name, i] of Object.entries(m.morphTargetDictionary)) {
        const short = name.replace(/^.*\.(?:[A-Z]{2}_(?:VI_)?\d+_)?/, '');
        (this.morph[short] ||= []).push([m, i]);
      }
    }
    this.ready = true;
    this._apply();
  }

  // Where her head and chest surfaces are (bind pose), so palms can be kept outside them.
  _measureBody() {
    const v = new THREE.Vector3();
    let chestZ = -1, headMaxZ = -1;
    const head = [];
    for (const m of this.meshes) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 7) {
        v.fromBufferAttribute(pos, i);
        m.localToWorld(v);
        if (Math.abs(v.x) < 0.1 && v.y > 1.15 && v.y < 1.38) chestZ = Math.max(chestZ, v.z);
        if (v.y > this.nose.y - 0.12 && v.y < this.nose.y + 0.14 && Math.abs(v.x) < 0.12) head.push(v.clone());
      }
    }
    // head as an ellipsoid fitted to the vertices around the face
    const bb = new THREE.Box3().setFromPoints(head);
    this.headC = bb.getCenter(new THREE.Vector3());
    this.headR = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    this.chestZ = chestZ;
  }

  // keyframe space -> world
  _map(p) {
    const body = new THREE.Vector3(p.x * this.k.x, OUR_SHOULDER_C.y + (p.y - OUR_SHOULDER_C.y) * this.k.y, p.z * this.k.z);
    // near the face, place the hand relative to her nose so chin / mouth / forehead contacts land on her face
    const w = clamp(1 - (p.distanceTo(OUR_NOSE) - 0.08) / 0.14, 0, 1);
    if (w > 0) body.lerp(this.nose.clone().add(p.clone().sub(OUR_NOSE).multiplyScalar(this.k.x)), w);
    return this._keepOutside(body);
  }

  // push a palm target out of her head and chest (monocular dataset depth is the weakest estimate)
  _keepOutside(p) {
    const MARGIN = 0.028; // half a hand's thickness
    const r = this.headR.clone().addScalar(MARGIN);
    const d = p.clone().sub(this.headC);
    const e = (d.x / r.x) ** 2 + (d.y / r.y) ** 2 + (d.z / r.z) ** 2;
    if (e < 1) {
      // move outward along z (towards the viewer) until on the ellipsoid surface
      const zz = Math.sqrt(Math.max(0, 1 - (d.x / r.x) ** 2 - (d.y / r.y) ** 2)) * r.z;
      p.z = this.headC.z + Math.max(zz, 0.02);
    }
    if (Math.abs(p.x) < 0.16 && p.y > 0.95 && p.y < 1.45) p.z = Math.max(p.z, this.chestZ + MARGIN);
    return p;
  }

  _setWorldQuat(o, qWorld) {
    const parentQ = o.parent.getWorldQuaternion(new THREE.Quaternion());
    o.quaternion.copy(parentQ.invert().multiply(qWorld));
    o.updateMatrixWorld(true);
  }

  // rotate bone o so its pointing axis lines up with world direction dir (shortest swing)
  _aim(o, dir) {
    const qw = o.getWorldQuaternion(new THREE.Quaternion());
    const cur = this.rest.get(o).axis.clone().applyQuaternion(qw).normalize();
    const swing = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
    this._setWorldQuat(o, swing.multiply(qw));
  }

  _apply() {
    if (this.fallback) return super._apply();
    if (!this.ready) return;
    // Solve both arms; if the hands overlap, move them apart by the smallest shift that clears
    // every overlap and solve again, so two-handed signs touch instead of sinking into each other.
    const off = { R: new THREE.Vector3(), L: new THREE.Vector3() };
    const solve = () => {
      for (const [o, r] of this.rest) o.quaternion.copy(r.q);
      this.model.updateMatrixWorld(true);
      this._pose();
      for (const s of ['R', 'L']) this._solveSide(s, this.state[s], off[s]);
      return this.noHandCollision ? null : this._handOverlap(); // (switch used by tests)
    };
    // a second pass only matters when an arm hits its reach limit
    for (let it = 0, c = solve(); c && it < 2; it++) {
      const { d, t } = this._escape();
      off.R.addScaledVector(d, -(t / 2 + 0.001)); // each hand takes half of the shift
      off.L.addScaledVector(d, t / 2 + 0.001);
      c = solve();
    }
  }

  // Smallest rigid shift of the left hand relative to the right (direction d, distance t) that
  // clears every sphere overlap. The IK translates a hand without turning it, so this is exact:
  // for each sphere pair, |v + t·d| >= r1 + r2 excludes an interval of t (a quadratic's roots).
  _escape() {
    const R = this._handSpheres('R'), L = this._handSpheres('L');
    const pairs = [];
    for (const [pr, rr] of R) for (const [pl, rl] of L) {
      const v = pl.clone().sub(pr), S = rr + rl;
      if (v.length() < S + 0.12) pairs.push([v, S * S]);
    }
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
      for (const [t1, t2] of iv) if (t1 < t && t2 > t) t = t2; // sorted by start: first gap wins
      if (!best || t < best.t) best = { d, t };
    }
    return best;
  }

  // Spheres along each hand (wrist, palm, knuckles, finger joints, tips), sized to her hand.
  _handSpheres(s) {
    const b = this.side[s];
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const out = [];
    const wrist = wp(b.hand), mcp = b.fingers.map((f) => wp(f[0]));
    const palmC = mcp.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / 4).lerp(wrist, 0.45);
    out.push([wrist, 0.016], [palmC, 0.015], [palmC.clone().lerp(mcp[0], 0.5), 0.013], [palmC.clone().lerp(mcp[3], 0.5), 0.013]);
    b.fingers.forEach((ch, f) => {
      ch.forEach((o, j) => out.push([wp(o), j ? 0.0085 : 0.011]));
      out.push([this._tip(ch[2], b.tipLen[f]), 0.0075]);
    });
    b.thumb.forEach((o, j) => j && out.push([wp(o), 0.0095]));
    out.push([this._tip(b.thumb[2], b.thumbTipLen), 0.0085]);
    return out;
  }

  // Deepest overlap between the two hands: {dir: unit vector from right hand to left, depth} or null.
  _handOverlap() {
    const R = this._handSpheres('R'), L = this._handSpheres('L');
    // quick reject: hands far apart
    if (R[1][0].distanceTo(L[1][0]) > 0.3) return null;
    let depth = 0, total = 0;
    const dir = new THREE.Vector3(), deepest = new THREE.Vector3(1, 0, 0);
    for (const [pr, rr] of R) {
      for (const [pl, rl] of L) {
        const v = pl.clone().sub(pr);
        const pen = rr + rl - v.length();
        if (pen <= 0) continue;
        const u = v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
        if (pen > depth) (depth = pen), deepest.copy(u);
        dir.addScaledVector(u, pen);
        total += pen;
      }
    }
    if (depth < 0.001) return null;
    // contacts on both sides of a hand (fingers across a palm) cancel out: then use the deepest one
    return { dir: dir.length() > 0.5 * total ? dir.normalize() : deepest, depth };
  }

  // end point of a bone that has no child bone (fingertips)
  _tip(o, len) {
    return o.localToWorld(this.rest.get(o).axis.clone().multiplyScalar(len / o.getWorldScale(new THREE.Vector3()).x));
  }

  _pose() {
    // breathing + head motion computed in _animateFace, applied before the arms
    const h = this.headMotion;
    if (!h) return;
    this.bones.spine.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, h.breathe));
    this.bones.spine.updateMatrixWorld(true);
    const head = this.bones.head;
    const qw = head.getWorldQuaternion(new THREE.Quaternion());
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(h.x, h.y, h.z, 'YXZ'));
    this._setWorldQuat(head, q.multiply(qw));
  }

  _solveSide(s, st, offset) {
    const b = this.side[s];
    const hq = st.q; // target hand frame (X, Y = fingers, Z = palm normal), same axes as world
    // hand orientation: rest basis -> target basis, applied to the bone's rest world rotation
    const handRestW = b.hand.getWorldQuaternion(new THREE.Quaternion());
    const handW = hq.clone().multiply(b.restBasisInv).multiply(handRestW);
    // wrist target from the palm centre (plus any push from the other hand)
    const palm = this._map(st.p);
    if (offset) palm.add(offset);
    const fingerDir = Y.clone().applyQuaternion(hq);
    const W = palm.sub(fingerDir.multiplyScalar(b.palmOffset));
    // two-bone IK
    const S = b.upper.getWorldPosition(new THREE.Vector3());
    const d = W.clone().sub(S);
    const dist = clamp(d.length(), Math.abs(b.L1 - b.L2) + 0.01, b.L1 + b.L2 - 0.002);
    const u = d.normalize();
    const cosA = (b.L1 * b.L1 + dist * dist - b.L2 * b.L2) / (2 * b.L1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const w = b.pole.clone().sub(u.clone().multiplyScalar(b.pole.dot(u))).normalize();
    const E = S.clone().add(u.clone().multiplyScalar(b.L1 * cosA)).add(w.multiplyScalar(b.L1 * sinA));
    const Wc = S.clone().add(u.clone().multiplyScalar(dist));
    this._aim(b.upper, E.clone().sub(S));
    this._aim(b.fore, Wc.clone().sub(E));
    // spread the wrist twist: turn the forearm half-way toward the hand's roll
    this._shareTwist(b, handW);
    this._setWorldQuat(b.hand, handW);
    this._fingers(s, b, st, hq);
  }

  _shareTwist(b, handW) {
    const foreW = b.fore.getWorldQuaternion(new THREE.Quaternion());
    const axis = this.rest.get(b.fore).axis.clone().applyQuaternion(foreW).normalize();
    // rotation still needed from the forearm's frame (with the hand's rest offset) to the target hand
    const restLocal = this.rest.get(b.hand).q;
    const need = handW.clone().multiply(foreW.clone().multiply(restLocal).invert());
    // twist part of `need` around the forearm axis
    const v = new THREE.Vector3(need.x, need.y, need.z);
    const proj = axis.clone().multiplyScalar(v.dot(axis));
    const twist = new THREE.Quaternion(proj.x, proj.y, proj.z, need.w);
    if (twist.length() < 1e-6) return; // 180° swing: no well-defined twist
    twist.normalize();
    const half = new THREE.Quaternion().slerp(twist, 0.5);
    this._setWorldQuat(b.fore, half.multiply(foreW));
  }

  _fingers(s, b, st, hq) {
    const ref = this.ref[s];
    applyShape(ref, st.s);
    ref.root.updateMatrixWorld(true);
    // reference hand local frame -> world: the target hand frame (mirrored in x for the left hand)
    const toWorld = (v) => {
      if (s === 'L') v.x = -v.x;
      return v.applyQuaternion(hq);
    };
    const segDir = (g) => toWorld(Y.clone().applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())));
    for (let f = 0; f < 4; f++) for (let j = 0; j < 3; j++) this._aim(b.fingers[f][j], segDir(ref.fingers[f][j]));
    for (let j = 0; j < 3; j++) this._aim(b.thumb[j], segDir(ref.thumb[j]));

    // Thumb by joint positions, not just directions: her thumb starts nearer the wrist than the
    // reference one, so matching directions alone splays it (A, C) or misses the fingertips (O, F).
    // Aim each thumb bone at the scaled position of the next reference joint.
    const refTip = (g, len) => g.localToWorld(new THREE.Vector3(0, len, 0)); // ref root is at the origin
    const wrist = b.hand.getWorldPosition(new THREE.Vector3());
    const toHer = (v) => wrist.clone().add(toWorld(v.clone().multiplyScalar(b.refScale)));
    const tRef = refTip(ref.thumb[2], REF_THUMB_DISTAL);
    const goals = [ref.thumb[1].getWorldPosition(new THREE.Vector3()), ref.thumb[2].getWorldPosition(new THREE.Vector3()), tRef].map(toHer);
    for (let j = 0; j < 3; j++) this._aim(b.thumb[j], goals[j].clone().sub(b.thumb[j].getWorldPosition(new THREE.Vector3())));
    // keep contacts: if the reference thumb touches a fingertip, touch her matching fingertip
    const tip = (o, len) => this._tip(o, len);
    let best = 0, bestTip = null;
    for (let f = 0; f < 4; f++) {
      const d = tRef.distanceTo(refTip(ref.fingers[f][2], REF_DISTAL[f]));
      const w = clamp(1 - (d - 0.012) / 0.02, 0, 1);
      if (w > best) (best = w), (bestTip = tip(b.fingers[f][2], b.tipLen[f]));
    }
    if (!bestTip) return;
    const target = tip(b.thumb[2], b.thumbTipLen).lerp(bestTip, best);
    // a couple of CCD passes over the outer two thumb bones to close the gap
    const effector = () => tip(b.thumb[2], b.thumbTipLen);
    for (let it = 0; it < 3; it++) {
      for (let j = 2; j >= 1; j--) {
        const o = b.thumb[j];
        const p = o.getWorldPosition(new THREE.Vector3());
        const cur = effector().sub(p), want = target.clone().sub(p);
        if (cur.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) continue;
        const swing = new THREE.Quaternion().setFromUnitVectors(cur.normalize(), want.normalize());
        this._setWorldQuat(o, swing.multiply(o.getWorldQuaternion(new THREE.Quaternion())));
      }
    }
  }

  _idle(time) {
    if (this.fallback) return super._idle(time);
    this._time = time;
  }

  _applyMorph(name, v) {
    const list = this.morph[name];
    if (list) for (const [m, i] of list) m.morphTargetInfluences[i] = v;
  }

  // Dataset signs carry the signer's face per keyframe ({bs: {ARKit name: 0..1}, head: [pitch, yaw, roll]}).
  // Ease toward the current keyframe's face; returns the eased values.
  _datasetFace(dt) {
    const fr = this.frame;
    const target = fr && !fr.isRest && fr.face?.bs ? fr.face : null;
    const k = 1 - Math.pow(1e-5, dt); // quick: dataset keyframes are ~0.1-0.3 s apart
    const cur = (this.ds ||= { bs: {}, head: [0, 0, 0] });
    const names = new Set([...Object.keys(cur.bs), ...Object.keys(target?.bs || {})]);
    for (const n of names) {
      cur.bs[n] = lerp(cur.bs[n] || 0, target?.bs[n] || 0, k);
      if (!target && cur.bs[n] < 0.005) delete cur.bs[n];
    }
    for (let i = 0; i < 3; i++) cur.head[i] = lerp(cur.head[i], (target?.head?.[i] || 0) * 0.6, k); // head angles are noisy: 60%
    cur.active = !!target;
    return cur;
  }

  _animateFace(dt, time, nod, shake) {
    if (this.fallback) return super._animateFace(dt, time, nod, shake);
    if (!this.ready) return;
    const F = this.face;
    const k = this._faceStep(dt);
    const ds = this._datasetFace(dt);
    // head: nods / shakes from signs + the signer's head motion + a little life; applied in _pose() on the next frame
    this.headMotion = {
      x: nod + ds.head[0] + Math.sin(time * 0.7) * 0.015 - F.brow * 0.03,
      y: shake + ds.head[1] + Math.sin(time * 0.43) * 0.03,
      z: F.tilt * 0.22 + ds.head[2] + Math.sin(time * 0.5) * 0.01,
      breathe: Math.sin(time * 1.6) * 0.008,
    };
    const set = {}; // this frame's morph values, applied once at the end
    const put = (n, v) => (set[n] = v);
    // eyes
    const closed = Math.max(Math.sin(this.blink * Math.PI), 1 - F.eyes);
    put('EyeBlinkLeft', closed);
    put('EyeBlinkRight', closed);
    const gz = (this.gazeS ||= [0, 0]);
    const tg = this.gaze || [0, 0];
    gz[0] = lerp(gz[0], tg[0], k);
    gz[1] = lerp(gz[1], tg[1], k);
    const look = (v) => clamp(v * 3, 0, 1);
    put('EyeLookOutLeft', look(gz[0]));
    put('EyeLookInRight', look(gz[0]));
    put('EyeLookInLeft', look(-gz[0]));
    put('EyeLookOutRight', look(-gz[0]));
    put('EyeLookUpLeft', look(-gz[1]));
    put('EyeLookUpRight', look(-gz[1]));
    put('EyeLookDownLeft', look(gz[1]));
    put('EyeLookDownRight', look(gz[1]));
    // brows: raised for questions (brow > 0), lowered/frown (brow < 0)
    put('BrowInnerUp', clamp(F.brow, 0, 1) * 0.9);
    put('BrowOuterUpLeft', clamp(F.brow, 0, 1) * 0.7);
    put('BrowOuterUpRight', clamp(F.brow, 0, 1) * 0.7);
    put('BrowDownLeft', clamp(-F.brow, 0, 1));
    put('BrowDownRight', clamp(-F.brow, 0, 1));
    if (F.brow > 0) {
      put('EyeWideLeft', F.brow * 0.35);
      put('EyeWideRight', F.brow * 0.35);
    }
    // smile
    put('MouthSmileLeft', F.smile * 0.55);
    put('MouthSmileRight', F.smile * 0.55);
    put('CheekSquintLeft', F.smile * 0.25);
    put('CheekSquintRight', F.smile * 0.25);
    // speech / mouthing: cycle visemes while talking (full) or signing (light mouthing);
    // a dataset sign brings its own mouth, so no generic mouthing then
    const amt = this.talking ? 1 : this.busy && !ds.active ? 0.35 : 0;
    const VIS = ['aa', 'E', 'O', 'I', 'U', 'PP', 'SS', 'FF', 'DD', 'nn'];
    this.visT = (this.visT || 0) + dt * (this.talking ? 9 : 5);
    const i = Math.floor(this.visT) % VIS.length, frac = this.visT % 1;
    VIS.forEach((v, j) => {
      const on = j === i ? 1 - frac : j === (i + 1) % VIS.length ? frac : 0;
      put(v, on * amt * 0.8);
    });
    put('JawOpen', amt * (0.12 + 0.1 * Math.sin(time * 11)));

    // merge the signer's face on top (stronger of the two wins), then apply everything
    for (const [n, v] of Object.entries(ds.bs)) set[n] = Math.max(set[n] || 0, v);
    const touched = (this._touched ||= new Set());
    for (const n of touched) if (!(n in set)) this._applyMorph(n, 0); // shapes no longer in use
    touched.clear();
    for (const [n, v] of Object.entries(set)) {
      this._applyMorph(n, clamp(v, 0, 1));
      touched.add(n);
    }
  }
}
