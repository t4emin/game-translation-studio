import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadProject } from "../src/core/projects.ts";
import { createThaiAtlas, patchThaiFonts, encodeDialog } from "../src/core/platforms/gba/thai-font.ts";
import { relocateDialogs } from "../src/core/platforms/gba/firered-rom.ts";
const project=await loadProject(process.argv[2]);
const original=await readFile(`.local/projects/${project.id}/original.gba`);
const entry=project.entries.find(e=>e.context==="gOakSpeech_Text_WelcomeToTheWorld")!;
for(const bank of [1,2,4,5]) {
  const atlas=createThaiAtlas([entry.translatedText]);
  for(const glyph of atlas.values()) glyph.bank=bank;
  const rom=relocateDialogs(original,[{id:entry.id,bytes:encodeDialog(entry.translatedText,original,atlas)}],patchThaiFonts(original,atlas));
  await mkdir(`artifacts/font-bank-${bank}`,{recursive:true});
  await writeFile(`artifacts/font-bank-${bank}/test.gba`,rom);
}
console.log("Prepared all four font banks for emulator comparison.");
