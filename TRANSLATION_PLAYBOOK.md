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


## Emerald specifics (learned while translating)
- `show.ts` hides *fragments* (entries that do not start right after a `0xFF` terminator; they are pointers into the middle
  of another string, or junk). Translate whole strings first. `FRAGMENTS=1` shows them. About 269 of the 4,492 are fragments. Messages up to 900 bytes are extracted (the intro speeches are over 400).
- `merge.ts` prints `want:` / `got:` token skeletons for rejected entries (`↵` newline, `¶` page clear, `⇣` scroll). Compare them
  and fix only the entries listed. Most rejections are a missing/extra `↵`, or `[VAR:*]` in a different order.
- `[VAR:STRING1/2/3]` order must match the source even when Thai word order would prefer otherwise. Rewrite the sentence so the
  variables appear in the source order (e.g. "A of B" -> "A B ...").
- Lines with junk characters at the start (e.g. ` Ô Q“ìËÌÂÁ`) are control bytes decoded as text. Copy that prefix verbatim.
- Strings end with a trailing `¶` or `[CTRL:080F]` runs in some cases. Keep them exactly.
- Keep stat names (ATTACK, SP. ATK, DEFENSE, SP. DEF, SPEED, HP), move/item/place/facility names and BATTLE FRONTIER terms in English.
  Type names stay English: "POKéMON ชนิด FIRE". Species categories such as "FANG SNAKE POKéMON" stay English.
- For series of near-identical lines (numbers 1-8, direction arrows, ribbons, tag-team recruiting), generate the JSON with a small
  Python script and a template instead of typing each line; it is faster and keeps the token skeleton exact.
- A reject like "Text exceeds this screen's N-line limit" means a Thai line is too wide for that box. Shorten words, do not add lines.


## Emerald: which pointers may be rewritten

A word that equals a text address is a reference only when its surroundings say so (`isRealReference` in `pokemon-gen3-resources.ts`):
a Thumb `ldr` literal in the code, an event-script `loadword`/`message`, a table of pointers or an array of records. Words inside
compressed graphics and audio often look like pointers; an earlier build rewrote 233 of them and corrupted the title logo. Candidates
with no real reference are not extracted (198 entries, mostly fragments). Outputs above 16 MiB are padded to 32 MiB.

## Line memory (fastest path for repetitive text)
`translations/line-memory.thai.json` maps each English *line* (text between `↵ ¶ ⇣`, variables written as `{1} {2} {3} {P} {P5}`) to its Thai line.
Copy it to `.local/translate-work/lines_th.json` first, then:
1. `node --experimental-strip-types tools/translate/show.ts emerald 0 200 | grep '^e:' | cut -d' ' -f1 > .local/translate-work/ids.txt`
2. `python3 tools/translate/compose.py .local/translate-work/ids.txt out.json` assembles Thai from known lines and writes the unknown lines
   to `missing_lines.json`. Add `{english line: thai line}` pairs to a JSON file and run `compose.py add file.json`, then compose again.
3. `merge.ts <game> out.json` validates and saves. Token skeletons are right by construction; only width and variable order can still fail.
Keep short lines short: 2- and 3-line boxes (item and move descriptions) fit about 18 Thai characters per line; battle lines with
`[VAR:*]` names need far fewer. A short English fragment such as `POKéMON.` is shared by many entries, so give it a neutral Thai
rendering that works everywhere.
Emerald status when this was written: 4,491 of 4,492 extracted entries translated (the long ones, over 240 bytes, were added to extraction later) (one credit line, a proper name, stays English because the project requires Thai text in every saved entry). Battle messages with `[VAR:*]` use the full battle-box width
(not the narrow description width), and `ʳᵉ` (byte 0xA0) is treated as one glyph.

## Surveying a new ROM (no model needed)

`npm run survey -- <rom.gba> [--json out.json]` prints: header and SHA-256, free tail bytes, text regions, pointer tables into
strings, offset tables (`string-table` = one zero-terminated string per entry, `line-index` = offsets to wrapped lines inside
one string), font width-table candidates and the number of literal-pool string references. Results are hints: read
the regions it lists, then confirm in a hex dump before writing an adapter. Not covered: games with a custom character table (Pokemon FireRed/Emerald show almost nothing, as their text is not ASCII), compressed text, text built by code, and the
font renderer (still read the disassembly or use an emulator debugger).

Yu-Gi-Oh! WCT 2004 (`BYWP`): the survey finds the card-name offset table at 0x58ACDC (6,834 entries = 1,139 cards x 6 languages).

## Style
- Casual, short, natural Thai for NPCs; polite but compact for system text. No translator notes in output.
- Use the same Thai for the same phrase everywhere. Seed choices already used in the project:
  Thank you ขอบคุณ / ขอบคุณนะ, Welcome ยินดีต้อนรับ, Sorry ขอโทษนะ, Okay โอเค / ตกลง, Wait เดี๋ยวก่อน,
  Congratulations ยินดีด้วย, Hello สวัสดี, TRAINER เทรนเนอร์, GYM ยิม, Pokemon Center ศูนย์ Pokémon.
  Add new recurring terms here with the Thai you chose.

## Status rules
- `supported` + `emulatorVerified: true` requires a human or headless emulator check. Do not flip it without one.
- Keep README.md, SUPPORTED_GAMES.md and IMPLEMENTATION_STATUS.md in sync with the real counts in `translations/*.json`.

## Yu-Gi-Oh! WCT 2004 specifics

`show.ts ygo` / `merge.ts ygo` (short ids `y:0001`). Card names in quotes, `ATK`/`DEF`, `@3%s@0` codes stay as in the source (the validator checks).
Keep game keywords in English: Normal/Flip/Special Summon, Tribute, Graveyard, Deck, Life Points, Spell/Trap Card, Attack/Defense Position,
Direct Damage, Battle Phase, FLIP:, monster types (Dragon, Fiend...). Thai needs spaces between phrases but the build also adds them at word boundaries.
The font holds only 127 clusters, so prefer common clusters and avoid rare marks.
