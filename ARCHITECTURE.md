# Architecture

The required flow is:

```text
GBA Analyzer -> Generic Scanner -> Translation Workspace -> GBA Adapter -> Rebuild
```

## Platform Adapter

V1 is GBA-only. The platform layer detects and inspects `.gba` files, then reports honest compatibility:

- FULL: exact adapter can extract, translate, inject, rebuild and validate.
- EXPERIMENTAL: generic analysis/candidates are available, but build is blocked.
- UNSUPPORTED: the file is not a supported GBA input.

Implemented:

- `src/core/platforms/gba/adapter.ts`: GBA header, game code, revision and hash inspection.
- `src/core/platforms/gba/generic-scanner.ts`: read-only ASCII, Shift-JIS, pointer and compression candidates.

## Game Adapter

Game adapters own exact title/revision behavior:

- extraction
- encoding
- control codes
- pointers/resources
- font handling
- injection
- rebuild
- validation

Pokemon FireRed Rev 1 is the first FULL adapter. Unknown GBA games enter generic analysis mode; injection/export remains blocked until an adapter or known parser proves the format.

## Registry

`src/core/adapters/registry.ts` is the only source for supported game claims. UI and docs should render from this registry when game adapters are added.
