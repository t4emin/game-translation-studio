import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TargetLanguage, TranslationEntry } from "../types.ts";

type LocalTranslationFile = {
  version: 1;
  game: "pokemon-firered-rev1";
  targetLanguage: TargetLanguage;
  entries: {
    id: string;
    sourceHash: string;
    sourceText: string;
    translatedText: string;
  }[];
};

const cache = new Map<TargetLanguage, Promise<Map<string, string>>>();

export async function findLocalTranslation(entry: TranslationEntry, target: TargetLanguage): Promise<string | undefined> {
  const memory = await loadLocalTranslations(target);
  return memory.get(localKey(entry.id, entry.sourceText));
}

async function loadLocalTranslations(target: TargetLanguage): Promise<Map<string, string>> {
  if (target !== "thai") return new Map();
  const existing = cache.get(target);
  if (existing) return existing;
  const promise = readFile(join(process.cwd(), "translations", "pokemon-firered-rev1.thai.json"), "utf8")
    .then((text) => parseLocalTranslationFile(JSON.parse(text), target))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return new Map<string, string>();
      throw error;
    });
  cache.set(target, promise);
  return promise;
}

function parseLocalTranslationFile(data: LocalTranslationFile, target: TargetLanguage): Map<string, string> {
  if (data.version !== 1 || data.game !== "pokemon-firered-rev1" || data.targetLanguage !== target) {
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
