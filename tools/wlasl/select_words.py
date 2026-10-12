"""Pick the N most useful WLASL words for the hotel app.

1. every WLASL word that appears in Aria's replies (bot.js) and the FAQ (faq.js), most frequent first
   (plain and base forms: "rooms" -> room, "booked" -> book), plus multi-word signs ("wake up")
2. topped up with WLASL words in the dataset's own order (roughly most common first)

Usage: python select_words.py [N]    -> data/hotel_words.txt (one gloss per line)
"""
import collections
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
JS = HERE.parent.parent / 'public' / 'js'
N = int(sys.argv[1]) if len(sys.argv) > 1 else 500

wlasl = [g['gloss'] for g in json.loads((HERE / 'data' / 'WLASL_v0.3.json').read_text())]
wlasl = [g for g in wlasl if len(g) > 1]  # single letters are fingerspelled
gloss_set = set(wlasl)
# not signed in ASL-style replies anyway (see STOP in signs.js)
STOP = set('a an the is are am was were be been being to of for at on in into by with and or it its this that these those there here do does did '
           'will would shall should just so very also as from about any some then than if let get got make made per each has had having may might must'.split())

import subprocess

# Aria's replies: the first argument of every R('...') / R(`...`) in bot.js
bot = (JS / 'bot.js').read_text(encoding='utf-8')
replies = [a or b for a, b in re.findall(r"R\(\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)", bot)]
# FAQ questions and answers, loaded as data
faq = json.loads(subprocess.run(['node', '-e', "import('./public/js/faq.js').then(({FAQ})=>console.log(JSON.stringify(FAQ)))"],
                                cwd=JS.parent.parent, capture_output=True, text=True, check=True).stdout)
english = ' '.join(replies + [q for e in faq for q in e['q']] + [e['a'] for e in faq]).lower()
english = re.sub(r'\$\{[^}]*\}', ' ', english)  # template placeholders


def lemmas(w):
    c = [w]
    if w.endswith('ies'): c.append(w[:-3] + 'y')
    if w.endswith('es'): c.append(w[:-2])
    if w.endswith('s'): c.append(w[:-1])
    if w.endswith('ed'): c += [w[:-2], w[:-1]]
    if w.endswith('ing'): c += [w[:-3], w[:-3] + 'e']
    return c


counts = collections.Counter()
for phrase in (g for g in wlasl if ' ' in g):
    n = len(re.findall(r'\b' + r'\s+'.join(map(re.escape, phrase.split())) + r'\b', english))
    if n:
        counts[phrase] += n * 2  # phrases are rarer but very useful
for w in re.findall(r"[a-z']+", english):
    if w in STOP:
        continue
    for l in lemmas(w):
        if l in gloss_set:
            counts[l] += 1
            break

picked = [g for g, _ in counts.most_common()]
from_app = len(picked)
for g in wlasl:
    if len(picked) >= N:
        break
    if g not in counts and g not in STOP:
        picked.append(g)
picked = picked[:N]
(HERE / 'data' / 'hotel_words.txt').write_text('\n'.join(picked) + '\n', encoding='utf-8')
print(f'{min(from_app, N)} words from the app text, {max(0, N - from_app)} topped up from WLASL order -> data/hotel_words.txt')
print('top 60:', ', '.join(picked[:60]))
