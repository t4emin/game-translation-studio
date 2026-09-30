import { NextResponse } from "next/server";
import { OpenAIAdapterAnalysisProvider } from "@/core/providers/openai/analysis";
import type { AnalysisReport } from "@/core/types";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const report = await request.json() as AnalysisReport;
    if (!report?.metadata || report.metadata.platform !== "gba") throw new Error("A GBA analysis report is required.");
    const provider = new OpenAIAdapterAnalysisProvider();
    if (!provider.isConfigured()) throw new Error("OPENAI_API_KEY is not configured.");
    return NextResponse.json(await provider.analyze(report));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI analysis failed" }, { status: 422 });
  }
}
