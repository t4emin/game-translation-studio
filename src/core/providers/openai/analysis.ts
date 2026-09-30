import { z } from "zod";
import type { AiAdapterAnalysis, AnalysisReport } from "../../types.ts";

const aiAnalysisSchema = z.object({
  likelyGame: z.string(),
  likelyEngine: z.string(),
  confidence: z.number().min(0).max(1),
  extractionHypothesis: z.string(),
  adapterReuse: z.array(z.string()).max(6),
  blockers: z.array(z.string()).max(8),
  nextSteps: z.array(z.string()).max(8),
  buildSafety: z.enum(["blocked", "experimental", "full-not-recommended"])
});

export class OpenAIAdapterAnalysisProvider {
  readonly model: string;
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_ANALYSIS_MODEL ?? process.env.OPENAI_TRANSLATION_MODEL) {
    this.apiKey = apiKey;
    this.model = model || "gpt-4.1-mini";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async analyze(report: AnalysisReport): Promise<AiAdapterAnalysis> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const payload = compactReport(report);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        input: [
          {
            role: "system",
            content:
              "You help develop safe GBA ROM translation adapters. Analyze only the provided deterministic scan summary. Do not claim a playable build is possible without a verified adapter. Never invent binary patches, offsets to overwrite, or ROM bytes. Keep the answer concise and actionable for an engineer. If the game appears to be Pokemon Emerald, say that it likely needs a separate exact Emerald adapter/manifest and cannot reuse FireRed offsets directly."
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ],
        text: {
          format: {
            type: "json_schema",
            strict: true,
            name: "gba_adapter_analysis",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["likelyGame", "likelyEngine", "confidence", "extractionHypothesis", "adapterReuse", "blockers", "nextSteps", "buildSafety"],
              properties: {
                likelyGame: { type: "string" },
                likelyEngine: { type: "string" },
                confidence: { type: "number" },
                extractionHypothesis: { type: "string" },
                adapterReuse: { type: "array", items: { type: "string" } },
                blockers: { type: "array", items: { type: "string" } },
                nextSteps: { type: "array", items: { type: "string" } },
                buildSafety: { type: "string", enum: ["blocked", "experimental", "full-not-recommended"] }
              }
            }
          }
        }
      })
    });
    if (!response.ok) throw new Error(`OpenAI adapter analysis failed with HTTP ${response.status}.`);
    const json = await response.json();
    const outputText = json.output_text ?? json.output?.flatMap((item: { content?: { text?: string }[] }) => item.content ?? []).map((item: { text?: string }) => item.text).join("");
    return aiAnalysisSchema.parse(JSON.parse(outputText));
  }
}

function compactReport(report: AnalysisReport) {
  return {
    metadata: {
      title: report.metadata.title,
      gameId: report.metadata.gameId,
      revision: report.metadata.revision,
      size: report.metadata.fileSize,
      checksumPrefix: report.metadata.checksum.slice(0, 16),
      makerCode: report.metadata.details.makerCode,
      headerChecksum: report.metadata.details.headerChecksum
    },
    compatibility: report.compatibility,
    capabilities: report.capabilities,
    genericScan: report.genericScan && {
      ascii: { count: report.genericScan.ascii.count, examples: report.genericScan.ascii.examples.slice(0, 6) },
      shiftJis: { count: report.genericScan.shiftJis.count, examples: report.genericScan.shiftJis.examples.slice(0, 4) },
      pointers: { count: report.genericScan.pointers.count, uniqueTargets: report.genericScan.pointers.uniqueTargets, examples: report.genericScan.pointers.examples.slice(0, 6) },
      compression: { count: report.genericScan.compression.count, examples: report.genericScan.compression.examples.slice(0, 4) }
    },
    issueCodes: report.issues.map((issue) => issue.code)
  };
}
