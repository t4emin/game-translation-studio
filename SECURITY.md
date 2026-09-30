# Security

Game files are untrusted input.

Implemented safeguards:

- Extension allow-list for `.gba`, `.iso`, `.cso`.
- Upload size limit through `GTS_MAX_UPLOAD_BYTES`.
- File name path separator rejection.
- API keys are read only from environment variables.
- Build is blocked when no exact Game Adapter matches.

Required future safeguards:

- streaming ISO processing
- archive path sanitization
- archive bomb protection
- safe temporary workspace cleanup
- no arbitrary script/binary execution from extracted content
- no shell commands built from unsanitized filenames
