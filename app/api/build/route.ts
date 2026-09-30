import { NextResponse } from "next/server";
import { exportProject } from "@/core/projects";

export const runtime = "nodejs";

export async function POST(request:Request) {
  try {
    const {projectId}=await request.json();
    if(typeof projectId!=="string") throw new Error("Missing project ID");
    const result=await exportProject(projectId);
    return new Response(new Uint8Array(result.bytes),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${result.name}"`}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Build failed"},{status:422});}
}
