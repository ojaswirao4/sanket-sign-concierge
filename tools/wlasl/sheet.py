"""Side-by-side sheets: source video frame (top) vs Aria (bottom) at the same keyframes.
Run after preview.mjs. Writes preview/sheet_<GLOSS>.png and preview/sheet_all.png."""
import json
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).parent
PREV = HERE / 'preview'
SIGNS = HERE.parent.parent / 'public' / 'signs' / 'wlasl'
manifest = json.loads((HERE / 'data' / 'manifest.json').read_text())
picks = json.loads((PREV / 'picks.json').read_text())
H = 220


def fit(img, h=H):
    return cv2.resize(img, (int(img.shape[1] * h / img.shape[0]), h))


def video_frame(path, n):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, n)
    ok, fr = cap.read()
    return fr if ok else np.zeros((H, H, 3), np.uint8)


rows = []
for gloss, ks in picks.items():
    doc = json.loads((SIGNS / f'{gloss}.json').read_text())
    key = gloss.lower().replace('-', ' ')
    v = next(v for v in manifest[key] if v['video_id'] == doc['source']['video_id'])
    top = [fit(video_frame(HERE / 'data' / v['file'], p['vf'])) for p in ks]
    bot = [fit(cv2.imread(str(PREV / f"{gloss}_{p['k']}.png"))) for p in ks]
    cols = []
    for t, b in zip(top, bot):
        w = max(t.shape[1], b.shape[1])
        pad = lambda im: cv2.copyMakeBorder(im, 0, 0, 0, w - im.shape[1], cv2.BORDER_CONSTANT)
        cols.append(np.vstack([pad(t), pad(b)]))
    sheet = np.hstack([np.pad(c, ((0, 0), (0, 6), (0, 0))) for c in cols])
    label = np.zeros((34, sheet.shape[1], 3), np.uint8)
    cv2.putText(label, f"{gloss}  ({doc['source']['site']}, quality {doc['quality']})", (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    sheet = np.vstack([label, sheet])
    cv2.imwrite(str(PREV / f'sheet_{gloss}.png'), sheet)
    rows.append(sheet)
    print('sheet', gloss)
