import test from "node:test";
import assert from "node:assert/strict";
import { detectProtectedTokens, validateProtectedTokens } from "../src/core/validation/protected-tokens.ts";
import { TranslationMemory } from "../src/core/storage/translation-memory.ts";
import { findLocalTranslation } from "../src/core/storage/local-translation-file.ts";
import { gbaPlatformAdapter } from "../src/core/platforms/gba/adapter.ts";
import { scanGbaResources } from "../src/core/platforms/gba/generic-scanner.ts";
import { scanPs2Iso } from "../src/core/platforms/ps2/iso9660.ts";
import { pokemonEmeraldAdapter, pokemonEmeraldChecksum } from "../src/core/adapters/gba/pokemon-emerald.ts";
import { pokemonFireRedRev1Adapter, pokemonFireRedRev1Checksum } from "../src/core/adapters/gba/pokemon-firered-rev1.ts";
import { zeldaMinishCapAdapter, zeldaMinishCapChecksum } from "../src/core/adapters/gba/zelda-minish-cap.ts";
import { decodePokemonText } from "../src/core/platforms/gba/pokemon-gen3-text.ts";
import { latinByte } from "../src/core/platforms/gba/firered-rom.ts";
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

test("Pokemon Emerald adapter matches exact v0 identity and extracts pointer text candidates", async () => {
  assert.equal(
    await pokemonEmeraldAdapter.matches({
      platform: "gba",
      fileName: "Pokemon - Emerald Version (USA, Europe).gba",
      fileSize: 16777216,
      checksum: pokemonEmeraldChecksum,
      title: "POKEMON EMER",
      gameId: "BPEE",
      revision: "v0",
      details: {}
    }),
    true
  );

  const bytes = new Uint8Array(0x1000).fill(0xff);
  // A lone pointer-looking word is not enough; real references sit in tables, so the fixture has a short pointer table.
  for (const at of [0x1f8, 0x1fc, 0x200, 0x204, 0x208]) Buffer.from(bytes.buffer).writeUInt32LE(0x08000300, at);
  const text = [..."The BATTLE starts now."].map(latinByte);
  bytes.set([...text, 0xff], 0x300);
  const extraction = await pokemonEmeraldAdapter.extract({
    file: { name: "emerald.gba", size: bytes.byteLength, extension: ".gba", bytes },
    metadata: {
      platform: "gba",
      fileName: "emerald.gba",
      fileSize: bytes.byteLength,
      checksum: pokemonEmeraldChecksum,
      title: "POKEMON EMER",
      gameId: "BPEE",
      revision: "v0",
      details: {}
    }
  });

  assert.ok(extraction.entries.some((entry) => entry.sourceText === "The BATTLE starts now."));
  assert.equal(extraction.issues[0].code, "emerald-experimental-extraction");
});

test("Zelda Minish Cap adapter matches exact USA identity and reports a missing message table", async () => {
  assert.equal(
    await zeldaMinishCapAdapter.matches({
      platform: "gba",
      fileName: "Legend of Zelda, The - The Minish Cap (USA).gba",
      fileSize: 16777216,
      checksum: zeldaMinishCapChecksum,
      title: "GBAZELDA MC",
      gameId: "BZME",
      revision: "v0",
      details: {}
    }),
    true
  );

  const bytes = new Uint8Array(0x400).fill(0);
  Buffer.from("The legend of Zelda continues in Hyrule.", "ascii").copy(bytes, 0x200);
  const extraction = await zeldaMinishCapAdapter.extract({
    file: { name: "minish.gba", size: bytes.length, extension: ".gba", bytes },
    metadata: {
      platform: "gba",
      fileName: "minish.gba",
      fileSize: 0,
      checksum: zeldaMinishCapChecksum,
      title: "GBAZELDA MC",
      gameId: "BZME",
      revision: "v0",
      details: {}
    }
  });
  assert.equal(extraction.entries.length, 0);
  assert.equal(extraction.issues[0].code, "minish-cap-no-table");
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

test("adapter-specific local translation files fall back safely", async () => {
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
    await findLocalTranslation(entry, "thai", "gba-pokemon-emerald-bpee-v0"),
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

test("file safety accepts GBA and PS2 containers but rejects unrelated uploads", async () => {
  assert.equal(validateGameFile({ name: "game.iso", extension: ".iso", size: 4, bytes: new Uint8Array(4) }).some((issue) => issue.code === "unsupported-extension"), false);
  assert.equal(validateGameFile({ name: "game.nds", extension: ".nds", size: 4, bytes: new Uint8Array(4) })[0].code, "unsupported-extension");
});

test("GBA-only build path analyzes unknown GBA read-only", async () => {
  const bytes = new Uint8Array(0x200).fill(0);
  Buffer.from("UNKNOWN     ", "ascii").copy(bytes, 0xa0);
  Buffer.from("UNKN", "ascii").copy(bytes, 0xac);
  Buffer.from("01", "ascii").copy(bytes, 0xb0);
  bytes[0xb2] = 0x96;
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i += 1) checksum = (checksum - bytes[i] - 1) & 0xff;
  bytes[0xbd] = checksum;
  Buffer.from("This UNKNOWN game has a hidden message for you in the forest.", "ascii").copy(bytes, 0x100);

  const report = await analyzeGame({ name: "unknown.gba", extension: ".gba", size: bytes.length, bytes }, "gba");
  assert.equal(report.metadata.platform, "gba");
  assert.equal(report.compatibility, "experimental");
  assert.equal(report.capabilities.rebuild, "blocked");
  assert.ok(report.genericScan);
  assert.equal(report.textPreview?.source, "generic");
  assert.ok(report.textPreview?.entries.some((entry) => entry.sourceText.includes("UNKNOWN")));
});

test("PS2 ISO selection reaches platform analysis but remains build blocked", async () => {
  const bytes = makeIsoFixture();
  const report = await analyzeGame({ name: "game.iso", extension: ".iso", size: bytes.length, bytes }, "ps2");
  assert.equal(report.metadata.platform, "ps2");
  assert.equal(report.compatibility, "experimental");
  assert.equal(report.capabilities.rebuild, "blocked");
  assert.equal(report.issues.some((issue) => issue.code === "unsupported-extension"), false);
  assert.equal(report.issues.some((issue) => issue.level === "error"), false);
  assert.equal(report.isoScan?.valid, true);
  assert.equal(report.isoScan?.bootFile, "SLUS_123.45");
  assert.ok(report.isoScan?.candidates.some((entry) => entry.path === "/SCRIPT/MESSAGE.MSG"));
  assert.ok(report.isoScan?.strings.some((entry) => entry.text.includes("Hello from script")));
});

test("PS2 ISO scanner reads ISO9660 directories and ranks likely text files", () => {
  const scan = scanPs2Iso(makeIsoFixture());
  assert.equal(scan.valid, true);
  assert.equal(scan.volumeId, "TEST_PS2");
  assert.equal(scan.fileCount, 3);
  assert.equal(scan.directoryCount, 1);
  assert.equal(scan.bootFile, "SLUS_123.45");
  assert.ok(scan.candidates.some((entry) => entry.path === "/SCRIPT/MESSAGE.MSG" && entry.sample?.includes("Hello from script")));
  assert.ok(scan.strings.some((entry) => entry.path === "/SCRIPT/MESSAGE.MSG" && entry.encoding === "ascii"));
});

function makeIsoFixture(): Uint8Array {
  const bytes = new Uint8Array(25 * 2048);
  writePvd(bytes);
  writeDirectory(bytes, 20, [
    dirRecord(20, 2048, 2, new Uint8Array([0])),
    dirRecord(20, 2048, 2, new Uint8Array([1])),
    dirRecord(21, 64, 0, Buffer.from("SYSTEM.CNF;1", "ascii")),
    dirRecord(22, 128, 0, Buffer.from("SLUS_123.45;1", "ascii")),
    dirRecord(23, 2048, 2, Buffer.from("SCRIPT;1", "ascii"))
  ]);
  writeDirectory(bytes, 23, [
    dirRecord(23, 2048, 2, new Uint8Array([0])),
    dirRecord(20, 2048, 2, new Uint8Array([1])),
    dirRecord(24, 128, 0, Buffer.from("MESSAGE.MSG;1", "ascii"))
  ]);
  Buffer.from("BOOT2 = cdrom0:\\SLUS_123.45;1\r\n", "ascii").copy(bytes, 21 * 2048);
  Buffer.from("ELF fixture", "ascii").copy(bytes, 22 * 2048);
  Buffer.from("Hello from script. This should look like dialogue text.", "ascii").copy(bytes, 24 * 2048);
  return bytes;
}

function writePvd(bytes: Uint8Array) {
  const pvd = 16 * 2048;
  bytes[pvd] = 1;
  Buffer.from("CD001", "ascii").copy(bytes, pvd + 1);
  bytes[pvd + 6] = 1;
  Buffer.from("PLAYSTATION", "ascii").copy(bytes, pvd + 8);
  Buffer.from("TEST_PS2", "ascii").copy(bytes, pvd + 40);
  bytes.set(dirRecord(20, 2048, 2, new Uint8Array([0])), pvd + 156);
}

function writeDirectory(bytes: Uint8Array, lba: number, records: Uint8Array[]) {
  let cursor = lba * 2048;
  for (const record of records) {
    bytes.set(record, cursor);
    cursor += record.length;
  }
}

function dirRecord(lba: number, size: number, flags: number, name: Uint8Array): Uint8Array {
  const length = 33 + name.length + ((name.length + 1) % 2);
  const record = new Uint8Array(length);
  record[0] = length;
  writeU32(record, 2, lba);
  writeU32(record, 10, size);
  record[25] = flags;
  record[28] = 1;
  record[32] = name.length;
  record.set(name, 33);
  return record;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
