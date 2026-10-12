"""Download WLASL videos: a few clean instances per gloss.

Usage:
  python download.py --glosses book deaf help      # specific words
  python download.py --top 2000 --per 2            # the whole WLASL2000 list

Videos land in data/videos/<gloss>/<video_id>.mp4; data/manifest.json records
the frame range of the sign inside each video. Already-downloaded files are skipped,
so the script can be re-run to resume.
"""
import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

HERE = Path(__file__).parent
DATA = HERE / 'data'
VIDEOS = DATA / 'videos'
MANIFEST = DATA / 'manifest.json'

# Studio dictionary clips first (one signer, plain background, front view); YouTube last.
PREFER = ['aslsignbank', 'signingsavvy', 'spreadthesign', 'signschool', 'asldeafined', 'aslbrick', 'aslsearch',
          'handspeak', 'startasl', 'aslpro', 'elementalasl',
          # YouTube-hosted sources
          'asllex', 'aslu', 'asl5200', 'valencia-asl', 'lillybauer', 'nabboud', 'northtexas', 'scott']
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36'}


def rank(inst):
    src = inst.get('source', '')
    try:
        return PREFER.index(src)
    except ValueError:
        return len(PREFER) - 1


def is_youtube(url):
    return 'youtube.com' in url or 'youtu.be' in url


def fetch(inst, out: Path):
    url = inst['url']
    if is_youtube(url):
        r = subprocess.run([sys.executable, '-m', 'yt_dlp', '-q', '--no-warnings', '-f', 'mp4[height<=480]/best[height<=480]/best',
                            '-o', str(out), url], capture_output=True, timeout=180)
        return out.exists() and out.stat().st_size > 10_000
    r = requests.get(url, headers=UA, timeout=40, allow_redirects=True)
    if r.status_code != 200 or len(r.content) < 10_000 or r.headers.get('content-type', '').startswith('text/'):
        return False
    out.write_bytes(r.content)
    return True


def do_gloss(entry, per):
    gloss = entry['gloss']
    folder = VIDEOS / gloss.replace(' ', '_')
    folder.mkdir(parents=True, exist_ok=True)
    got = []
    for inst in sorted(entry['instances'], key=rank):
        if len(got) >= per:
            break
        ext = '.swf' if inst['url'].endswith('.swf') else '.mp4'
        if ext == '.swf':
            continue  # flash files: skip
        out = folder / f"{inst['video_id']}.mp4"
        try:
            if out.exists() or fetch(inst, out):
                got.append({'file': str(out.relative_to(DATA)), 'video_id': inst['video_id'], 'source': inst['source'],
                            'signer': inst['signer_id'], 'frame_start': inst['frame_start'], 'frame_end': inst['frame_end'],
                            'fps': inst['fps'], 'bbox': inst['bbox'], 'url': inst['url']})
        except Exception:
            out.unlink(missing_ok=True)
    return gloss, got


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--glosses', nargs='*')
    ap.add_argument('--top', type=int, default=0)
    ap.add_argument('--per', type=int, default=2, help='instances to keep per gloss')
    ap.add_argument('--workers', type=int, default=8)
    a = ap.parse_args()
    index = json.loads((DATA / 'WLASL_v0.3.json').read_text())
    if a.glosses:
        want = set(g.lower() for g in a.glosses)
        entries = [e for e in index if e['gloss'] in want]
        missing = want - {e['gloss'] for e in entries}
        if missing:
            print('not in WLASL:', ', '.join(sorted(missing)))
    else:
        entries = index[: a.top or len(index)]
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    done = 0
    with ThreadPoolExecutor(a.workers) as ex:
        for gloss, got in ex.map(lambda e: do_gloss(e, a.per), entries):
            done += 1
            if got:
                manifest[gloss] = got
            print(f'[{done}/{len(entries)}] {gloss}: {len(got)} video(s)', flush=True)
            if done % 50 == 0:
                MANIFEST.write_text(json.dumps(manifest, indent=1))
    MANIFEST.write_text(json.dumps(manifest, indent=1))
    ok = sum(1 for e in entries if manifest.get(e['gloss']))
    print(f'\n{ok}/{len(entries)} glosses have at least one video')


if __name__ == '__main__':
    main()
