import { readFile, writeFile } from "node:fs/promises";
import { loadProject } from "../src/core/projects.ts";
import { protectedNames } from "../src/core/platforms/gba/firered-rom.ts";
const id=process.argv[2],project=await loadProject(id);
const names=protectedNames(await readFile(`.local/projects/${id}/original.gba`));
const pattern=new RegExp(`(?<![A-Za-z0-9])(?:${names.sort((a,b)=>b.length-a.length).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})(?![A-Za-z0-9])`);
let count=0;
for(const entry of project.entries) {
  if(entry.status==="translated" && entry.translationVersion!==3 && pattern.test(entry.sourceText)) {
    entry.status="untranslated";entry.translatedText="";count++;
  }
}
await writeFile(`.local/projects/${id}/project.json`,JSON.stringify(project));
console.log({queuedForNameReview:count,kept:project.entries.filter(e=>e.status==="translated").length});
