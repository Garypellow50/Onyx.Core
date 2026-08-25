import { useMemo, useState } from "react";
import { CheckSquare, ChevronRight, Folder, Loader2, Square, X } from "lucide-react";

import { formatBytes } from "@/lib/player/format";
import { cn } from "@/lib/utils";
import { listFolderLink, type FolderChild, type FolderResult } from "@/lib/player/folder";
import { relayUrl } from "@/lib/player/link";
import { Thumb } from "./Thumb";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { usePersisted } from "@/lib/player/ui-state";

/**
 * Separate selection box for shared folders: lists every child the provider
 * returned, pre-checks the playable ones, and lets sub-folders be opened in
 * place before anything is queued.
 */
export function FolderPicker({
  listing,
  onClose,
  onAdd,
}: {
  listing: FolderResult;
  onClose: () => void;
  onAdd: (children: FolderChild[]) => void;
}) {
  const [current, setCurrent] = useState(listing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = usePersisted<ViewMode>("picker-view", "list");
  const [trail, setTrail] = useState<FolderResult[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set((listing.entries ?? []).filter((c) => c.playable).map((c) => c.url)),
  );

  const entries = current.entries ?? [];
  const files = useMemo(() => entries.filter((c) => c.kind === "file"), [entries]);
  const folders = useMemo(() => entries.filter((c) => c.kind === "folder"), [entries]);
  const selected = useMemo(() => files.filter((c) => chosen.has(c.url)), [files, chosen]);

  function toggle(child: FolderChild) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(child.url)) next.delete(child.url);
      else next.add(child.url);
      return next;
    });
  }

  async function open(child: FolderChild) {
    setBusy(true);
    setError(null);
    const result = await listFolderLink(child.url, child.folderId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "That sub-folder could not be read.");
      return;
    }
    setTrail((prev) => [...prev, current]);
    setCurrent({ ...result, folderName: result.folderName ?? child.name });
    setChosen(
      (prev) => new Set([...prev, ...(result.entries ?? []).filter((c) => c.playable).map((c) => c.url)]),
    );
  }

  function back() {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    setCurrent(prev);
  }

  const playable = files.filter((c) => c.playable);
  const allPlayableChosen = playable.length > 0 && playable.every((c) => chosen.has(c.url));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="panel-machined inset-safe flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <header className="flex items-center gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
          <Folder className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="label-machined truncate text-foreground">
              {current.folderName ?? current.provider ?? "Shared folder"}
            </h2>
            <p className="readout text-[10px] uppercase tracking-widest text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"} · {folders.length} folder
              {folders.length === 1 ? "" : "s"} · {selected.length} selected
            </p>
          </div>
          {trail.length > 0 && (
            <button
              type="button"
              onClick={back}
              className="readout rounded-sm border border-hairline px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              Back
            </button>
          )}
          <ViewToggle value={view} onChange={setView} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close folder browser"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2 sm:px-4">
          <button
            type="button"
            onClick={() =>
              setChosen((prev) => {
                const next = new Set(prev);
                for (const c of files) {
                  if (allPlayableChosen) next.delete(c.url);
                  else if (c.playable) next.add(c.url);
                }
                return next;
              })
            }
            className="readout text-[10px] uppercase tracking-widest text-primary"
          >
            {allPlayableChosen ? "Clear selection" : "Select all media"}
          </button>
          <button
            type="button"
            onClick={() => setChosen(new Set(files.map((c) => c.url)))}
            className="readout text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            Include every file
          </button>
        </div>

        {error && (
          <p className="border-b border-hairline px-3 py-2 text-xs text-destructive sm:px-4">{error}</p>
        )}
        {busy && (
          <p className="flex items-center gap-2 border-b border-hairline px-3 py-2 text-xs text-muted-foreground sm:px-4">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading folder…
          </p>
        )}

        {view !== "list" ? (
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
            {folders.length > 0 && (
              <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {folders.map((child) => (
                  <li key={`fg-${child.url}`}>
                    <button
                      type="button"
                      onClick={() => void open(child)}
                      className="flex w-full items-center gap-2 rounded-sm border border-hairline bg-panel px-2 py-2 text-left text-xs transition-colors hover:border-primary/50"
                    >
                      <Folder className="size-3.5 shrink-0 text-chart-4" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-foreground">{child.name}</span>
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <ul
              className={cn(
                "grid gap-3",
                view === "grid"
                  ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {files.map((child) => {
                const on = chosen.has(child.url);
                const audio = /\.(mp3|m4a|aac|flac|wav|ogg|opus|wma)$/i.test(child.name);
                return (
                  <li key={`g-${child.url}`} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => toggle(child)}
                      className={cn(
                        "group block w-full overflow-hidden rounded-sm border border-hairline bg-panel text-left transition-colors hover:border-primary/50",
                        on && "border-primary",
                      )}
                    >
                      <span className="relative block">
                        <Thumb
                          source={{
                            key: child.url,
                            name: child.name,
                            url: child.needsRelay ? relayUrl(child.url, child.name) : child.url,
                          }}
                          kind={audio ? "audio" : "video"}
                          fill
                          className={cn(
                            "rounded-none border-0 border-b border-hairline",
                            !child.playable && "opacity-50",
                          )}
                        />
                        <span className="absolute left-1 top-1 rounded-sm bg-background/70 p-0.5 backdrop-blur-sm">
                          {on ? (
                            <CheckSquare className="size-3.5 text-primary" aria-hidden />
                          ) : (
                            <Square className="size-3.5 text-muted-foreground" aria-hidden />
                          )}
                        </span>
                      </span>
                      <span className="block p-2">
                        <span
                          className={cn(
                            "block text-xs",
                            view === "xl" ? "line-clamp-2" : "truncate",
                            child.playable ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {child.name}
                        </span>
                        <span className="readout mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {child.size !== undefined && formatBytes(child.size)}
                          {!child.playable && (
                            <span className="rounded-sm border border-hairline px-1 py-0.5 text-[9px] uppercase tracking-widest">
                              other
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
        <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-auto">
          {folders.map((child) => (
            <li key={`f-${child.url}`}>
              <button
                type="button"
                onClick={() => void open(child)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-inset sm:px-4"
              >
                <Folder className="size-3.5 shrink-0 text-chart-4" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{child.name}</span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
          {files.map((child) => {
            const on = chosen.has(child.url);
            const audio = /\.(mp3|m4a|aac|flac|wav|ogg|opus|wma)$/i.test(child.name);
            return (
              <li key={child.url}>
                <button
                  type="button"
                  onClick={() => toggle(child)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-inset sm:px-4",
                    on && "bg-inset",
                  )}
                >
                  {on ? (
                    <CheckSquare className="size-3.5 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Square className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <Thumb
                    source={{
                      key: child.url,
                      name: child.name,
                      url: child.needsRelay ? relayUrl(child.url, child.name) : child.url,
                    }}
                    kind={audio ? "audio" : "video"}
                    className={cn(!child.playable && "opacity-50")}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      child.playable ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {child.name}
                  </span>
                  {child.size !== undefined && (
                    <span className="readout shrink-0 text-[10px] text-muted-foreground">
                      {formatBytes(child.size)}
                    </span>
                  )}
                  {!child.playable && (
                    <span className="readout shrink-0 rounded-sm border border-hairline px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                      other
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        )}

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={onClose}
            className="readout rounded-sm border border-hairline px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => onAdd(selected)}
            className="readout rounded-sm bg-primary px-3 py-1.5 text-[10px] uppercase tracking-widest text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Add {selected.length || ""} to queue
          </button>
        </footer>
      </div>
    </div>
  );
}
