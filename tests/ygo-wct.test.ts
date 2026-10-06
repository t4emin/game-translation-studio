import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { extractYgoCardTexts, ygoEntryOffset } from "../src/core/platforms/gba/ygo-wct-rom.ts";
import { buildYgoRom, createYgoAtlas, encodeYgoText, softSpaces, validateYgoTranslation, ygoStyleWordOffset } from "../src/core/platforms/gba/ygo-wct-thai.ts";

const path = process.env.TEST_YGO_ROM_PATH;
const have = !!path && existsSync(path);

test("Yu-Gi-Oh! WCT 2004 card text tables read all cards", { skip: !have }, () => {
  const cards = extractYgoCardTexts(new Uint8Array(readFileSync(path!)));
  assert.equal(cards.length, 1138);
  assert.match(cards[0].english, /^This legendary dragon is a powerful engine of destruction/);
  assert.ok(cards.every((c) => c.english.length > 0));
});

test("Thai text uses single-byte codes outside ASCII and a trailing zero", () => {
  const atlas = createYgoAtlas(["มังกรในตำนาน ที่แข็งแกร่ง"]);
  const bytes = encodeYgoText("มังกรในตำนาน ที่แข็งแกร่ง", atlas);
  assert.equal(bytes.at(-1), 0);
  assert.ok([...bytes.slice(0, -1)].every((b) => b === 0x20 || (b >= 0x80 && b !== 0x92)));
  assert.ok([...atlas.values()].every((glyph) => glyph.rows.length === 16));
});

test("validation keeps quoted card names, control codes and word length", () => {
  const source = 'Tribute "Petit Moth" for @3%s@0.';
  validateYgoTranslation(source, 'สังเวย "Petit Moth" ให้ @3%s@0.');
  assert.throws(() => validateYgoTranslation(source, "สังเวยมอธตัวเล็ก @3%s@0."), /quotes/);
  assert.throws(() => validateYgoTranslation(source, 'สังเวย "Petit Moth" ให้'), /Control codes/);
  validateYgoTranslation("Do it.", "สังเวยมอธตัวเล็กนี้เพื่อเรียกมอนสเตอร์ทันที"); // long runs are split at word boundaries by the build
  assert.ok(softSpaces("สังเวยมอธตัวเล็กนี้เพื่อเรียกมอนสเตอร์ทันที").includes(" "));
});

test("build repoints only the translated English entries and leaves the rest intact", { skip: !have }, () => {
  const rom = new Uint8Array(readFileSync(path!));
  const built = buildYgoRom(rom, new Map([[1, "มังกรในตำนาน ที่แข็งแกร่ง"]]));
  assert.equal(built.translated, 1);
  assert.equal(built.bytes.length, rom.length);
  const after = extractYgoCardTexts(built.bytes);
  assert.equal(after[0].english.charCodeAt(0) >= 0x80, true);
  assert.equal(after[1].english, extractYgoCardTexts(rom)[1].english);
  assert.equal(ygoEntryOffset(built.bytes, "descriptions", 1, 2), ygoEntryOffset(rom, "descriptions", 1, 2));
  assert.equal(new DataView(built.bytes.buffer).getUint32(ygoStyleWordOffset, true), 0x1087);
  assert.deepEqual([...built.bytes.subarray(0, 0xc0)], [...rom.subarray(0, 0xc0)]);
  assert.equal(buildYgoRom(rom, new Map()).bytes.every((b, i) => b === rom[i]), true);
});
