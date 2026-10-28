import type { GameAdapter } from "../contracts.ts";
import type { GameAdapterMetadata, PlatformMetadata } from "../types.ts";
import { pokemonEmeraldAdapter, pokemonEmeraldMetadata } from "./gba/pokemon-emerald.ts";
import { pokemonFireRedRev1Adapter, pokemonFireRedRev1Metadata } from "./gba/pokemon-firered-rev1.ts";
import { yugiohWctAdapter, yugiohWctMetadata } from "./gba/yugioh-wct-2004.ts";
import { zeldaMinishCapAdapter, zeldaMinishCapMetadata } from "./gba/zelda-minish-cap.ts";

const adapterMetadata: GameAdapterMetadata[] = [pokemonFireRedRev1Metadata, pokemonEmeraldMetadata, zeldaMinishCapMetadata, yugiohWctMetadata];
const gameAdapters: GameAdapter[] = [pokemonFireRedRev1Adapter, pokemonEmeraldAdapter, zeldaMinishCapAdapter, yugiohWctAdapter];

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

export function getGameAdapter(id: string): { metadata: GameAdapterMetadata; adapter: GameAdapter } | undefined {
  const adapter = gameAdapters.find((item) => item.id === id);
  const metadata = adapterMetadata.find((item) => item.id === id);
  return adapter && metadata ? { adapter, metadata } : undefined;
}

export function adapterCount(): number {
  return gameAdapters.length;
}
