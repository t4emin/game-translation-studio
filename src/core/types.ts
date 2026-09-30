export type PlatformId = "gba" | "psp" | "ps2" | "unknown";
export type SourceLanguage = "auto" | "english" | "japanese";
export type TargetLanguage = "thai" | "english";
export type TranslationStyle = "natural" | "literal" | "concise";
export type AdapterStatus = "supported" | "experimental" | "unsupported" | "unknown";
export type EntryStatus = "untranslated" | "translated" | "reviewed" | "warning" | "error";
export type ValidationLevel = "info" | "warning" | "error";

export interface GameFile {
  name: string;
  size: number;
  extension: string;
  bytes: Uint8Array;
}

export interface DetectionResult {
  platform: PlatformId;
  confidence: number;
  reasons: string[];
}

export interface PlatformMetadata {
  platform: PlatformId;
  fileName: string;
  fileSize: number;
  checksum: string;
  title?: string;
  gameId?: string;
  region?: string;
  revision?: string;
  detectedLanguage?: SourceLanguage;
  details: Record<string, string | number | boolean | null>;
}

export interface AdapterCapability {
  extraction: boolean;
  fontAnalysis: boolean;
  thaiBuild: boolean;
  englishBuild: boolean;
  safeInjection: boolean;
  rebuild: boolean;
  emulatorVerified: boolean;
}

export interface GameAdapterMetadata {
  id: string;
  name: string;
  platform: PlatformId;
  status: AdapterStatus;
  gameId: string;
  region: string;
  revision: string;
  checksum?: string;
  supportedTargets: TargetLanguage[];
  capabilities: AdapterCapability;
  notes: string[];
}

export interface GameContext {
  file: GameFile;
  metadata: PlatformMetadata;
  adapterId?: string;
  outputBytes?: Uint8Array;
}

export interface TranslationEntry {
  id: string;
  sourceText: string;
  translatedText: string;
  translationVersion?: number;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  category: "dialog" | "menu" | "item" | "system" | "name" | "description" | "other";
  context?: string;
  resource: {
    path?: string;
    offset?: number;
    pointer?: number;
    index?: number;
  };
  constraints: {
    maxBytes?: number;
    maxChars?: number;
    maxLines?: number;
    fixedLength?: boolean;
  };
  protectedTokens: string[];
  status: EntryStatus;
  warnings: string[];
}

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  entryId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ExtractionResult {
  entries: TranslationEntry[];
  issues: ValidationIssue[];
}

export interface FontAnalysis {
  canRenderThai: boolean;
  canRenderEnglish: boolean;
  notes: string[];
  blockers: string[];
}

export interface LanguagePreparationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface InjectionResult {
  ok: boolean;
  issues: ValidationIssue[];
  outputPath?: string;
}

export interface BuildResult {
  ok: boolean;
  outputPath?: string;
  checksum?: string;
  outputBytes?: Uint8Array;
  issues: ValidationIssue[];
}

export interface BuildValidation {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface AnalysisReport {
  metadata: PlatformMetadata;
  adapterStatus: AdapterStatus;
  adapter?: GameAdapterMetadata;
  issues: ValidationIssue[];
}
