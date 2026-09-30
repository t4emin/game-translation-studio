import type { TargetLanguage } from "../types.ts";

export interface GlossaryTerm {
  id: string;
  source: string;
  target: string;
  targetLanguage: TargetLanguage;
  exact: boolean;
  note?: string;
}

export class Glossary {
  private terms = new Map<string, GlossaryTerm>();

  list(): GlossaryTerm[] {
    return Array.from(this.terms.values());
  }

  upsert(term: GlossaryTerm): void {
    this.terms.set(term.id, term);
  }

  delete(id: string): void {
    this.terms.delete(id);
  }

  relevantFor(text: string, targetLanguage: TargetLanguage): GlossaryTerm[] {
    return this.list().filter((term) => term.targetLanguage === targetLanguage && text.includes(term.source));
  }
}
