import type { SourceLanguage, TargetLanguage, TranslationEntry, TranslationStyle } from "../types.ts";

export interface ProjectWorkspace {
  id: string;
  fingerprint: string;
  adapterId?: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  style: TranslationStyle;
  entries: TranslationEntry[];
  createdAt: string;
  updatedAt: string;
}

export function workspaceSummary(workspace: ProjectWorkspace) {
  return workspace.entries.reduce(
    (summary, entry) => {
      summary.total += 1;
      summary[entry.status] += 1;
      return summary;
    },
    {
      total: 0,
      untranslated: 0,
      translated: 0,
      reviewed: 0,
      warning: 0,
      error: 0
    }
  );
}
