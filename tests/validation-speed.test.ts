import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { pokemonEmeraldAdapter } from "../src/core/adapters/gba/pokemon-emerald.ts";

// The project validates translations one entry at a time, so an adapter that rescans the ROM per call makes batches take minutes.
const path = process.env.TEST_EMERALD_ROM_PATH;
test("Emerald validates many single entries without rescanning the ROM each time", { skip: !path || !existsSync(path) }, async () => {
  const bytes = new Uint8Array(readFileSync(path!));
  const context: any = { file: { name: "x.gba", size: bytes.length, extension: ".gba", bytes }, metadata: {}, adapterId: pokemonEmeraldAdapter.id };
  const entry = (await pokemonEmeraldAdapter.extract(context)).entries[0];
  const started = performance.now();
  for (let i = 0; i < 40; i++) await pokemonEmeraldAdapter.validateTranslations(context, [{ ...entry, translatedText: entry.sourceText, status: "translated" }]);
  assert.ok(performance.now() - started < 8000, `40 validations took ${(performance.now() - started).toFixed(0)} ms`);
});
