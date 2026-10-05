# Translation Playbook (for Claude and other agents)

Read this before translating any ROM text. It exists to make each session start fast and to cut
rejected batches. Update it when you learn a new rule.

## Policy
- Keep untranslated in English: names of items, people, places, Pokemon, moves, and keyboard text.
  Everything else becomes Thai. Entries of category `name` are skipped on purpose.
- Credit: Thai pixel font by the Beyond Hoenn TH team. Licences: code AGPL, font and translations CC BY.

## Tools (all in `tools/translate/`, work files go to `.local/translate-work/`, gitignored)
| Step | Command |
| --- | --- |
| 1. Reuse what already exists (exact matches from FireRed and from the same game) | `python3 tools/translate/tm.py` then `node --experimental-strip-types tools/translate/merge.ts emerald tm1.json` (run `show.ts` once first; it writes the extraction cache) |
| 2. List the next untranslated entries | `node --experimental-strip-types tools/translate/show.ts <emerald\|minish> [start] [count] [category]` |
| 3. Write translations as `{"e:1dd9c0": "ไทย"}` JSON in `.local/translate-work/` | use `↵` for `[NEW_LINE]`, `¶` for `[PROMPT_CLEAR]`, `⇣` for `[PROMPT_SCROLL]`; other tokens stay as written |
| 4. Validate and save | `node --experimental-strip-types tools/translate/merge.ts <game> file.json`; it prints every rejection with the reason and saves only the passing entries |
Rejected entries are not saved. Fix only the ones listed, re-run with a small JSON containing just those.

## Validator rules (these cause most rejections)
1. The token sequence must match the source exactly, in order and count: `[NEW_LINE]`, `[COLOR:*]`,
   `[CTRL:*]`, `[VAR:*]`, `[SYMBOL:*]`, and the Emerald prompt tokens. Never drop or reorder one.
2. Mirror the source line by line. Same number of lines, empty lines included. Keep colour tokens and
   `[VAR:*]` on the same source line they came from.
3. Width limit: Minish Cap 208 px per line. Emerald has per-screen line limits (2 or 3 lines).
   A rejection says which. Shorten the Thai; do not add lines.
4. Thai needs shorter text than English fits in, so drop filler words (ครับ/ค่ะ endings, particles) first.
5. Glyph ๅ is missing from the font. Use ว or rewrite the word. A missing glyph aborts the whole merge.
6. Protected names must appear in English unchanged (Minish: Zelda, Ezlo, Vaati, Hyrule, Link).
7. Dummy placeholder strings (Minish KOBITO/HONDANA/HARI/SHICYO/LEFT/MINKA with `[SYMBOL:1F]`) are copied verbatim.
8. macOS `sed -i` does not work here. Edit with python or the Edit tool.

## What was measured (so nobody re-derives it)
- Emerald remaining entries are not very repetitive: only about 5% (about 200 of 3,746) duplicate something already
  translated, and fuzzy matching adds almost nothing. `tm.py` already takes the exact matches (87 saved).
- 124 remaining Emerald entries are tails of longer entries; only 4 start on a token boundary, so they cannot be
  sliced automatically. Translate them normally.
- So the time cost is generation, not lookup. The ways to go faster are: translate in batches of 40-60,
  keep one consistent voice, avoid rejections by following the rules above, and run independent ranges in parallel
  (different `start` offsets, separate JSON files, then merge one file at a time because merge.ts rewrites the output).

## Style
- Casual, short, natural Thai for NPCs; polite but compact for system text. No translator notes in output.
- Use the same Thai for the same phrase everywhere. Seed choices already used in the project:
  Thank you ขอบคุณ / ขอบคุณนะ, Welcome ยินดีต้อนรับ, Sorry ขอโทษนะ, Okay โอเค / ตกลง, Wait เดี๋ยวก่อน,
  Congratulations ยินดีด้วย, Hello สวัสดี, TRAINER เทรนเนอร์, GYM ยิม, Pokemon Center ศูนย์ Pokémon.
  Add new recurring terms here with the Thai you chose.

## Status rules
- `supported` + `emulatorVerified: true` requires a human or headless emulator check. Do not flip it without one.
- Keep README.md, SUPPORTED_GAMES.md and IMPLEMENTATION_STATUS.md in sync with the real counts in `translations/*.json`.
