# Architecture

The required flow is:

```text
Translation Core -> Platform Adapter -> Game Adapter
```

## Platform Adapter

Platform adapters detect and inspect a platform. They may expose shared helpers such as GBA header parsing, checksums, binary readers and platform-specific filesystem helpers.

Implemented:

- `src/core/platforms/gba/adapter.ts`: partial GBA header inspection.

Reserved:

- `src/core/platforms/psp/adapter.ts`
- `src/core/platforms/ps2/adapter.ts`

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

No game adapter is registered yet. Unsupported files stop safely after metadata inspection.

## Registry

`src/core/adapters/registry.ts` is the only source for supported game claims. UI and docs should render from this registry when game adapters are added.
