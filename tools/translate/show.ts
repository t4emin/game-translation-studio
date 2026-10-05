// usage: node --experimental-strip-types tools/translate/show.ts <emerald|minish> [start=0] [count=40] [category]
// Prints untranslated, translatable entries as `short-id | text` (↵ = [NEW_LINE], ¶ = [PROMPT_CLEAR], ⇣ = [PROMPT_SCROLL]).
// Also writes the extraction cache used by tm.py to .local/translate-work/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { pokemonEmeraldAdapter } from "../../src/core/adapters/gba/pokemon-emerald.ts";
import { zeldaMinishCapAdapter } from "../../src/core/adapters/gba/zelda-minish-cap.ts";
const root = new URL("../../", import.meta.url).pathname;
const game = process.argv[2];
const start = Number(process.argv[3] ?? 0), count = Number(process.argv[4] ?? 40), category = process.argv[5];
const cfg = game === "emerald"
  ? { adapter: pokemonEmeraldAdapter, rom: "Pokemon - Emerald Version (USA, Europe).gba", prefix: "emerald-candidate-", short: "e:", file: "gba-pokemon-emerald-bpee-v0.thai.json" }
  : { adapter: zeldaMinishCapAdapter, rom: "Legend of Zelda, The - The Minish Cap (USA).gba", prefix: "minish-", short: "z:", file: "gba-zelda-minish-cap-bzme-v0.thai.json" };
const bytes = new Uint8Array(readFileSync(`${root}reference-roms/${cfg.rom}`));
const entries = (await cfg.adapter.extract({ file: { name: "x.gba", size: bytes.length, extension: ".gba", bytes }, metadata: {}, adapterId: cfg.adapter.id } as any)).entries as any[];
mkdirSync(`${root}.local/translate-work`, { recursive: true });
if (game === "emerald") writeFileSync(`${root}.local/translate-work/emerald_entries.json`, JSON.stringify(entries.map((e) => ({ id: e.id, t: e.sourceText, c: e.category }))));
const file = `${root}translations/${cfg.file}`;
const done = new Set<string>(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).entries.map((e: any) => e.id) : []);
const rest = entries.filter((e) => !done.has(e.id) && e.category !== "name" && (!category || e.category === category));
console.log(`# ${rest.length} untranslated (of ${entries.length})`);
for (const e of rest.slice(start, start + count))
  console.log(`${cfg.short}${e.id.slice(cfg.prefix.length)} | ${e.sourceText.replaceAll("[NEW_LINE]", "↵").replaceAll("[PROMPT_CLEAR]", "¶").replaceAll("[PROMPT_SCROLL]", "⇣")}`);
