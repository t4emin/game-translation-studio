#!/usr/bin/env python3
"""Compose Thai translations line by line from a reusable line dictionary.

usage: python3 tools/translate/compose.py <ids.txt|-> [out.json]
  ids: short ids (hex), one per line, from `show.ts` (e:xxxxxx). Reads/writes .local/translate-work/lines_th.json.
Each English line (text between ↵ ¶ ⇣) is keyed with variables normalised:
  [VAR:STRING1]->{1} [VAR:STRING2]->{2} [VAR:STRING3]->{3} [VAR:PLAYER][VAR:05]->{P5} [VAR:PLAYER]->{P}
Missing lines are printed so they can be added to the dictionary (see `add` JSON format: {"english line": "thai line"}).
Thai lines must keep the same variables in the same order as the English line.
"""
import json, os, re, sys
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')) + '/'
W = R + '.local/translate-work/'
D = W + 'lines_th.json'
src = {e['id'].split('-')[-1]: e['t'] for e in json.load(open(W + 'emerald_entries.json'))}
lines = json.load(open(D)) if os.path.exists(D) else {}
if len(sys.argv) > 2 and sys.argv[1] == 'add':
    lines.update(json.load(open(W + sys.argv[2]))); json.dump(lines, open(D, 'w'), ensure_ascii=False, indent=0); print(len(lines)); sys.exit()
ids = [x.strip().removeprefix('e:') for x in open(sys.argv[1] if sys.argv[1] != '-' else '/dev/stdin') if x.strip()]
out = os.path.join(W, sys.argv[2]) if len(sys.argv) > 2 else W + 'composed.json'
norm = lambda s: s.replace('[VAR:STRING1]', '{1}').replace('[VAR:STRING2]', '{2}').replace('[VAR:STRING3]', '{3}').replace('[VAR:PLAYER][VAR:05]', '{P5}').replace('[VAR:PLAYER]', '{P}')
denorm = lambda s: s.replace('{P5}', '[VAR:PLAYER][VAR:05]').replace('{P}', '[VAR:PLAYER]').replace('{1}', '[VAR:STRING1]').replace('{2}', '[VAR:STRING2]').replace('{3}', '[VAR:STRING3]')
compact = lambda t: t.replace('[NEW_LINE]', '↵').replace('[PROMPT_CLEAR]', '¶').replace('[PROMPT_SCROLL]', '⇣')
res, missing = {}, {}
for k in ids:
    parts = re.split(r'(↵|¶|⇣)', norm(compact(src[k])))
    th = []
    ok = True
    for p in parts:
        if p in ('↵', '¶', '⇣') or p == '':
            th.append(p); continue
        if p in lines: th.append(lines[p])
        else: missing[p] = 1; ok = False
    if ok: res['e:' + k] = denorm(''.join(th))
json.dump(res, open(out, 'w'), ensure_ascii=False)
print(f"composed {len(res)}/{len(ids)}; missing {len(missing)} lines")
if missing: json.dump({m: '' for m in missing}, open(W + 'missing_lines.json', 'w'), ensure_ascii=False, indent=0)
