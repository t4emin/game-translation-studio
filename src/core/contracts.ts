import type {
  BuildResult,
  BuildValidation,
  DetectionResult,
  ExtractionResult,
  FontAnalysis,
  GameContext,
  GameFile,
  InjectionResult,
  LanguagePreparationResult,
  PlatformMetadata,
  TargetLanguage,
  TranslationEntry,
  ValidationResult
} from "./types.ts";

export interface PlatformAdapter {
  id: string;
  detect(file: GameFile): Promise<DetectionResult>;
  inspect(file: GameFile): Promise<PlatformMetadata>;
}

export interface GameAdapter {
  id: string;
  platform: string;
  matches(metadata: PlatformMetadata): Promise<boolean>;
  extract(context: GameContext): Promise<ExtractionResult>;
  analyzeFont(context: GameContext): Promise<FontAnalysis>;
  prepareTargetLanguage(context: GameContext, language: TargetLanguage): Promise<LanguagePreparationResult>;
  validateTranslations(context: GameContext, entries: TranslationEntry[]): Promise<ValidationResult>;
  inject(context: GameContext, entries: TranslationEntry[]): Promise<InjectionResult>;
  rebuild(context: GameContext): Promise<BuildResult>;
  validateBuild(context: GameContext): Promise<BuildValidation>;
}
