import { supportedGames } from "@/core/adapters/registry";

export default function SupportedGamesPage() {
  const games = supportedGames();
  return <main className="shell">
    <header className="topbar"><div className="brand"><img src="/logo.png" className="brandLogo" alt=""/><div><p className="eyebrow">GBA ADAPTER REGISTRY</p><h1>Supported Games</h1></div></div></header>
    <section className="analysisPanel">
      {games.map((game) => {
        const full = Object.values(game.capabilities).every(Boolean);
        return <div className="translationRow" key={game.id}>
          <div className="analysisHeader"><span className={`badge ${full ? "full" : "experimental"}`}>{full ? "FULL" : "EXPERIMENTAL"}</span><strong>{game.name}</strong></div>
          <div className="analysisGrid">
            <span>Platform</span><strong>{game.platform.toUpperCase()}</strong>
            <span>Game Code</span><strong>{game.gameId}</strong>
            <span>Region</span><strong>{game.region}</strong>
            <span>Revision</span><strong>{game.revision}</strong>
            <span>SHA-256</span><strong className="hash">{game.checksum ?? "Exact hash not registered"}</strong>
            <span>Targets</span><strong>{game.supportedTargets.join(", ")}</strong>
          </div>
          <div className="capabilities">{Object.entries(game.capabilities).map(([key,value])=><span key={key}>{key}: {value ? "yes" : "no"}</span>)}</div>
          {game.notes.map((note)=><p className="muted" key={note}>{note}</p>)}
        </div>;
      })}
    </section>
  </main>;
}
