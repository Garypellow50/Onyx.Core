import type { PlaybackStats } from "./StatsOverlay";
import { cn } from "@/lib/utils";

interface SessionReadoutProps {
  container: string;
  stats: PlaybackStats;
  statsVisible: boolean;
  onToggleStats: () => void;
  name: string | null;
  rotation: number;
}

export function SessionReadout({
  container,
  stats,
  statsVisible,
  onToggleStats,
  name,
  rotation,
}: SessionReadoutProps) {
  const rows: [string, string][] = [
    ["Container", container],
    ["Resolution", stats.resolution],
    ["Dropped", `${stats.droppedFrames} frames`],
    ["Buffer", `${stats.bufferedAhead.toFixed(1)}s ahead`],
    ["Rotation", `${rotation}°`],
    ["Cores", String(stats.cores)],
  ];

  return (
    <details className="session-panel group rounded-2xl border border-hairline/70 bg-card/70 px-4 py-3 shadow-sm open:pb-5 sm:px-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-sans text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Session
          </span>
          <span className="mt-1 block truncate font-sans text-sm text-foreground">
            {name ?? "No source selected"}
          </span>
        </span>
        <span className="shrink-0 font-sans text-xs text-muted-foreground transition group-open:rotate-180" aria-hidden="true">
          ↓
        </span>
      </summary>

      <div className="mt-4 border-t border-hairline/60 pt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Playback diagnostics
          </h2>
          <button
            type="button"
            aria-pressed={statsVisible}
            onClick={onToggleStats}
            className={cn(
              "rounded-full border px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              statsVisible
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            Overlay {statsVisible ? "on" : "off"}
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-0.5 truncate font-sans text-xs text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
