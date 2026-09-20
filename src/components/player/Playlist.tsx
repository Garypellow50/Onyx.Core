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
    <section className="cinema-playlist panel-machined min-w-0 overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">Up next</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {items.length === 0
              ? "Your queue is ready for media"
              : `${items.length} file${items.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <ViewToggle value={view} onChange={setView} />
      </header>

      {items.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-hairline bg-inset text-primary">
            <ListVideo className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">Nothing queued yet</p>
          <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Add local files, a folder, or a URL to build your queue.
          </p>
        </div>
      ) : view !== "list" ? (
        <ul
          className={cn(
            "grid max-h-[26rem] gap-3 overflow-auto p-3 sm:p-4",
            view === "grid"
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {items.map((item) => {
            const active = item.id === currentId;
            const Icon = item.kind === "audio" ? Music : Video;
            return (
              <li key={item.id} className="min-w-0">
                <div
                  className={cn(
                    "group relative overflow-hidden rounded-xl border border-hairline bg-panel transition-colors hover:border-primary/50",
                    active && "border-primary bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "true" : undefined}
                    className="block min-h-11 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <Thumb
                      source={{ key: item.url ?? item.id, name: item.name, url: item.url, file: item.file }}
                      kind={item.kind}
                      fill
                      className="rounded-none border-0 border-b border-hairline"
                    />
                    <div className="flex items-start gap-2 p-3 pr-11">
                      {active ? (
                        <Play className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[13px] text-foreground", view === "xl" ? "line-clamp-2" : "truncate")}>
                          {item.name}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                          {formatBytes(item.size)}
                          {!item.native && (
                            <span className="rounded-md border border-chart-4/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-chart-4">
                              remux
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="absolute right-1.5 top-1.5 flex size-10 items-center justify-center rounded-xl border border-hairline bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <ul className="max-h-64 divide-y divide-hairline overflow-auto">
          {items.map((item) => {
            const active = item.id === currentId;
            const Icon = item.kind === "audio" ? Music : Video;
            return (
              <li key={item.id}>
                <div className={cn("flex min-h-16 items-center gap-2 px-3 py-2 transition-colors hover:bg-inset sm:px-4", active && "bg-primary/5")}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active && "text-primary",
                    )}
                  >
                    <Thumb
                      source={{ key: item.url ?? item.id, name: item.name, url: item.url, file: item.file }}
                      kind={item.kind}
                      className="rounded-lg"
                    />
                    {active ? (
                      <Play className="size-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.name}</span>
                    <span className="hidden shrink-0 text-[13px] text-muted-foreground sm:inline">{formatBytes(item.size)}</span>
                    {!item.native && (
                      <span className="hidden shrink-0 rounded-md border border-chart-4/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-chart-4 sm:inline">
                        remux
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
