import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TargetLanguage, TranslationEntry } from "../types.ts";

type LocalTranslationFile = {
  version: 1;
  game: string;
  targetLanguage: TargetLanguage;
  entries: {
    id: string;
    sourceHash: string;
    sourceText: string;
    translatedText: string;
  }[];
};

const cache = new Map<string, Promise<Map<string, string>>>();

export async function findLocalTranslation(entry: TranslationEntry, target: TargetLanguage, adapterId = "pokemon-firered-rev1"): Promise<string | undefined> {
  const memory = await loadLocalTranslations(target, adapterId);
  return memory.get(localKey(entry.id, entry.sourceText));
}

async function loadLocalTranslations(target: TargetLanguage, adapterId: string): Promise<Map<string, string>> {
  if (target !== "thai") return new Map();
  const cacheKey = `${adapterId}:${target}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;
  const promise = readLocalTranslationFiles(target, adapterId)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return new Map<string, string>();
      throw error;
    });
  cache.set(cacheKey, promise);
  return promise;
}

async function readLocalTranslationFiles(target: TargetLanguage, adapterId: string): Promise<Map<string, string>> {
  const files = adapterId === "gba-pokemon-firered-bpre-rev1"
    ? ["pokemon-firered-rev1.thai.json"]
    : [`${adapterId}.${target}.json`, "pokemon-firered-rev1.thai.json"];
  const merged = new Map<string, string>();
  for (const file of files) {
    try {
      const parsed = parseLocalTranslationFile(JSON.parse(await readFile(join(process.cwd(), "translations", file), "utf8")), target);
      for (const item of parsed) merged.set(item[0], item[1]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return merged;
}

function parseLocalTranslationFile(data: LocalTranslationFile, target: TargetLanguage): Map<string, string> {
  if (data.version !== 1 || data.targetLanguage !== target) {
    throw new Error("Local translation file has an unsupported format.");
  }
  return new Map(data.entries.map((entry) => [localKey(entry.id, entry.sourceText, entry.sourceHash), entry.translatedText]));
}

function localKey(id: string, sourceText: string, sourceHash = hashSource(sourceText)): string {
  return `${id}:${sourceHash}`;
}

function hashSource(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}
