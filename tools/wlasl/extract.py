"""Convert WLASL videos into avatar keyframes (public/signs/wlasl/<GLOSS>.json).

For each video: MediaPipe Holistic gives body pose + both hands per frame. We retarget that
onto Aria's body (see public/js/signs.js for the frame format):
  p  palm centre in avatar space   (from pose world landmarks, scaled to Aria's shoulders)
  f  finger direction              (wrist -> middle knuckle)
  n  palm normal                   (out of the palm)
  h  16 handshape numbers          (finger joint bends, spread, thumb a/o/c fitted by forward kinematics)
Then trim to the part where the hands are up, smooth, reduce to keyframes, and write JSON.

Usage:
  python extract.py                 # every gloss in data/manifest.json not converted yet (with face data)
  python extract.py --list data/hotel_words.txt   # the words in that file (see select_words.py), resumable
  python extract.py --force         # redo all of them
  python extract.py book hello      # just these
  python extract.py --set isl       # Indian Sign Language: ../include/data -> public/signs/isl (see ../include/fetch.py)

Each keyframe also carries the signer's face: 'face': {'bs': {ARKit blendshape: 0..1}, 'head': [pitch, yaw, roll]},
relative to their neutral face at rest.
"""
import json
import math
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

HERE = Path(__file__).parent
DATA = HERE / 'data'
OUT = HERE.parent.parent / 'public' / 'signs' / 'wlasl'
SETS = {'isl': (HERE.parent / 'include' / 'data', HERE.parent.parent / 'public' / 'signs' / 'isl')}
MODEL = HERE / 'models' / 'holistic_landmarker.task'

# --- avatar constants (keep in sync with public/js/avatar.js) ---
SHOULDER_C = np.array([0.0, 1.435, 0.0])
NOSE = np.array([0.0, 1.685, 0.1])  # nose tip (headPivot 1.57 + head 0.12, nose z ~0.1)
SHOULDER_W = 0.38
PALM_OFFSET = 0.047
MAXB = np.array([1.55, 1.75, 1.2])
SPREAD_RANGE = 0.41  # SPREAD[3] - SPREAD[0] in avatar.js
HAND_MCP_Y = 0.095  # middle knuckle height in hand space (avatar.js finger defs)
THUMB_ROOT = np.array([0.027, 0.02, 0.005])
THUMB_LENS = [0.04, 0.031, 0.027]
REST_Y = 1.02  # palm below this (avatar space) = hand at rest
FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
GOOD_ENOUGH = 0.6  # hand-tracking quality at which we don't bother with a word's next clip

M = np.array([1.0, -1.0, -1.0])  # MediaPipe (x right, y down, z away) -> avatar (x right, y up, z toward viewer)


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def angle(a, b):
    return math.acos(float(np.clip(np.dot(unit(a), unit(b)), -1, 1)))


def arr(lms):
    return np.array([[l.x, l.y, l.z] for l in lms]) * M


# ---------- thumb forward kinematics (mirrors applyShape in avatar.js) ----------
def rx(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rz(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def thumb_fk(a, o, c):
    R0 = rx(0.3 + o * 0.5) @ rz(-0.4 - a * 0.95 + o * 1.25)  # three.js Euler 'XYZ' with y = 0
    R1 = R0 @ rx(c * 0.7 + o * 0.15)
    R2 = R1 @ rx(c * 1.05)
    j1 = THUMB_ROOT + R0 @ [0, THUMB_LENS[0], 0]
    j2 = j1 + R1 @ [0, THUMB_LENS[1], 0]
    tip = j2 + R2 @ [0, THUMB_LENS[2], 0]
    return j1, j2, tip


GRID = np.linspace(0, 1, 11)
THUMB_TABLE = [((a, o, c), *thumb_fk(a, o, c)) for a in GRID for o in GRID for c in GRID]


def fit_thumb(j1, j2, tip):
    best, bd = None, 1e9
    for prm, f1, f2, ft in THUMB_TABLE:
        d = np.sum((ft - tip) ** 2) + 0.5 * np.sum((f2 - j2) ** 2) + 0.25 * np.sum((f1 - j1) ** 2)
        if d < bd:
            best, bd = prm, d
    return best


# ---------- one hand -> {f, n, shape} ----------
def hand_pose(hw, side):
    """hw: 21x3 hand world landmarks (avatar axes). side: 'R' or 'L'."""
    w = hw[0]
    f = unit(hw[9] - w)
    v5, v17 = hw[5] - w, hw[17] - w
    n = unit(np.cross(v5, v17) if side == 'R' else np.cross(v17, v5))
    n = unit(n - f * np.dot(n, f))
    shape = []
    for m, p, d, t in FINGERS:
        base = hw[m] - w
        seg = [hw[p] - hw[m], hw[d] - hw[p], hw[t] - hw[d]]
        b = [angle(base, seg[0]), angle(seg[0], seg[1]), angle(seg[1], seg[2])]
        if np.dot(seg[0], n) < 0:  # knuckle bent backwards (hyperextended) -> straight
            b[0] = 0.0
        b[0] = max(0.0, b[0] - 0.12)  # wrist->knuckle line is not quite along the straight finger
        shape += list(np.clip(np.array(b) / MAXB * 1.1, 0, 1))
    # spread: angle between index and pinky proximal segments, in the palm plane
    def inplane(v):
        return unit(v - n * np.dot(v, n))
    spr = angle(inplane(hw[6] - hw[5]), inplane(hw[18] - hw[17]))
    shape.append(float(np.clip((spr - 0.18) / SPREAD_RANGE, -0.5, 1)))
    # thumb: express joints in the hand's local frame (Y = fingers, Z = palm out, X = Y x Z),
    # scale to Aria's hand, and fit the avatar thumb's a/o/c by forward kinematics.
    X = np.cross(f, n)
    Rl = np.stack([X, f, n])  # rows = local axes
    sc = HAND_MCP_Y / (np.linalg.norm(hw[9] - w) or 1)
    loc = lambda i: Rl @ (hw[i] - w) * sc * (np.array([1, 1, 1]) if side == 'R' else np.array([-1, 1, 1]))
    a, o, c = fit_thumb(loc(2), loc(3), loc(4))
    shape += [a, o, c]
    return f, n, [round(float(x), 3) for x in shape]


# ---------- video -> per-frame raw poses ----------
def run_video(path, landmarker, ts0):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames, i = [], 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        h, w = fr.shape[:2]
        s = 640 / max(h, w)
        if s < 1:
            fr = cv2.resize(fr, (int(w * s), int(h * s)))
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
        r = landmarker.detect_for_video(img, ts0 + int(i * 1000 / fps))
        frames.append(r)
        i += 1
    cap.release()
    return frames, fps, ts0 + int(i * 1000 / fps) + 1000


def retarget(results):
    """-> list of {'R': (p,f,n,shape) | None, 'L': ...} in avatar space, or None per frame without a body."""
    out = []
    for r in results:
        if not r.pose_world_landmarks:
            out.append(None)
            continue
        pw = arr(r.pose_world_landmarks)
        sc_mid = (pw[11] + pw[12]) / 2
        sw = np.linalg.norm(pw[11] - pw[12]) or 0.35
        k = SHOULDER_W / sw
        # torso frame: X = signer's right -> left shoulder, Y = hips -> shoulders, Z = out of the chest.
        # Expressing everything in it undoes the signer turning away from the camera.
        X = unit(pw[11] - pw[12])
        Y = (pw[11] + pw[12]) / 2 - (pw[23] + pw[24]) / 2
        Y = unit(Y - X * np.dot(Y, X))
        B = np.stack([X, Y, np.cross(X, Y)])
        fr = {'nose': B @ (pw[0] - sc_mid) * k}
        # face: the 52 ARKit blendshape scores, and head pitch / yaw / roll relative to the torso
        # (from the ears and nose; pitch > 0 = looking down, yaw > 0 = turning to her left)
        fr['bs'] = np.array([c.score for c in r.face_blendshapes]) if r.face_blendshapes else None
        ev = B @ (pw[7] - pw[8])
        nm = B @ (pw[0] - (pw[7] + pw[8]) / 2)
        fr['head'] = np.array([math.atan2(-nm[1], nm[2]), math.atan2(-ev[2], ev[0]), math.atan2(ev[1], ev[0])])
        for side, wi, hand in (('R', 16, r.right_hand_world_landmarks), ('L', 15, r.left_hand_world_landmarks)):
            wrist = B @ (pw[wi] - sc_mid) * k  # relative to the shoulder centre
            if hand:
                f, n, shape = hand_pose(arr(hand), side)
                f, n = B @ f, B @ n
            else:
                f = n = shape = None
            fr[side] = {'w': wrist, 'f': f, 'n': n, 'h': shape}
        out.append(fr)
    return out


def body_clamp(p):
    """Keep palms in front of Aria's body; monocular depth is the weakest part of the estimate."""
    x, y, z = p
    if y > 1.5 and abs(x) < 0.12:
        z = max(z, 0.12)  # face
    elif 0.9 < y <= 1.5 and abs(x) < 0.22:
        z = max(z, 0.2)  # chest / belly
    else:
        z = max(z, 0.1)
    return np.array([x, y, z])


def fill(seq, key):
    """Linearly fill None gaps in seq[i][key]; returns False if nothing was detected at all."""
    idx = [i for i, v in enumerate(seq) if v[key] is not None]
    if not idx:
        return False
    for i in range(len(seq)):
        if seq[i][key] is None:
            prev = max([j for j in idx if j < i], default=None)
            nxt = min([j for j in idx if j > i], default=None)
            if prev is None:
                seq[i][key] = seq[nxt][key]
            elif nxt is None:
                seq[i][key] = seq[prev][key]
            else:
                u = (i - prev) / (nxt - prev)
                a, b = np.array(seq[prev][key], float), np.array(seq[nxt][key], float)
                seq[i][key] = a + (b - a) * u
    return True


def smooth(values, k=2):
    v = np.array(values, float)
    out = v.copy()
    for i in range(len(v)):
        lo, hi = max(0, i - k), min(len(v), i + k + 1)
        out[i] = v[lo:hi].mean(axis=0)
    return out


def rdp(points, eps):
    """Ramer-Douglas-Peucker on an (n, d) array -> kept indices."""
    if len(points) < 3:
        return list(range(len(points)))
    a, b = points[0], points[-1]
    ab = b - a
    L = np.linalg.norm(ab)
    if L < 1e-9:
        d = np.linalg.norm(points - a, axis=1)
    else:
        t = np.clip(((points - a) @ ab) / (L * L), 0, 1)
        d = np.linalg.norm(points - (a + np.outer(t, ab)), axis=1)
    i = int(np.argmax(d))
    if d[i] > eps:
        left = rdp(points[: i + 1], eps)
        right = rdp(points[i:], eps)
        return left[:-1] + [x + i for x in right]
    return [0, len(points) - 1]


def to_keyframes(frames, fps):
    orig = [i for i, f in enumerate(frames) if f is not None]  # video frame numbers, for previews
    frames = [frames[i] for i in orig]
    if len(frames) < 8:
        return None, 'too few frames with a body'
    # which frames have hands up
    up = {s: [f[s]['h'] is not None and SHOULDER_C[1] + f[s]['w'][1] + 0.03 > REST_Y for f in frames] for s in 'RL'}
    motion = {s: sum(up[s]) for s in 'RL'}
    dom = 'R' if motion['R'] >= motion['L'] else 'L'
    if motion[dom] < 4:
        return None, 'no hand detected above the waist'
    # trim the raise from / drop to rest: keep frames where the dominant palm is in the upper part
    # of its own height range for this clip (Aria moves from rest by herself)
    ys = [SHOULDER_C[1] + frames[i][dom]['w'][1] for i in range(len(frames)) if up[dom][i]]
    lo_y, hi_y = min(ys), max(ys)
    cut = lo_y + 0.3 * (hi_y - lo_y) if hi_y - lo_y > 0.12 else REST_Y
    act = [i for i in range(len(frames)) if up[dom][i] and SHOULDER_C[1] + frames[i][dom]['w'][1] >= cut]
    if len(act) < 3:
        act = [i for i in range(len(frames)) if up[dom][i]]
    lo, hi = act[0], act[-1] + 1
    seg = frames[lo:hi]
    use_other = motion['L' if dom == 'R' else 'R'] >= max(4, 0.25 * motion[dom])

    tracks = {}
    for s in 'RL':
        if s != dom and not use_other:
            continue
        rows = [{'w': f[s]['w'], 'f': f[s]['f'], 'n': f[s]['n'], 'h': f[s]['h']} for f in seg]
        if not all(fill(rows, k) for k in ('f', 'n', 'h')):
            continue
        W = smooth([r['w'] for r in rows])
        F = smooth([r['f'] for r in rows])
        N = smooth([r['n'] for r in rows])
        H = smooth([r['h'] for r in rows], 1)
        NO = smooth([f['nose'] for f in seg])
        P = []
        for i in range(len(rows)):
            palm = W[i] + unit(F[i]) * PALM_OFFSET
            # near the face, place the hand relative to Aria's face instead of her shoulders,
            # so chin / forehead / cheek contacts land on her face
            wgt = float(np.clip(1 - (np.linalg.norm(palm - NO[i]) - 0.1) / 0.15, 0, 1))
            palm = palm + wgt * ((NOSE - SHOULDER_C) - NO[i])
            P.append(body_clamp(SHOULDER_C + palm))
        tracks[s] = (np.array(P), F, N, H)
    if dom not in tracks:
        return None, 'dominant hand lost'

    # left-dominant signer -> mirror so Aria always signs right-handed
    if dom == 'L':
        mir = lambda T: (T[0] * [-1, 1, 1], T[1] * [-1, 1, 1], T[2] * [-1, 1, 1], T[3])
        tracks = {('R' if s == 'L' else 'L'): mir(T) for s, T in tracks.items()}

    face = face_track(frames, lo, hi, mirror=dom == 'L')

    # keyframes: RDP on the palm path + handshape change (both hands)
    feat = [np.hstack([T[0] * 12, T[3] * 0.6]) for T in tracks.values()]
    keep = sorted(set(rdp(np.hstack(feat), 0.35)))
    # never leave more than ~0.3 s between keyframes
    gap = max(2, int(fps * 0.3))
    full = []
    for a, b in zip(keep, keep[1:]):
        full += list(range(a, b, gap))
    full = sorted(set(full + [keep[-1]]))

    out = []
    prev_i = None
    for i in full:
        fr = {'t': 0.32 if prev_i is None else round(max(0.05, (i - prev_i) / fps), 3), 'hold': 0, 'lin': 1}
        for s in 'RL':
            if s in tracks:
                P, F, N, H = tracks[s]
                fr[s] = {'p': [round(float(x), 3) for x in P[i]], 'f': [round(float(x), 3) for x in unit(F[i])],
                         'n': [round(float(x), 3) for x in unit(N[i])], 'h': [round(float(x), 3) for x in H[i]]}
            else:
                fr[s] = None
        if face:
            bs, head = face[0][i], face[1][i]
            fr['face'] = {'bs': {FACE_NAMES[j]: round(float(v), 2) for j, v in enumerate(bs) if v >= 0.08},
                          'head': [round(float(x), 3) for x in head]}
        out.append(fr)
        prev_i = i
    out[0]['lin'] = 0  # ease in from wherever the avatar was
    out[-1]['hold'] = 0.1
    return {'frames': out, 'videoFrames': [orig[lo + i] for i in full], 'dominant': dom, 'twoHanded': len(tracks) == 2}, None


# MediaPipe's 52 face blendshapes, in its output order; '' = not used (blinks and gaze are incidental
# in the videos, Aria blinks and looks around by herself). Names match the avatar's ARKit morphs.
MP_FACE = ('_neutral browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekPuff cheekSquintLeft cheekSquintRight '
           'eyeBlinkLeft eyeBlinkRight eyeLookDownLeft eyeLookDownRight eyeLookInLeft eyeLookInRight eyeLookOutLeft eyeLookOutRight '
           'eyeLookUpLeft eyeLookUpRight eyeSquintLeft eyeSquintRight eyeWideLeft eyeWideRight jawForward jawLeft jawOpen jawRight '
           'mouthClose mouthDimpleLeft mouthDimpleRight mouthFrownLeft mouthFrownRight mouthFunnel mouthLeft mouthLowerDownLeft '
           'mouthLowerDownRight mouthPressLeft mouthPressRight mouthPucker mouthRight mouthRollLower mouthRollUpper mouthShrugLower '
           'mouthShrugUpper mouthSmileLeft mouthSmileRight mouthStretchLeft mouthStretchRight mouthUpperUpLeft mouthUpperUpRight '
           'noseSneerLeft noseSneerRight').split()
FACE_NAMES = [n[0].upper() + n[1:] for n in MP_FACE]
FACE_USE = np.array([not (n.startswith(('_', 'eyeBlink', 'eyeLook'))) for n in MP_FACE])
MIRROR = [FACE_NAMES.index(n.replace('Left', '#').replace('Right', 'Left').replace('#', 'Right')) for n in FACE_NAMES]


def face_track(frames, lo, hi, mirror=False):
    """Blendshapes + head angles for frames[lo:hi], relative to the signer's own neutral face.
    Neutral = median of the frames outside the sign (hands at rest); returns (bs[n,52], head[n,3]) or None."""
    have = [i for i, f in enumerate(frames) if f['bs'] is not None and len(f['bs']) == len(MP_FACE)]
    if len(have) < 3:
        return None
    rest = [i for i in have if i < lo or i >= hi] or have
    bs0 = np.median([frames[i]['bs'] for i in rest], axis=0)
    head0 = np.median([frames[i]['head'] for i in rest], axis=0)
    rows = [{'bs': frames[i]['bs'] if frames[i]['bs'] is not None and len(frames[i]['bs']) == len(MP_FACE) else None,
             'head': frames[i]['head']} for i in range(lo, hi)]
    if not fill(rows, 'bs'):
        return None
    bs = np.clip(smooth([r['bs'] for r in rows], 1) - bs0, 0, 1) * FACE_USE
    head = np.clip(smooth([r['head'] for r in rows], 2) - head0, -0.45, 0.45)
    if mirror:  # swap left/right shapes; yaw and roll change sign
        bs = bs[:, MIRROR]
        head = head * [1, -1, -1]
    return bs, head


def quality(frames):
    """Fraction of frames with a body where the (either) hand is detected."""
    fs = [f for f in frames if f]
    if not fs:
        return 0
    return sum(1 for f in fs if f['R']['h'] is not None or f['L']['h'] is not None) / len(fs)


def token(gloss):
    return gloss.upper().replace(' ', '-').replace('_', '-')


def has_face(path):
    try:
        return json.loads(path.read_text()).get('faceData', False)
    except (OSError, ValueError):
        return False


def main():
    global DATA, OUT
    argv = sys.argv[1:]
    if '--set' in argv:
        DATA, OUT = SETS[argv[argv.index('--set') + 1]]
    manifest = json.loads((DATA / 'manifest.json').read_text())
    force = '--force' in argv
    word_list = argv[argv.index('--list') + 1] if '--list' in argv else None
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and not (i and argv[i - 1] in ('--list', '--set'))]
    if word_list:
        want = [l.strip().lower() for l in Path(word_list).read_text(encoding='utf-8').splitlines() if l.strip()]
    else:
        want = [g.lower() for g in args] or list(manifest)
    OUT.mkdir(parents=True, exist_ok=True)
    if not args and not force:  # resume: skip signs already converted (with face data)
        want = [g for g in want if not has_face(OUT / f'{token(g)}.json')]
    missing = [g for g in want if g not in manifest]
    if missing:
        print(f'no downloaded video for {len(missing)} word(s): {", ".join(missing)}')
        want = [g for g in want if g in manifest]
    opts = vision.HolisticLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(MODEL)), running_mode=vision.RunningMode.VIDEO,
                                            output_face_blendshapes=True)
    report = {}
    for n, gloss in enumerate(want, 1):
        best = None
        for v in manifest.get(gloss, []):
            try:
                # fresh tracker per video so tracking state never leaks between clips
                with vision.HolisticLandmarker.create_from_options(opts) as lm:
                    res, fps, _ = run_video(DATA / v['file'], lm, 0)
                raw = retarget(res)
                kf, err = to_keyframes(raw, fps)
            except Exception as e:  # corrupt video etc.
                kf, err, raw = None, f'{type(e).__name__}: {e}', []
            q = quality(raw) if kf else 0
            if kf and (best is None or q > best[0]):
                best = (q, kf, v)
            if not kf:
                report.setdefault(gloss, []).append(err)
            if best and best[0] >= GOOD_ENOUGH:
                break  # clips are in preference order; skip the rest when this one tracked well
        if best:
            q, kf, v = best
            doc = {'gloss': token(gloss), 'source': {'dataset': v.get('dataset', 'WLASL'), 'video_id': v['video_id'], 'site': v['source'], 'url': v['url']},
                   'quality': round(q, 2), 'faceData': any('face' in f for f in kf['frames']), **kf}
            (OUT / f'{token(gloss)}.json').write_text(json.dumps(doc, separators=(',', ':')))
            print(f'[{n}/{len(want)}] {gloss}: {len(kf["frames"])} keyframes, quality {q:.2f}, {"two" if kf["twoHanded"] else "one"}-handed', flush=True)
        else:
            print(f'[{n}/{len(want)}] {gloss}: FAILED {report.get(gloss)}', flush=True)
        if n % 25 == 0:
            write_index()  # so the running app picks up new signs during a long run
    print(f'\nindex: {write_index()} signs')


# Signs the app may use: well tracked, and a sensible length (a clip taken from a long video, e.g. a
# lesson rather than a dictionary entry, produces hundreds of keyframes and is left out).
MIN_QUALITY = 0.5
MAX_KEYFRAMES = 60


def usable(path):
    d = json.loads(path.read_text())
    return d.get('quality', 0) >= MIN_QUALITY and len(d.get('frames', [])) <= MAX_KEYFRAMES


def write_index():
    idx = sorted(p.stem for p in OUT.glob('*.json') if p.stem != 'index' and usable(p))
    (OUT / 'index.json').write_text(json.dumps(idx))
    return len(idx)


if __name__ == '__main__':
    main()
