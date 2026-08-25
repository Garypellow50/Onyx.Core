import { formatBitrate, formatBytes } from "@/lib/player/format";

export interface PlaybackStats {
  resolution: string;
  fps: number;
  droppedFrames: number;
  totalFrames: number;
  bufferedAhead: number;
  bufferedRanges: number;
  bitrate: number;
  memory?: number | undefined;
  container: string;
  cores: number;
}

export function StatsOverlay({ stats }: { stats: PlaybackStats }) {
  const rows: [string, string][] = [
    ["Resolution", stats.resolution],
    ["Frames/sec", stats.fps > 0 ? stats.fps.toFixed(1) : "—"],
    ["Dropped", `${stats.droppedFrames} / ${stats.totalFrames}`],
    ["Buffer ahead", `${stats.bufferedAhead.toFixed(1)}s (${stats.bufferedRanges} range)`],
    ["Est. bitrate", formatBitrate(stats.bitrate)],
    ["Container", stats.container],
    ["JS heap", stats.memory ? formatBytes(stats.memory) : "not exposed"],
    ["Worker cores", String(stats.cores)],
  ];

  return (
    <div className="readout pointer-events-none absolute left-2 top-2 z-20 w-[min(15rem,calc(100%-1rem))] rounded-sm border border-hairline bg-background/90 p-2.5 text-[10px] backdrop-blur-sm sm:left-4 sm:top-4 sm:p-3 sm:text-[11px]">
      <p className="label-machined mb-2 text-primary">Playback stats</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="col-span-2 flex justify-between gap-2 border-b border-hairline/40 py-0.5 last:border-0"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
