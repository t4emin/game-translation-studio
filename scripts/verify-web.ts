import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createProject, loadProject } from "../src/core/projects.ts";
import { digest } from "../src/core/platforms/gba/firered-rom.ts";

const [romPath,translatedProject]=process.argv.slice(2);
const original=await readFile(romPath);
const source=await loadProject(translatedProject);
const complete=source.entries.every(entry=>entry.status==="translated");
const fixture=complete?source:await createProject("Verification (translated sample)",original,"thai");
if(!complete){
  fixture.entries=source.entries.filter(e=>e.status==="translated");
  if(!fixture.entries.length) throw new Error("Need a translated test sample");
  await writeFile(`.local/projects/${fixture.id}/project.json`,JSON.stringify(fixture));
}
await mkdir("artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://localhost:3000");
  await expect(page.getByRole("heading",{name:"Game Translation Studio"})).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByLabel("Upload ROM",{exact:true}).setInputFiles(romPath);
  await expect(page.getByText("พร้อมแปล",{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByRole("button",{name:"แปล",exact:true})).toBeEnabled();
  await expect(page.getByRole("button",{name:"Export .gba"})).toBeDisabled();
  await page.screenshot({path:"artifacts/web-desktop.png",fullPage:true});
  await page.goto(`http://localhost:3000/?project=${fixture.id}`);
  await expect(page.getByRole("button",{name:"Export .gba"})).toBeEnabled();
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export .gba"}).click();
  const download=await downloadPromise;
  await download.saveAs("artifacts/FireRed-Thai-web-export.gba");
  const output=await readFile("artifacts/FireRed-Thai-web-export.gba");
  if(output.length<=original.length || digest(output)===digest(original)) throw new Error("Export was not a patched ROM");
  await expect(page.getByText("Export สำเร็จ",{exact:true})).toBeVisible();
  await page.screenshot({path:"artifacts/web-complete.png",fullPage:true});
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(overflow) throw new Error(`Horizontal overflow at ${width}px`);
    await page.screenshot({path:`artifacts/web-mobile-${width}.png`,fullPage:true});
  }
  if(errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({upload:"passed",export:"passed",bytes:output.length,translated:fixture.entries.length,desktop:"passed",mobile:"passed",fixtureId:fixture.id}));
}finally{await browser.close();}
