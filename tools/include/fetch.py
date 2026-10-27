"""Fetch Indian Sign Language videos from the INCLUDE dataset (Zenodo record 4010759, CC BY 4.0).

The full dataset is 56.8 GB in 43 zips, each holding many words. Zenodo serves byte ranges, so we read
each zip's table of contents over HTTP and download only the few videos we want per word.

Usage:
  python fetch.py list              # data/catalog.json: word -> videos (reads ~43 zip directories, a few MB)
  python fetch.py get [--per 2]     # download --per videos for each word, write data/manifest.json
  python fetch.py get hello thank_you

Then convert with: ..\\wlasl\\.venv\\Scripts\\python ..\\wlasl\\extract.py --set isl
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path

import requests

HERE = Path(__file__).parent
DATA = HERE / 'data'
RECORD = 'https://zenodo.org/api/records/4010759'
BLOCK = 1 << 16


class RangeFile(io.RawIOBase):
    """A read-only, seekable view of a remote file, fetched in byte ranges (enough for zipfile)."""

    def __init__(self, url, session):
        self.url, self.s, self.pos = url, session, 0
        r = self.s.get(url, headers={'Range': 'bytes=0-0'}, timeout=60)
        r.raise_for_status()
        self.size = int(r.headers['Content-Range'].split('/')[1])
        self.cache = {}

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        if not n:
            return b''
        if n > 4 * BLOCK:  # big reads (a video): one request, not cached
            r = self.s.get(self.url, headers={'Range': f'bytes={self.pos}-{self.pos + n - 1}'}, timeout=300)
            r.raise_for_status()
            self.pos += len(r.content)
            return r.content
        out = b''
        while len(out) < n:
            b = self.pos // BLOCK
            if b not in self.cache:
                lo = b * BLOCK
                r = self.s.get(self.url, headers={'Range': f'bytes={lo}-{min(self.size, lo + BLOCK) - 1}'}, timeout=60)
                r.raise_for_status()
                self.cache[b] = r.content
            chunk = self.cache[b][self.pos - b * BLOCK:][: n - len(out)]
            if not chunk:
                break
            out += chunk
            self.pos += len(chunk)
        return out


def word_of(member):
    """'Greetings/48. Hello/MVI_9631.MOV' -> 'hello' (the folder name, without its number)."""
    parts = member.replace('\\', '/').split('/')
    if len(parts) < 2:
        return None
    w = re.sub(r'^\s*\d+\.\s*', '', parts[-2]).strip().lower()
    w = re.sub(r'\s*\(.*?\)\s*', ' ', w).strip()  # "Bank (place)"-style notes
    return re.sub(r'[^a-z0-9]+', '_', w).strip('_') or None


def list_zips(s):
    files = s.get(RECORD, timeout=60).json()['files']
    return [(f['key'], f['links']['self']) for f in files if f['key'].lower().endswith('.zip')]


def cmd_list():
    s = requests.Session()
    catalog = {}
    for key, url in list_zips(s):
        z = zipfile.ZipFile(RangeFile(url, s))
        n = 0
        for info in z.infolist():
            if info.is_dir() or not re.search(r'\.(mov|mp4|avi|mkv)$', info.filename, re.I):
                continue
            w = word_of(info.filename)
            if w:
                catalog.setdefault(w, []).append({'zip': key, 'url': url, 'member': info.filename, 'size': info.file_size})
                n += 1
        print(f'{key}: {n} videos', flush=True)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'catalog.json').write_text(json.dumps(catalog, indent=1))
    print(f'\n{len(catalog)} words, {sum(map(len, catalog.values()))} videos -> data/catalog.json')


def cmd_get(words, per):
    catalog = json.loads((DATA / 'catalog.json').read_text())
    mpath = DATA / 'manifest.json'
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {}
    want = words or sorted(catalog)
    s, zips = requests.Session(), {}
    for i, w in enumerate(want, 1):
        vids = sorted(catalog.get(w, []), key=lambda v: v['member'])[:per]
        if not vids:
            print(f'[{i}/{len(want)}] {w}: not in INCLUDE')
            continue
        entries = []
        for v in vids:
            rel = Path('videos') / w / Path(v['member']).name
            dst = DATA / rel
            if not dst.exists():
                if v['url'] not in zips:
                    zips[v['url']] = zipfile.ZipFile(RangeFile(v['url'], s))
                dst.parent.mkdir(parents=True, exist_ok=True)
                tmp = dst.with_suffix('.part')
                tmp.write_bytes(zips[v['url']].read(v['member']))
                tmp.rename(dst)
            entries.append({'file': str(rel), 'video_id': Path(v['member']).stem, 'source': 'INCLUDE',
                            'dataset': 'INCLUDE', 'url': f'{v["zip"]}:{v["member"]}'})
        manifest[w] = entries
        mpath.write_text(json.dumps(manifest, indent=1))
        print(f'[{i}/{len(want)}] {w}: {len(entries)} video(s)', flush=True)


if __name__ == '__main__':
    argv = sys.argv[1:]
    if not argv or argv[0] not in ('list', 'get'):
        sys.exit(__doc__)
    per = int(argv[argv.index('--per') + 1]) if '--per' in argv else 2
    rest = [a for j, a in enumerate(argv[1:], 1) if not a.startswith('--') and argv[j - 1] != '--per']
    cmd_list() if argv[0] == 'list' else cmd_get([w.lower() for w in rest], per)
