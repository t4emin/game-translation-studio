import type { GameAdapter } from "../contracts.ts";
import type { GameAdapterMetadata, PlatformMetadata } from "../types.ts";
import { pokemonFireRedRev1Adapter, pokemonFireRedRev1Metadata } from "./gba/pokemon-firered-rev1.ts";

const adapterMetadata: GameAdapterMetadata[] = [pokemonFireRedRev1Metadata];
const gameAdapters: GameAdapter[] = [pokemonFireRedRev1Adapter];

export function supportedGames(): GameAdapterMetadata[] {
  return adapterMetadata;
}

export async function findGameAdapter(metadata: PlatformMetadata): Promise<{ metadata?: GameAdapterMetadata; adapter?: GameAdapter }> {
  for (const adapter of gameAdapters) {
    if (await adapter.matches(metadata)) {
      return {
        adapter,
        metadata: adapterMetadata.find((item) => item.id === adapter.id)
      };
    }
  }

  return {};
}

export function adapterCount(): number {
  return gameAdapters.length;
}
