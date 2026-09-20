import { ListVideo, Music, Play, Video, X } from "lucide-react";

import { formatBytes } from "@/lib/player/format";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/lib/player/media";
import { Thumb } from "./Thumb";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { usePersisted } from "@/lib/player/ui-state";

export function Playlist({
  items,
  currentId,
  onSelect,
  onRemove,
}: {
  items: MediaItem[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [view, setView] = usePersisted<ViewMode>("queue-view", "list");

  return (
    <section className="playlist panel-machined min-w-0 overflow-hidden rounded-2xl border border-hairline bg-panel/80">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">Up next</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {items.length === 0 ? "Your queue is empty" : `${items.length} file${items.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <ViewToggle value={view} onChange={setView} />
      </header>

      {items.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-hairline bg-inset text-primary">
            <ListVideo className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">Nothing queued yet</p>
          <p className="mt-1 max-w-60 text-xs leading-relaxed text-muted-foreground">
            Add video or audio files to build a private playback queue.
          </p>
        </div>
      ) : view === "list" ? (
        <ul className="max-h-72 divide-y divide-hairline overflow-auto">
          {items.map((item) => {
            const active = item.id === currentId;
            const Icon = item.kind === "audio" ? Music : Video;
            return (
              <li key={item.id} className={cn("relative", active && "bg-primary/5")}>
                <div className={cn("flex min-h-16 items-center gap-2 px-3 py-2", active && "border-l-2 border-primary pl-[10px]")}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Thumb
                      source={{ key: item.url ?? item.id, name: item.name, url: item.url, file: item.file }}
                      kind={item.kind}
                    />
                    <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>
                      {active ? <Play className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm leading-snug text-foreground">{item.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatBytes(item.size)}</span>
                        {!item.native && (
                          <span className="rounded-full border border-chart-4/50 px-2 py-0.5 text-chart-4">Remux needed</span>
                        )}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className={cn("grid max-h-[30rem] grid-cols-1 gap-3 overflow-auto p-3", view === "grid" && "sm:grid-cols-2")}>
          {items.map((item) => {
            const active = item.id === currentId;
            const Icon = item.kind === "audio" ? Music : Video;
            return (
              <li key={item.id} className="min-w-0">
                <div
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border border-hairline bg-background/40 transition hover:border-primary/50",
                    active && "border-primary bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "true" : undefined}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <Thumb
                      source={{ key: item.url ?? item.id, name: item.name, url: item.url, file: item.file }}
                      kind={item.kind}
                      fill
                      className="rounded-none border-0 border-b border-hairline"
                    />
                    <span className="flex items-start gap-2.5 p-3 pr-12">
                      {active ? (
                        <Play className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm leading-snug text-foreground">{item.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatBytes(item.size)}</span>
                          {!item.native && <span className="text-chart-4">Remux needed</span>}
                        </span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-xl bg-background/80 text-muted-foreground backdrop-blur-sm transition hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
