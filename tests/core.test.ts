import test from "node:test";
import assert from "node:assert/strict";
import { detectProtectedTokens, validateProtectedTokens } from "../src/core/validation/protected-tokens.ts";
import { TranslationMemory } from "../src/core/storage/translation-memory.ts";
import { findLocalTranslation } from "../src/core/storage/local-translation-file.ts";
import { gbaPlatformAdapter } from "../src/core/platforms/gba/adapter.ts";
import { scanGbaResources } from "../src/core/platforms/gba/generic-scanner.ts";
import { pokemonFireRedRev1Adapter, pokemonFireRedRev1Checksum } from "../src/core/adapters/gba/pokemon-firered-rev1.ts";
import { decodePokemonText } from "../src/core/platforms/gba/pokemon-gen3-text.ts";
import { analyzeGame } from "../src/core/analysis.ts";
import { validateGameFile } from "../src/core/security/file-safety.ts";
import type { GameFile, TranslationEntry } from "../src/core/types.ts";

test("detects and validates protected tokens", () => {
  const tokens = detectProtectedTokens("Hello {PLAYER_NAME}[WAIT]<red>");
  assert.deepEqual(tokens, ["{PLAYER_NAME}", "[WAIT]", "<red>"]);

  const entry: TranslationEntry = {
    id: "entry-1",
    sourceText: "Hello {PLAYER_NAME}",
    translatedText: "สวัสดี",
    sourceLanguage: "english",
    targetLanguage: "thai",
    category: "dialog",
    resource: {},
    constraints: {},
    protectedTokens: ["{PLAYER_NAME}"],
    status: "translated",
    warnings: []
  };

  const issues = validateProtectedTokens([entry]);
  assert.equal(issues[0].code, "missing-protected-token");
});

test("Pokemon FireRed adapter only matches the exact Rev 1 checksum identity", async () => {
  assert.equal(
    await pokemonFireRedRev1Adapter.matches({
      platform: "gba",
      fileName: "Pokemon - FireRed Version (USA, Europe) (Rev 1).gba",
      fileSize: 16777216,
      checksum: pokemonFireRedRev1Checksum,
      title: "POKEMON FIRE",
      gameId: "BPRE",
      revision: "v1",
      details: {}
    }),
    true
  );

  assert.equal(
    await pokemonFireRedRev1Adapter.matches({
      platform: "gba",
      fileName: "Pokemon - FireRed Version (USA, Europe).gba",
      fileSize: 16777216,
      checksum: "different",
      title: "POKEMON FIRE",
      gameId: "BPRE",
      revision: "v0",
      details: {}
    }),
    false
  );
});

test("Pokemon Gen III text decoder preserves control tokens", () => {
  const decoded = decodePokemonText(new Uint8Array([0xbb, 0xd5, 0xfe, 0xfd, 0x01, 0xff]), 0, 6);
  assert.equal(decoded.text, "Aa[NEW_LINE][VAR:PLAYER]");
  assert.deepEqual(decoded.protectedTokens, ["[NEW_LINE]", "[VAR:PLAYER]"]);
});

test("Pokemon FireRed adapter extracts read-only fixed text tables", async () => {
  const bytes = new Uint8Array(0x60000).fill(0xff);
  const writePointer = (offset: number, target: number) => Buffer.from(bytes.buffer).writeUInt32LE(0x08000000 + target, offset);
  writePointer(0x144, 0x1000);
  writePointer(0x148, 0x2000);
  writePointer(0x1c0, 0x3000);
  writePointer(0x309dc, 0x4000);
  writePointer(0x1c8, 0x5000);

  bytes.set([0xbc, 0xcf, 0xc6, 0xbc, 0xbb, 0xcd, 0xbb, 0xcf, 0xcc, 0xff], 0x1000 + 11);
  bytes.set([0xca, 0xc9, 0xcf, 0xc8, 0xbe, 0xff], 0x2000 + 13);
  bytes.set([0xcd, 0xce, 0xbf, 0xc8, 0xbd, 0xc2, 0xff], 0x3000 + 13);
  bytes.set([0xc8, 0xc9, 0xcc, 0xc7, 0xbb, 0xc6, 0xff], 0x4000);
  bytes.set([0xc7, 0xbb, 0xcd, 0xce, 0xbf, 0xcc, 0x00, 0xbc, 0xbb, 0xc6, 0xc6, 0xff], 0x5000 + 44);

  const extraction = await pokemonFireRedRev1Adapter.extract({
    file: { name: "fixture.gba", size: bytes.byteLength, extension: ".gba", bytes },
    metadata: {
      platform: "gba",
      fileName: "fixture.gba",
      fileSize: bytes.byteLength,
      checksum: pokemonFireRedRev1Checksum,
      title: "POKEMON FIRE",
      gameId: "BPRE",
      revision: "v1",
      details: {}
    }
  });

  assert.equal(extraction.issues.length, 0);
  assert.ok(extraction.entries.some((entry) => entry.sourceText === "BULBASAUR"));
  assert.ok(extraction.entries.some((entry) => entry.sourceText === "POUND"));
  assert.ok(extraction.entries.some((entry) => entry.sourceText === "STENCH"));
  assert.ok(extraction.entries.some((entry) => entry.sourceText === "NORMAL"));
  assert.ok(extraction.entries.some((entry) => entry.sourceText === "MASTER BALL"));
});

test("translation memory reuses matching source language target language and context", () => {
  const memory = new TranslationMemory();
  memory.upsert({
    sourceText: "Potion",
    sourceLanguage: "english",
    targetLanguage: "thai",
    translatedText: "ยา",
    context: "item",
    status: "reviewed"
  });

  assert.equal(memory.find("Potion", "english", "thai", "item")?.translatedText, "ยา");
  assert.equal(memory.find("Potion", "english", "english", "item"), undefined);
});

test("bundled FireRed Thai translation file can satisfy entries offline", async () => {
  const entry: TranslationEntry = {
    id: "dialog-1c589d",
    sourceText: "The various buttons will be explained in[NEW_LINE]the order of their importance.",
    translatedText: "",
    sourceLanguage: "english",
    targetLanguage: "thai",
    category: "dialog",
    resource: {},
    constraints: {},
    protectedTokens: ["[NEW_LINE]"],
    status: "untranslated",
    warnings: []
  };

  assert.equal(
    await findLocalTranslation(entry, "thai"),
    "อธิบายปุ่มต่างๆ[NEW_LINE]ตามลำดับสำคัญ"
  );
});

test("GBA adapter detects synthetic header metadata", async () => {
  const bytes = new Uint8Array(0xc0);
  Buffer.from("TESTGAME    ", "ascii").copy(bytes, 0xa0);
  Buffer.from("TGME", "ascii").copy(bytes, 0xac);
  Buffer.from("01", "ascii").copy(bytes, 0xb0);
  bytes[0xb2] = 0x96;
  bytes[0xbc] = 1;
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i += 1) checksum = (checksum - bytes[i] - 1) & 0xff;
  bytes[0xbd] = checksum;

  const file: GameFile = {
    name: "fixture.gba",
    size: bytes.byteLength,
    extension: ".gba",
    bytes
  };

  const detection = await gbaPlatformAdapter.detect(file);
  const metadata = await gbaPlatformAdapter.inspect(file);

  assert.equal(detection.platform, "gba");
  assert.equal(metadata.title, "TESTGAME");
  assert.equal(metadata.gameId, "TGME");
  assert.equal(metadata.revision, "v1");
  assert.equal(metadata.details.headerChecksum, `valid:${checksum.toString(16).padStart(2, "0")}`);
});

test("GBA generic scanner reports read-only text and pointer candidates", () => {
  const bytes = new Uint8Array(0x200).fill(0);
  Buffer.from("HELLO GBA WORLD", "ascii").copy(bytes, 0x40);
  Buffer.from(bytes.buffer).writeUInt32LE(0x08000040, 0x100);
  bytes[0x120] = 0x10;
  bytes[0x121] = 0x80;

  const scan = scanGbaResources(bytes);
  assert.ok(scan.ascii.count >= 1);
  assert.ok(scan.ascii.examples.some((item) => item.text.includes("HELLO")));
  assert.ok(scan.pointers.count >= 1);
  assert.ok(scan.compression.count >= 1);
});

test("GBA-only V1 rejects non-GBA uploads and analyzes unknown GBA read-only", async () => {
  assert.equal(validateGameFile({ name: "game.iso", extension: ".iso", size: 4, bytes: new Uint8Array(4) })[0].code, "unsupported-extension");

  const bytes = new Uint8Array(0xc0).fill(0);
  Buffer.from("UNKNOWN     ", "ascii").copy(bytes, 0xa0);
  Buffer.from("UNKN", "ascii").copy(bytes, 0xac);
  Buffer.from("01", "ascii").copy(bytes, 0xb0);
  bytes[0xb2] = 0x96;
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i += 1) checksum = (checksum - bytes[i] - 1) & 0xff;
  bytes[0xbd] = checksum;

  const report = await analyzeGame({ name: "unknown.gba", extension: ".gba", size: bytes.length, bytes }, "gba");
  assert.equal(report.metadata.platform, "gba");
  assert.equal(report.compatibility, "experimental");
  assert.equal(report.capabilities.rebuild, "blocked");
  assert.ok(report.genericScan);
});
