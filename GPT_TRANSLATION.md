# GPT Translation

The GPT provider lives behind `src/core/providers/openai/provider.ts`.

Environment variables:

```text
OPENAI_API_KEY=
OPENAI_TRANSLATION_MODEL=
```

Rules:

- Never expose the API key to client code.
- Never send the whole ROM/ISO to GPT.
- Batch entries by stable IDs.
- Include source/target language, style, context, category, constraints, glossary and protected tokens.
- Validate that required protected tokens survive translation.
- GPT translates language only; it must never choose binary offsets or pointer behavior.
