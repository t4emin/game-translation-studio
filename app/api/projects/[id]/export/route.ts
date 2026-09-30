import { exportProject } from "@/core/projects";
export const runtime="nodejs";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  try {
    const result=await exportProject((await context.params).id);
    return new Response(new Uint8Array(result.bytes),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${result.name}"`,"Cache-Control":"no-store","X-ROM-SHA256":result.checksum}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Export failed"},{status:422});}
}
