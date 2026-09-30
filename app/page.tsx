"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Languages, Download, Pause, RotateCw, Check, Terminal } from "lucide-react";

type Project = {
  id:string; name:string; target:string; total:number; done:number; complete:boolean; error:string|null; adapterName?:string; exportBlocked?:boolean;
  samples:{id:string;source:string;translation:string}[];
  failed:{id:string;source:string;translation:string;error:string}[];
};
type AiAdapterAnalysis = {
  likelyGame:string;
  likelyEngine:string;
  confidence:number;
  extractionHypothesis:string;
  adapterReuse:string[];
  blockers:string[];
  nextSteps:string[];
  buildSafety:"blocked"|"experimental"|"full-not-recommended";
};
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
  aiAnalysis?:AiAdapterAnalysis;
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
  const [target,setTarget]=useState("thai");
  const [busy,setBusy]=useState<"upload"|"translate"|"export"|null>(null);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("รอไฟล์ ROM");
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [aiBusy,setAiBusy]=useState(false);
  const [stopping,setStopping]=useState(false);
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
  async function upload(file:File) {
    setBusy("upload");setError("");setAnalysis(null);setAiBusy(false);setStatus("กำลังวิเคราะห์ GBA ROM...");
    try {
      if(location.hostname.endsWith(".vercel.app") && file.size>vercelFunctionPayloadLimit) {
        throw new Error("Vercel Functions รับ request/response ได้สูงสุดประมาณ 4.5MB แต่ GBA ROM นี้ใหญ่กว่า ต้องรัน local หรือ deploy บน Node server ที่รับไฟล์ 16-17MB ได้");
      }
      const analysisForm=new FormData();analysisForm.set("file",file);analysisForm.set("platform","gba");
      const report=await responseJson<Analysis>(await fetch("/api/analyze",{method:"POST",body:analysisForm}));
      setAnalysis(report);
      if(report.compatibility!=="full" && !report.adapter?.capabilities.extraction) {
        setProject(null);
        setStatus("Generic analysis mode: ตรวจพบข้อมูลบางส่วน แต่ยัง Export ROM ไม่ได้");
        setError("เกมนี้ยังไม่มี adapter แบบ FULL จึงดู candidate ได้เท่านั้น ระบบจะไม่แก้ ROM จนกว่าจะรู้โครงสร้างเกมพอ");
        return;
      }
      const form=new FormData();form.set("file",file);form.set("target",target);
      const p=await responseJson<Project>(await fetch("/api/projects",{method:"POST",body:form}));
      setProject(p);localStorage.setItem("gts-project",p.id);setStatus(p.exportBlocked?"พร้อมแปล/ตรวจคำแปล แต่ Export ยังถูก block":"พร้อมแปล");
      if(p.exportBlocked) setError(`${p.adapterName??"Adapter นี้"} ยังไม่มี safe injection/rebuild จึงแปลเพื่อตรวจงานได้ แต่ export ROM ยังไม่ได้`);
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
  async function analyzeWithAi() {
    if(!analysis) return;
    setAiBusy(true);setError("");setStatus("AI กำลังช่วยวิเคราะห์ adapter...");
    try {
      const aiAnalysis=await responseJson<AiAdapterAnalysis>(await fetch("/api/analyze/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(analysis)}));
      setAnalysis({...analysis,aiAnalysis});
      setStatus("AI วิเคราะห์ adapter เสร็จแล้ว");
    }catch(e){
      setError(e instanceof Error?e.message:"AI analysis failed");
      setStatus("AI วิเคราะห์ไม่สำเร็จ");
    }finally{setAiBusy(false);}
  }
  const percent=project?Math.round(project.done/project.total*100):0;
  const currentFileName=project?.name??analysis?.metadata.fileName??"ยังไม่ได้เลือกไฟล์ ROM";
  return <main className="shell">
    <header className="topbar"><div className="brand"><img src="/logo.png" className="brandLogo" alt=""/><div><p className="eyebrow">GBA WORKBENCH / LOCAL-FIRST</p><h1>Game Translation Studio</h1></div></div><Terminal size={22} aria-hidden="true"/></header>
    <section className="flow" aria-label="Translation">
      <div className="step"><span className="stepNumber">01</span><div className="stepBody"><h2>Upload ROM</h2><input aria-label="Upload ROM" type="file" accept=".gba" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/><p className="fileName">{currentFileName}</p></div><Upload className="stepIcon" size={20}/></div>
      <div className="step"><span className="stepNumber">02</span><div className="stepBody"><h2>แปลภาษา</h2><fieldset disabled={!!busy||!!project?.done}><legend>ภาษาปลายทาง</legend><label><input type="radio" name="target" checked={target==="thai"} onChange={()=>void selectTarget("thai")}/>ไทย</label><label><input type="radio" name="target" checked={target==="english"} onChange={()=>void selectTarget("english")}/>English</label></fieldset>
      <div className="actions"><button disabled={!project||!!busy||project.complete} onClick={()=>void translate()}>{project?.complete?<Check size={17}/>:project?.done?<RotateCw size={17}/>:<Languages size={17}/>} {project?.complete?"แปลเสร็จแล้ว":project?.done?"แปลต่อ":"แปล"}</button>{busy==="translate"&&<button className="secondary" disabled={stopping} onClick={()=>{stop.current=true;setStopping(true);setStatus("กำลังบันทึกชุดปัจจุบัน...");}}><Pause size={17}/>{stopping?"กำลังพัก...":"พัก"}</button>}</div></div><Languages className="stepIcon" size={20}/></div>
      <div className="step"><span className="stepNumber">03</span><div className="stepBody"><h2>Export</h2><button className="secondary" disabled={!project?.complete||project.exportBlocked||!!busy} onClick={()=>void download()}><Download size={17}/>Export .gba</button>{project?.exportBlocked&&<p className="fileName">Export blocked: adapter นี้ยังไม่มี safe injection/rebuild</p>}</div><Download className="stepIcon" size={20}/></div>
    </section>
    <section className="progressArea" aria-live="polite"><div className="statusLine"><span className="prompt">&gt;</span><span>{status}</span>{project?.complete&&<Check size={17}/>}</div>{project&&<><progress max={project.total} value={project.done} aria-label="ข้อความที่แปลแล้ว"/><div className="progressLabel"><span>{project.done.toLocaleString()} / {project.total.toLocaleString()} ข้อความ</span><span>{percent}%</span></div></>}{error&&<p className="errorText" role="alert">{error}</p>}</section>
    {analysis&&<section className="analysisPanel" aria-label="GBA analysis">
      <div className="analysisHeader"><span className={`badge ${analysis.compatibility}`}>{analysis.compatibility.toUpperCase()}</span><span>{analysis.adapter?.name??"Generic GBA Analysis"}</span></div>
      <div className="analysisGrid">
        <span>Title</span><strong>{analysis.metadata.title||"Unknown"}</strong>
        <span>File</span><strong>{analysis.metadata.fileName}</strong>
        <span>Game Code</span><strong>{analysis.metadata.gameId||"Unknown"}</strong>
        <span>Revision</span><strong>{analysis.metadata.revision||"Unknown"}</strong>
        <span>SHA-256</span><strong className="hash">{analysis.metadata.checksum}</strong>
        <span>ASCII</span><strong>{analysis.genericScan?.ascii.count.toLocaleString()??"0"} candidates</strong>
        <span>Shift-JIS</span><strong>{analysis.genericScan?.shiftJis.count.toLocaleString()??"0"} candidates</strong>
        <span>Pointers</span><strong>{analysis.genericScan?.pointers.count.toLocaleString()??"0"} / {analysis.genericScan?.pointers.uniqueTargets.toLocaleString()??"0"} targets</strong>
        <span>LZ77</span><strong>{analysis.genericScan?.compression.count.toLocaleString()??"0"} candidates</strong>
      </div>
      <div className="capabilities">{Object.entries(analysis.capabilities).map(([key,value])=><span key={key}>{key}: {value}</span>)}</div>
      {analysis.compatibility!=="full"&&<div className="aiActions"><button className="secondary" disabled={!!busy||aiBusy} onClick={()=>void analyzeWithAi()}><Terminal size={17}/>{aiBusy?"AI กำลังวิเคราะห์...":"AI วิเคราะห์ adapter"}</button><span>ส่งเฉพาะผล scan ไม่ส่ง ROM bytes</span></div>}
      {analysis.aiAnalysis&&<div className="aiReport">
        <div className="analysisHeader"><span className={`badge ${analysis.aiAnalysis.buildSafety==="blocked"?"unsupported":"experimental"}`}>{analysis.aiAnalysis.buildSafety}</span><span>{analysis.aiAnalysis.likelyGame} · {Math.round(analysis.aiAnalysis.confidence*100)}%</span></div>
        <div className="analysisGrid">
          <span>Engine</span><strong>{analysis.aiAnalysis.likelyEngine}</strong>
          <span>Hypothesis</span><strong>{analysis.aiAnalysis.extractionHypothesis}</strong>
        </div>
        <div className="aiColumns">
          <div><h3>Reuse</h3>{analysis.aiAnalysis.adapterReuse.map(item=><p key={item} className="muted">{item}</p>)}</div>
          <div><h3>Blockers</h3>{analysis.aiAnalysis.blockers.map(item=><p key={item} className="errorText">{item}</p>)}</div>
          <div><h3>Next</h3>{analysis.aiAnalysis.nextSteps.map(item=><p key={item} className="muted">{item}</p>)}</div>
        </div>
      </div>}
      {analysis.issues.map(issue=><p key={issue.code} className={issue.level==="error"?"errorText":"muted"}>{issue.message}</p>)}
    </section>}
    <p className="scope">V1 รองรับเฉพาะ .gba · Unknown games เข้าโหมดวิเคราะห์ได้ · Export ROM เปิดเฉพาะ adapter ที่ FULL เท่านั้น · FireRed Rev 1 คือเกมแรกที่ผ่าน pipeline</p>
    {project&&<details className="details"><summary>คำแปล {project.failed.length>0&&`/ ต้องตรวจ ${project.failed.length} ข้อความ`}</summary>
      {project.failed.map(entry=><form className="translationRow" key={entry.id} onSubmit={event=>{event.preventDefault();void save(entry.id,String(new FormData(event.currentTarget).get("text")));}}><p>{readable(entry.source)}</p><textarea aria-label={`แก้คำแปล ${entry.id}`} name="text" defaultValue={entry.translation}/><p className="errorText">{entry.error}</p><button disabled={!!busy} type="submit"><Check size={16}/>บันทึก</button></form>)}
      {project.samples.map(entry=><div className="translationRow" key={entry.id}><p className="muted">{readable(entry.source)}</p><p>{readable(entry.translation)}</p></div>)}
      {!project.samples.length&&!project.failed.length&&<p className="muted">ยังไม่มีคำแปล</p>}
    </details>}
  </main>;
}
