"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Languages, Download, Pause, RotateCw, Check, Terminal, ArrowUp } from "lucide-react";

type Project = {
  id:string; name:string; target:string; total:number; done:number; complete:boolean; error:string|null; adapterName?:string; exportBlocked?:boolean; exportBlockReason?:string|null;
  samples:{id:string;source:string;translation:string}[];
  failed:{id:string;source:string;translation:string;error:string}[];
};
type PlatformChoice = "gba" | "ps2";
type Analysis = {
  compatibility:"full"|"experimental"|"unsupported";
  metadata:{fileName:string;title?:string;gameId?:string;revision?:string;fileSize:number;checksum:string;details:Record<string,string|number|boolean|null>};
  adapter?:{name:string;region:string;revision:string;capabilities:Record<string,boolean>};
  capabilities:Record<string,string>;
  genericScan?:{
    ascii:{count:number};
    shiftJis:{count:number};
    pointers:{count:number;uniqueTargets:number};
    compression:{count:number};
  };
  textPreview?:{
    source:"adapter"|"generic";
    total:number;
    entries:{id:string;sourceText:string;category:string;context?:string;offset?:number;length?:number;confidence?:number}[];
  };
  isoScan?:{
    valid:boolean;
    volumeId?:string;
    systemId?:string;
    bootFile?:string;
    fileCount:number;
    directoryCount:number;
    totalBytes:number;
    largestFiles:{path:string;lba:number;size:number;directory:boolean;reason:string;stringCount?:number;sample?:string;samples?:string[]}[];
    candidates:{path:string;lba:number;size:number;directory:boolean;reason:string;stringCount?:number;sample?:string;samples?:string[]}[];
    strings:{path:string;offset:number;encoding:"ascii"|"utf16le"|"shift-jis";text:string;confidence:number}[];
    issues:string[];
  };
  issues:{level:string;code:string;message:string}[];
};
async function responseJson<T>(response:Response):Promise<T> {
  const text=await response.text();
  let data: unknown;
  try { data=text ? JSON.parse(text) : {}; }
  catch {
    if(!response.ok) throw new Error(text || `Request failed with HTTP ${response.status}`);
    throw new Error("Server returned a non-JSON response.");
  }
  if(!response.ok) throw new Error(typeof data==="object" && data && "error" in data ? String(data.error) : "Request failed");
  return data as T;
}
const readable=(text:string)=>text.replace(/\[NEW_LINE\]/g,"\n").replace(/\[PROMPT_(CLEAR|SCROLL)\]/g,"\n\n");
const vercelFunctionPayloadLimit=4.5*1024*1024;

export default function Home() {
  const [project,setProject]=useState<Project|null>(null);
  const [platform,setPlatform]=useState<PlatformChoice>("gba");
  const [target,setTarget]=useState("thai");
  const [busy,setBusy]=useState<"upload"|"translate"|"export"|null>(null);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("รอไฟล์ ROM");
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [stopping,setStopping]=useState(false);
  const [showTop,setShowTop]=useState(false);
  const stop=useRef(false);
  useEffect(()=>{
    const requested=new URLSearchParams(window.location.search).get("project");
    const id=requested&&/^[0-9a-f-]{36}$/.test(requested)?requested:localStorage.getItem("gts-project");
    if(id) fetch(`/api/projects/${id}`).then(response=>responseJson<Project>(response)).then((p:Project)=>{
      localStorage.setItem("gts-project",p.id);
      setProject(p);setTarget(p.target);setStatus(p.complete?"แปลเสร็จแล้ว พร้อม Export":"โหลดงานเดิมแล้ว");
    }).catch(()=>localStorage.removeItem("gts-project"));
    return ()=>{stop.current=true;};
  },[]);
  useEffect(()=>{
    const onScroll=()=>setShowTop(window.scrollY>420);
    onScroll();
    window.addEventListener("scroll",onScroll,{passive:true});
    return ()=>window.removeEventListener("scroll",onScroll);
  },[]);
  async function upload(file:File) {
    setBusy("upload");setError("");setAnalysis(null);setStatus(platform==="ps2"?"กำลังวิเคราะห์ PS2 ISO...":"กำลังวิเคราะห์ GBA ROM...");
    try {
      if(location.hostname.endsWith(".vercel.app") && file.size>vercelFunctionPayloadLimit) {
        throw new Error("Vercel Functions รับ request/response ได้สูงสุดประมาณ 4.5MB ไฟล์ ROM/ISO นี้ใหญ่กว่า ต้องรัน local หรือ deploy บน Node server ที่รับไฟล์ใหญ่ได้");
      }
      const expected=platform==="ps2"?".iso":".gba";
      if(!file.name.toLowerCase().endsWith(expected)) throw new Error(`เลือก ${platform.toUpperCase()} แล้ว ต้องใช้ไฟล์ ${expected}`);
      const analysisForm=new FormData();analysisForm.set("file",file);analysisForm.set("platform",platform);
      const report=await responseJson<Analysis>(await fetch("/api/analyze",{method:"POST",body:analysisForm}));
      setAnalysis(report);
      if(report.compatibility!=="full" && !report.adapter?.capabilities.extraction) {
        setProject(null);
        setStatus(platform==="ps2"?"อ่าน ISO แล้ว ดู candidate files ด้านล่าง":"อ่าน GBA แล้ว ดู text candidates ด้านล่าง");
        setError("");
        return;
      }
      const form=new FormData();form.set("file",file);form.set("target",target);form.set("platform",platform);
      const p=await responseJson<Project>(await fetch("/api/projects",{method:"POST",body:form}));
      setProject(p);localStorage.setItem("gts-project",p.id);setStatus(p.exportBlocked?"พร้อมแปล/ตรวจคำแปล":"พร้อมแปล");
      if(p.exportBlocked) setError(`${p.adapterName??"Adapter นี้"} export ROM ยังไม่ได้: ${p.exportBlockReason??"adapter ยังไม่พร้อมสำหรับ target นี้"}`);
    }catch(e){setError(e instanceof Error?e.message:"Upload failed");setStatus("อัปโหลดไม่สำเร็จ");}
    finally{setBusy(null);}
  }
  async function translate() {
    if(!project) return;
    setBusy("translate");setError("");setStopping(false);stop.current=false;setStatus("กำลังแปล...");
    try {
      let previous=project.done,stalled=0;
      while(!stop.current) {
        const p=await responseJson<Project>(await fetch(`/api/projects/${project.id}/translate`,{method:"POST"}));
        setProject(p);
        stalled=p.done===previous?stalled+1:0;previous=p.done;
        if(p.error&&stalled>=3) throw new Error(p.error);
        if(stalled>=3) throw new Error("ยังแปลชุดนี้ไม่สำเร็จ บันทึกความคืบหน้าไว้แล้ว กรุณาลองอีกครั้ง");
        setStatus(p.error?"บันทึกแล้ว กำลังลองข้อความที่เหลือใหม่...":"กำลังแปล...");
        if(p.complete){setStatus("แปลเสร็จแล้ว พร้อม Export");break;}
      }
      if(stop.current) setStatus("พักการแปลแล้ว บันทึกความคืบหน้าไว้แล้ว");
    }catch(e){setError(e instanceof Error?e.message:"Translation failed");setStatus("การแปลหยุดชั่วคราว");
      try{setProject(await responseJson<Project>(await fetch(`/api/projects/${project.id}`)));}catch{}
    }finally{setBusy(null);setStopping(false);}
  }
  async function selectTarget(next:string) {
    if(!project){setTarget(next);return;}
    setBusy("upload");setError("");
    try {
      const p=await responseJson<Project>(await fetch(`/api/projects/${project.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({target:next})}));
      setProject(p);setTarget(p.target);
    }catch(e){setError(e instanceof Error?e.message:"Language change failed");}
    finally{setBusy(null);}
  }
  function selectPlatform(next:PlatformChoice) {
    setPlatform(next);
    setProject(null);
    setAnalysis(null);
    setError("");
    setStatus(next==="ps2"?"รอไฟล์ PS2 .iso":"รอไฟล์ GBA ROM");
    localStorage.removeItem("gts-project");
  }
  async function download() {
    if(!project) return;
    setBusy("export");setError("");setStatus("กำลังดาวน์โหลด ROM...");
    try {
      const a=document.createElement("a");
      a.href=`/api/projects/${project.id}/export`;
      a.download=`FireRed-Rev1-${project.target}.gba`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("Export สำเร็จ");
    }catch(e){setError(e instanceof Error?e.message:"Export failed");setStatus("Export ไม่สำเร็จ");}
    finally{setBusy(null);}
  }
  async function save(entryId:string,text:string) {
    setError("");
    try{setProject(await responseJson<Project>(await fetch(`/api/projects/${project!.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({entryId,text})})));}
    catch(e){setError(e instanceof Error?e.message:"Save failed");}
  }
  const percent=project?Math.round(project.done/project.total*100):0;
  const currentFileName=project?.name??analysis?.metadata.fileName??(platform==="ps2"?"ยังไม่ได้เลือกไฟล์ PS2 .iso":"ยังไม่ได้เลือกไฟล์ ROM");
  const isoRows=analysis?.isoScan ? analysis.isoScan.candidates.length ? analysis.isoScan.candidates : analysis.isoScan.largestFiles : [];
  const isoStrings=analysis?.isoScan?.strings??[];
  const textRows=analysis?.textPreview?.entries??[];
  return <main className="shell">
    <header className="topbar"><div className="brand"><img src="/logo.png" className="brandLogo" alt=""/><div><p className="eyebrow">GBA WORKBENCH / LOCAL-FIRST</p><h1>Game Translation Studio</h1></div></div><Terminal size={22} aria-hidden="true"/></header>
    <section className="flow" aria-label="Translation">
      <div className="step"><span className="stepNumber">01</span><div className="stepBody"><h2>Upload ROM</h2><fieldset disabled={!!busy}><legend>Platform</legend><label><input type="radio" name="platform" checked={platform==="gba"} onChange={()=>selectPlatform("gba")}/>GBA .gba</label><label><input type="radio" name="platform" checked={platform==="ps2"} onChange={()=>selectPlatform("ps2")}/>PS2 .iso</label></fieldset><input aria-label="Upload ROM" type="file" accept={platform==="ps2"?".iso":".gba"} disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/><p className="fileName">{currentFileName}</p></div><Upload className="stepIcon" size={20}/></div>
      <div className="step"><span className="stepNumber">02</span><div className="stepBody"><h2>แปลภาษา</h2><fieldset disabled={!!busy||!!project?.done}><legend>ภาษาปลายทาง</legend><label><input type="radio" name="target" checked={target==="thai"} onChange={()=>void selectTarget("thai")}/>ไทย</label><label><input type="radio" name="target" checked={target==="english"} onChange={()=>void selectTarget("english")}/>English</label></fieldset>
      <div className="actions"><button disabled={!project||!!busy||project.complete} onClick={()=>void translate()}>{project?.complete?<Check size={17}/>:project?.done?<RotateCw size={17}/>:<Languages size={17}/>} {project?.complete?"แปลเสร็จแล้ว":project?.done?"แปลต่อ":"แปล"}</button>{busy==="translate"&&<button className="secondary" disabled={stopping} onClick={()=>{stop.current=true;setStopping(true);setStatus("กำลังบันทึกชุดปัจจุบัน...");}}><Pause size={17}/>{stopping?"กำลังพัก...":"พัก"}</button>}</div></div><Languages className="stepIcon" size={20}/></div>
      <div className="step"><span className="stepNumber">03</span><div className="stepBody"><h2>Export</h2><button className="secondary" disabled={!project?.complete||project.exportBlocked||!!busy} onClick={()=>void download()}><Download size={17}/>Export .gba</button>{project?.exportBlocked&&<p className="fileName">Export pending: {project.exportBlockReason??"adapter ยังไม่พร้อมสำหรับ target นี้"}</p>}</div><Download className="stepIcon" size={20}/></div>
    </section>
    <section className="progressArea" aria-live="polite"><div className="statusLine"><span className="prompt">&gt;</span><span>{status}</span>{project?.complete&&<Check size={17}/>}</div>{project&&<><progress max={project.total} value={project.done} aria-label="ข้อความที่แปลแล้ว"/><div className="progressLabel"><span>{project.done.toLocaleString()} / {project.total.toLocaleString()} ข้อความ</span><span>{percent}%</span></div></>}{error&&<p className="errorText" role="alert">{error}</p>}</section>
    {analysis&&<section className="analysisPanel" aria-label="Game analysis">
      <div className="analysisHeader"><span className={`badge ${analysis.compatibility}`}>{analysis.compatibility.toUpperCase()}</span><span>{analysis.adapter?.name??(analysis.isoScan?"PS2 ISO Explorer":"Generic GBA Analysis")}</span></div>
      <div className="analysisGrid">
        <span>Title</span><strong>{analysis.metadata.title||"Unknown"}</strong>
        <span>File</span><strong>{analysis.metadata.fileName}</strong>
        <span>Game Code</span><strong>{analysis.metadata.gameId||"Unknown"}</strong>
        <span>Revision</span><strong>{analysis.metadata.revision||"Unknown"}</strong>
        <span>SHA-256</span><strong className="hash">{analysis.metadata.checksum}</strong>
        {analysis.genericScan&&<><span>ASCII</span><strong>{analysis.genericScan.ascii.count.toLocaleString()} candidates</strong>
        <span>Shift-JIS</span><strong>{analysis.genericScan.shiftJis.count.toLocaleString()} candidates</strong>
        <span>Pointers</span><strong>{analysis.genericScan.pointers.count.toLocaleString()} / {analysis.genericScan.pointers.uniqueTargets.toLocaleString()} targets</strong>
        <span>LZ77</span><strong>{analysis.genericScan.compression.count.toLocaleString()} candidates</strong></>}
        {analysis.isoScan&&<><span>ISO9660</span><strong>{analysis.isoScan.valid?"valid":"not found"}</strong>
        <span>Volume</span><strong>{analysis.isoScan.volumeId||"Unknown"}</strong>
        <span>Boot</span><strong>{analysis.isoScan.bootFile||"Unknown"}</strong>
        <span>Files</span><strong>{analysis.isoScan.fileCount.toLocaleString()} files / {analysis.isoScan.directoryCount.toLocaleString()} dirs</strong></>}
      </div>
      {analysis.isoScan&&<div className="isoExplorer">
        <h3>Extracted strings ({isoStrings.length.toLocaleString()})</h3>
        {isoStrings.map(entry=><div className="dialogRow" key={`${entry.path}-${entry.offset}-${entry.encoding}`}>
          <div><strong>{entry.path}</strong><p>{entry.text}</p></div>
          <span>{entry.encoding}<br/>0x{entry.offset.toString(16).toUpperCase()}<br/>{Math.round(entry.confidence*100)}%</span>
        </div>)}
        {!isoStrings.length&&<p className="muted">ยังไม่เจอ string ที่เหมือนบทสนทนาในไฟล์ที่สแกน</p>}
        <h3>Candidate files ({isoRows.length.toLocaleString()})</h3>
        {isoRows.map(file=><div className="fileRow" key={`${file.path}-${file.lba}`}>
          <div><strong>{file.path}</strong><p>{file.reason||"large file"}{file.stringCount?` · ${file.stringCount.toLocaleString()} readable string(s)`:""}</p>{file.samples?.length?<ul>{file.samples.map((sample,index)=><li key={`${file.path}-${index}`}>{sample}</li>)}</ul>:null}</div>
          <span>{(file.size/1024/1024).toFixed(2)} MB<br/>LBA {file.lba.toLocaleString()}</span>
        </div>)}
        {!analysis.isoScan.candidates.length&&analysis.isoScan.largestFiles.length===0&&<p className="muted">ไม่พบไฟล์ใน ISO</p>}
        {analysis.isoScan.issues.map(issue=><p className="errorText" key={issue}>{issue}</p>)}
      </div>}
      {analysis.textPreview&&<div className="textExplorer">
        <h3>{analysis.textPreview.source==="adapter"?"Extracted dialog":"Text candidates"} ({analysis.textPreview.total.toLocaleString()})</h3>
        {textRows.map(entry=><div className="dialogRow" key={entry.id}>
          <div><strong>{entry.context||entry.id}</strong><p>{readable(entry.sourceText)}</p></div>
          <span>{entry.category}{entry.offset!==undefined?<><br/>0x{entry.offset.toString(16).toUpperCase()}</>:null}{entry.confidence!==undefined?<><br/>{Math.round(entry.confidence*100)}%</>:null}</span>
        </div>)}
        {!textRows.length&&<p className="muted">ไม่พบข้อความที่ถอดได้</p>}
      </div>}
      {!analysis.isoScan&&<div className="capabilities">{Object.entries(analysis.capabilities).map(([key,value])=><span key={key}>{key}: {value}</span>)}</div>}
      {analysis.issues.map(issue=><p key={issue.code} className={issue.level==="error"?"errorText":"muted"}>{issue.message}</p>)}
    </section>}
    <p className="scope">GBA รองรับ .gba · PS2 ISO Explorer อ่านไฟล์ในแผ่นและโชว์ string candidates · ขั้นถัดไปคือเลือกไฟล์แล้วแตก dialog เป็นรายการแก้ไข</p>
    {project&&<details className="details"><summary>คำแปล {project.failed.length>0&&`/ ต้องตรวจ ${project.failed.length} ข้อความ`}</summary>
      {project.failed.map(entry=><form className="translationRow" key={entry.id} onSubmit={event=>{event.preventDefault();void save(entry.id,String(new FormData(event.currentTarget).get("text")));}}><p>{readable(entry.source)}</p><textarea aria-label={`แก้คำแปล ${entry.id}`} name="text" defaultValue={entry.translation}/><p className="errorText">{entry.error}</p><button disabled={!!busy} type="submit"><Check size={16}/>บันทึก</button></form>)}
      {project.samples.map(entry=><div className="translationRow" key={entry.id}><p className="muted">{readable(entry.source)}</p><p>{readable(entry.translation)}</p></div>)}
      {!project.samples.length&&!project.failed.length&&<p className="muted">ยังไม่มีคำแปล</p>}
    </details>}
    <button className={`toTop ${showTop?"visible":""}`} type="button" aria-label="Scroll to top" title="Scroll to top" onClick={()=>window.scrollTo({top:0,behavior:"smooth"})}><ArrowUp size={19}/></button>
  </main>;
}
