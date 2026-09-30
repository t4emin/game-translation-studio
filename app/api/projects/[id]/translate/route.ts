import { translateProjectBatch, projectView } from "@/core/projects";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(_request:Request,context:{params:Promise<{id:string}>}) {
  try{return Response.json(projectView(await translateProjectBatch((await context.params).id)));}
  catch(error){return Response.json({error:error instanceof Error?error.message:"Translation failed"},{status:422});}
}
