import { NextResponse } from "next/server";
import { OpenAITranslationProvider } from "@/core/providers/openai/provider";

export const runtime = "nodejs";

export async function GET() {
  const provider = new OpenAITranslationProvider();
  return NextResponse.json({
    configured: provider.isConfigured(),
    model: provider.model,
    description: provider.describeConfiguration()
  });
}
