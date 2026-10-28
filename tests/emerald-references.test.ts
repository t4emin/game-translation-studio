import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { pokemonEmeraldAdapter } from "../src/core/adapters/gba/pokemon-emerald.ts";

// Rewriting a word that only looks like a text pointer (inside graphics or audio) corrupts the game, so a build may only change
// text pointer references, font data and the appended text.
const path = process.env.TEST_EMERALD_ROM_PATH;
test("Emerald build only changes verified references, fonts and appended text", { skip: !path || !existsSync(path) }, async () => {
  const bytes = new Uint8Array(readFileSync(path!));
  const context: any = { file: { name: "x.gba", size: bytes.length, extension: ".gba", bytes }, metadata: {}, adapterId: pokemonEmeraldAdapter.id };
  const entries = (await pokemonEmeraldAdapter.extract(context)).entries;
  const translated = entries.map((e) => ({ ...e, translatedText: "ทดสอบ", status: "translated" as const }));
  // Entries need a translation that passes validation, so keep the source tokens and the protected names.
  const keep = translated.filter((e) => !/\[(?:VAR|CTRL)/.test(e.sourceText)).slice(0, 400).map((e) => ({ ...e, translatedText: "ทดสอบ" + (e.sourceText.match(/\[(?:NEW_LINE|PROMPT_CLEAR|PROMPT_SCROLL)\]/g) ?? []).join("ทดสอบ") }));
  const ok = [];
  for (const entry of keep) if ((await pokemonEmeraldAdapter.validateTranslations(context, [entry])).ok) ok.push(entry);
  assert.ok(ok.length > 50);
  await pokemonEmeraldAdapter.inject(context, ok);
  const out = context.outputBytes as Uint8Array;
  assert.equal(out.length, 0x2000000);
  const allowed = new Set<number>();
  for (const entry of entries) for (const reference of entry.resource.references ?? []) allowed.add(reference);
  // Words inside graphics (title logo) and audio data that merely look like text pointers must never be rewritten.
  for (const falseReference of [0x324d6c, 0x32500c, 0x3580e4, 0x358524, 0x517030, 0x6bd064]) assert.equal(allowed.has(falseReference), false);
  assert.equal(allowed.has(0x309c4), true); // the intro speech pointer in code
  const fonts = [[0x63bee4, 0x643ee4 + 0x400], [0x6440e4, 0x64c0e4 + 0x400], [0x64c2e4, 0x6542e4 + 0x400]];
  const stray: string[] = [];
  for (let at = 0; at < bytes.length; at += 4) {
    if (out[at] === bytes[at] && out[at + 1] === bytes[at + 1] && out[at + 2] === bytes[at + 2] && out[at + 3] === bytes[at + 3]) continue;
    if (allowed.has(at) || fonts.some(([from, to]) => at >= from && at < to)) continue;
    stray.push(at.toString(16));
  }
  assert.deepEqual(stray, []);
});
