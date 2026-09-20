import { useId } from "react";
import { ListMusic, Music, Play, Video, X } from "lucide-react";
import { formatBytes } from "@/lib/player/format";
import type { MediaItem } from "@/lib/player/media";
import { usePersisted } from "@/lib/player/ui-state";
import { cn } from "@/lib/utils";
import { Thumb } from "./Thumb";
import { ViewToggle, type ViewMode } from "./ViewToggle";

export function Playlist({ items, currentId, onSelect, onRemove }: {
  items: MediaItem[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [storedView, setView] = usePersisted<ViewMode>("queue-view", "list");
  const view = storedView === "grid" || storedView === "xl" ? storedView : "list";
  const headingId = useId();

  return (
    <section className="onyx-queue panel-machined" aria-labelledby={headingId}>
      <header className="onyx-queue-header">
        <div><h2 id={headingId}>Your queue <span className="onyx-count">{items.length}</span></h2><p>A good thing, then the next.</p></div>
        {items.length > 0 && <ViewToggle value={view} onChange={setView} />}
      </header>
      {items.length === 0 ? (
        <div className="onyx-queue-empty"><ListMusic size={24} strokeWidth={1.3} aria-hidden="true" /><p>A little room for what you love.</p><span>Open a file to start your queue.</span></div>
      ) : (
        <ul className={cn("onyx-queue-items", `onyx-queue-${view}`)}>
          {items.map((item) => {
            const active = item.id === currentId;
            const Icon = item.kind === "audio" ? Music : Video;
            return (
              <li key={item.id} className={cn("onyx-queue-item", active && "is-current")}>
                <button type="button" className="onyx-queue-select" onClick={() => onSelect(item.id)} aria-current={active ? "true" : undefined} title={item.name}>
                  <Thumb source={{ key: item.url ?? item.id, name: item.name, url: item.url, file: item.file }} kind={item.kind} fill={view !== "list"} className="onyx-queue-thumb" />
                  <span className="onyx-queue-copy">
                    <span className="onyx-queue-name">{item.name}</span>
                    <span className="onyx-queue-meta">{active ? <Play size={11} aria-hidden="true" /> : <Icon size={11} aria-hidden="true" />}{active ? "Selected" : item.kind === "audio" ? "Audio" : "Video"}<span aria-hidden="true">·</span>{formatBytes(item.size)}</span>
                    {!item.native && <span className="onyx-remux-label">Remux required</span>}
                  </span>
                </button>
                <button type="button" className="onyx-queue-remove" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`} title="Remove from queue"><X size={15} aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
