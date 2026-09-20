import { ListMusic, Music, Play, Video, X } from "lucide-react";

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
    <section className="min-w-0 rounded-2xl border border-hairline bg-panel shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
        <h2 className="text-sm font-medium text-foreground">Up next</h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {items.length} file{items.length === 1 ? "" : "s"}
          </span>
          {items.length > 0 && <ViewToggle value={view} onChange={setView} />}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <ListMusic className="size-6 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-foreground">Your queue is empty</p>
          <p className="text-sm text-muted-foreground">
            Add media above to start building a queue.
          </p>
        </div>
      ) : view !== "list" ? (
        <ul
          className={cn(
            "grid max-h-[26rem] gap-3 overflow-auto p-3 sm:p-4",
            view === "grid" ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
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
                    active && "border-primary",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "true" : undefined}
                    className="block w-full text-left"
                  >
                    <Thumb
                      source={{
                        key: item.url ?? item.id,
                        name: item.name,
                        url: item.url,
                        file: item.file,
                      }}
                      kind={item.kind}
                      fill
                      className="rounded-none border-0 border-b border-hairline"
                    />
                    <div className="flex items-start gap-2 p-2">
                      {active ? (
                        <Play className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          title={item.name}
                          className={cn(
                            "text-sm text-foreground",
                            view === "xl" ? "line-clamp-2" : "truncate",
                          )}
                        >
                          {item.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                          {formatBytes(item.size)}
                          {!item.native && (
                            <span className="rounded-md border border-chart-4/60 px-1 py-0.5 text-[11px] text-chart-4">
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
                    className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-xl bg-background/70 text-muted-foreground backdrop-blur-sm transition-colors hover:text-destructive"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="max-h-56 divide-y divide-hairline overflow-auto sm:max-h-64">
          {items.map((item) => {
            const active = item.id === currentId;
            const Icon = item.kind === "audio" ? Music : Video;
            return (
              <li key={item.id}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-inset sm:px-4",
                    active &&
                      "border-l-2 border-l-primary bg-inset pl-[calc(0.75rem-2px)] sm:pl-[calc(1rem-2px)]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "true" : undefined}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Thumb
                      source={{
                        key: item.url ?? item.id,
                        name: item.name,
                        url: item.url,
                        file: item.file,
                      }}
                      kind={item.kind}
                    />
                    <span className="min-w-0 flex-1">
                      <span title={item.name} className="block truncate text-foreground">
                        {item.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                        {active ? (
                          <Play className="size-3.5 shrink-0 text-primary" aria-hidden />
                        ) : (
                          <Icon className="size-3.5 shrink-0" aria-hidden />
                        )}
                        <span>{formatBytes(item.size)}</span>
                        {!item.native && (
                          <span className="rounded-md border border-chart-4/60 px-1.5 py-0.5 text-[11px] text-chart-4">
                            remux
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="size-3.5" aria-hidden />
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
