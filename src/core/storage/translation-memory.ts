import { createHash } from "node:crypto";
import type { SourceLanguage, TargetLanguage } from "../types.ts";

export interface TranslationMemoryRecord {
  sourceHash: string;
  sourceText: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  translatedText: string;
  context?: string;
  gameIdentity?: string;
  status: "draft" | "reviewed";
  provider?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export class TranslationMemory {
  private records = new Map<string, TranslationMemoryRecord>();

  find(sourceText: string, sourceLanguage: SourceLanguage, targetLanguage: TargetLanguage, context?: string): TranslationMemoryRecord | undefined {
    return this.records.get(memoryKey(sourceText, sourceLanguage, targetLanguage, context));
  }

  upsert(record: Omit<TranslationMemoryRecord, "sourceHash" | "createdAt" | "updatedAt">): TranslationMemoryRecord {
    const now = new Date().toISOString();
    const key = memoryKey(record.sourceText, record.sourceLanguage, record.targetLanguage, record.context);
    const existing = this.records.get(key);
    const next: TranslationMemoryRecord = {
      ...record,
      sourceHash: hashSource(record.sourceText),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.records.set(key, next);
    return next;
  }

  export(): TranslationMemoryRecord[] {
    return Array.from(this.records.values());
  }
}

export function hashSource(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

function memoryKey(sourceText: string, sourceLanguage: SourceLanguage, targetLanguage: TargetLanguage, context = ""): string {
  return `${hashSource(sourceText)}:${sourceLanguage}:${targetLanguage}:${context}`;
}
