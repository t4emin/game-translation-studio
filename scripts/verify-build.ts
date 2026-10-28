import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadProject, exportProject } from "../src/core/projects.ts";
import { manifest, digest } from "../src/core/platforms/gba/firered-rom.ts";
import { createThaiAtlas, encodeDialog, dialogLayout } from "../src/core/platforms/gba/thai-font.ts";

const id=process.argv[2];
const project=await loadProject(id);
assert.ok(project.entries.every(entry=>entry.status==="translated"||entry.status==="warning"),"Finished translation required");
const original=await readFile(`.local/projects/${id}/original.gba`);
const result=await exportProject(id);
const entries=project.entries.filter(entry=>entry.status==="translated"&&entry.translatedText!==entry.sourceText);
const atlas=createThaiAtlas(entries.map(entry=>entry.translatedText));
const allowed=new Uint8Array(original.length);
let references=0;
for(const glyph of atlas.values()){
  const font=manifest.fonts.find(font=>font.id===glyph.bank)!;
  allowed.fill(1,font.pixels+glyph.code*64,font.pixels+(glyph.code+1)*64);
  allowed[font.widths+glyph.code]=1;
}
for(const entry of entries){
  const record=manifest.entries.find(record=>record.offset===entry.resource.offset)!;
  const encoded=encodeDialog(entry.translatedText,original,atlas,dialogLayout(entry));
  for(const ref of record.references){
    const offset=result.bytes.readUInt32LE(ref)-0x08000000;
    assert.ok(offset>=original.length&&offset+encoded.length<=result.bytes.length);
    assert.deepEqual(result.bytes.subarray(offset,offset+encoded.length),Buffer.from(encoded));
    allowed.fill(1,ref,ref+4);references++;
  }
}
let changedBytes=0;
for(let offset=0;offset<original.length;offset++){
  if(original[offset]!==result.bytes[offset]){
    assert.ok(allowed[offset],`Unexpected change at ${offset.toString(16)}`);changedBytes++;
  }
}
assert.equal(digest(original),manifest.checksum);
await mkdir("artifacts",{recursive:true});
await writeFile(`artifacts/${result.name}`,result.bytes);
const report={translated:result.translated,glyphs:result.glyphs,references,changedBytes,bytes:result.bytes.length,checksum:result.checksum};
await writeFile("artifacts/build-verification.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
