import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createProject, translateProjectBatch, loadProject, projectView, exportProject } from "../src/core/projects.ts";
import { buildTranslatedRom } from "../src/core/platforms/gba/thai-font.ts";

const [command,arg,limitArg]=process.argv.slice(2);
if(command==="create") {
  const p=await createProject(arg.split("/").at(-1)!,await readFile(arg),"thai");
  console.log(JSON.stringify(projectView(p)));
}else if(command==="translate") {
  const limit=Number(limitArg||10000);
  let previous=-1,stalled=0;
  for(let i=0;i<limit;i++) {
    const project=await translateProjectBatch(arg),view=projectView(project);
    console.log(JSON.stringify({id:arg,done:view.done,total:view.total,error:view.error,sample:view.samples.at(-1)}));
    stalled=view.processed===previous?stalled+1:0;previous=view.processed;
    if(view.error && stalled>=3){process.exitCode=1;break;}
    if(view.complete){const built=await exportProject(arg);console.log(JSON.stringify({output:built.name,checksum:built.checksum,glyphs:built.glyphs}));break;}
  }
}else if(command==="preview") {
  const project=await loadProject(arg);
  const original=await readFile(`.local/projects/${arg}/original.gba`);
  const result=buildTranslatedRom(original,project.entries.filter(e=>e.status==="translated"));
  await mkdir("artifacts",{recursive:true});
  await writeFile("artifacts/FireRed-Thai-preview.gba",result.bytes);
  console.log({translated:result.translated,glyphs:result.glyphs,checksum:result.checksum});
}else throw new Error("Usage: create ROM | translate PROJECT_ID [BATCHES] | preview PROJECT_ID");
