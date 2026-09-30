# Adapter Development

A Game Adapter must target one exact game identity, region, revision and preferably checksum.

Do not add a game as supported until these are understood and tested:

- text resource locations
- encoding/table behavior
- protected control codes
- pointer/resource references
- text size and relocation rules
- font format and target language rendering
- safe injection
- rebuild
- structural validation
- emulator verification

Adapters must block builds when translated text cannot be represented safely.

## Minimum Metadata

- adapter ID
- platform
- game ID
- region
- revision
- supported target languages
- real capability flags
- limitations and verification notes
