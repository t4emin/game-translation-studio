import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { decodePokemonText } from "../src/core/platforms/gba/pokemon-gen3-text.ts";
import { manifest, extractDialogs, validateTranslation, digest, relocateDialogs } from "../src/core/platforms/gba/firered-rom.ts";
import { buildTranslatedRom, createThaiAtlas, encodeDialog, rasterizeGlyph } from "../src/core/platforms/gba/thai-font.ts";

test("control parameters are decoded atomically, including 0xff parameters",()=>{
  const bytes=Uint8Array.from([0xfc,4,1,0,2,0xfd,1,0xf9,0x10,0xff]);
  assert.equal(decodePokemonText(bytes,0,bytes.length).text,"[CTRL:04010002][VAR:PLAYER][SYMBOL:10]");
  assert.throws(()=>decodePokemonText(Uint8Array.from([0xfd]),0,1),/Truncated/);
  assert.throws(()=>decodePokemonText(Uint8Array.from([0xfc,4,1]),0,3),/Invalid/);
});
test("translations must preserve repeated controls and their order",()=>{
  const source="A[NEW_LINE]B[NEW_LINE][VAR:PLAYER]";
  assert.throws(()=>validateTranslation(source,"ก[NEW_LINE][VAR:PLAYER]"));
  assert.throws(()=>validateTranslation(source,"ก[VAR:PLAYER][NEW_LINE][NEW_LINE]"));
  assert.doesNotThrow(()=>validateTranslation(source,"ก[NEW_LINE]ข[NEW_LINE][VAR:PLAYER]"));
});
test("Thai clusters include tone marks and render nonempty glyphs",()=>{
  const atlas=createThaiAtlas(["กิ้ กุ้ง น้ำ"]);
  assert.ok(atlas.has("กิ้"));
  assert.ok(rasterizeGlyph("กิ้").pixels.some(v=>v!==0));
  assert.ok(rasterizeGlyph("กิ้").width<=16);
  assert.equal(new Set([...atlas.values()].map(g=>`${g.bank}:${g.code}`)).size,atlas.size);
});

const romPath=process.env.TEST_ROM_PATH;
test("real ROM relocation preserves original bytes, header and unrelated resources",{skip:!romPath||!existsSync(romPath)},()=>{
  const original=readFileSync(romPath!);
  const hash=digest(original);
  const entries=extractDialogs(original);
  assert.ok(entries.length>2000);
  const entry=entries.find(e=>e.context==="gOakSpeech_Text_WelcomeToTheWorld")!;
  assert.ok(entry);
  entry.translatedText="สวัสดี![NEW_LINE]ยินดีที่ได้รู้จัก![PROMPT_CLEAR]ยินดีต้อนรับสู่โลก POKéMON![PROMPT_CLEAR]ฉันชื่อ OAK[ PROMPT_CLEAR]".replace("[ PROMPT_CLEAR]","[PROMPT_CLEAR]")+"ผู้คนเรียกฉันว่า[NEW_LINE]POKéMON PROFESSOR[PROMPT_CLEAR]";
  entry.status="translated";
  const result=buildTranslatedRom(original,[entry]);
  assert.equal(digest(original),hash,"building must not mutate a Buffer-backed ROM");
  assert.equal(hash,manifest.checksum);
  assert.ok(result.bytes.length<=0x2000000);
  assert.deepEqual(result.bytes.subarray(0,0xc0),original.subarray(0,0xc0));
  const atlas=createThaiAtlas([entry.translatedText]);
  const encoded=encodeDialog(entry.translatedText,original,atlas);
  const record=manifest.entries.find(r=>r.offset===entry.resource.offset)!;
  const allowed=new Set<number>();
  for(const ref of record.references){
    assert.equal(result.bytes.readUInt32LE(ref),0x09000000);
    for(let i=0;i<4;i++) allowed.add(ref+i);
  }
  for(const glyph of atlas.values()){
    const font=manifest.fonts.find(f=>f.id===glyph.bank)!;
    for(let i=0;i<64;i++) allowed.add(font.pixels+glyph.code*64+i);
    allowed.add(font.widths+glyph.code);
  }
  for(let i=0;i<original.length;i++) if(original[i]!==result.bytes[i]) assert.ok(allowed.has(i),`Unexpected byte change at ${i.toString(16)}`);
  assert.deepEqual(result.bytes.subarray(original.length,original.length+encoded.length),Buffer.from(encoded));
  assert.throws(()=>relocateDialogs(original,[{id:entry.id,bytes:encoded},{id:entry.id,bytes:encoded}]),/Duplicate/);
  const corrupt=Buffer.from(original);corrupt[0x100]^=1;
  assert.throws(()=>buildTranslatedRom(corrupt,[entry]),/original/);
});
