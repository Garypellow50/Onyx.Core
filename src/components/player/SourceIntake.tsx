import { useId, useRef, useState, type DragEvent } from "react";
import { ArrowUpRight, FilePlus2, FolderOpen, Link2, Loader2, LockKeyhole, Plus } from "lucide-react";

export function SourceIntake({
  onFiles,
  onUrl,
  busy,
  error,
}: {
  onFiles: (files: File[]) => void;
  onUrl: (url: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  return (
    <section
      id="source-intake"
      aria-labelledby={`${id}-heading`}
      className="source-intake panel-machined"
      data-dragging={dragging}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-heading`} className="text-sm font-medium">Add to your cinema</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Start with something worth watching.</p>
        </div>
        <Plus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      <button type="button" className="source-drop" onClick={() => fileInput.current?.click()}>
        <FilePlus2 className="size-6 text-chart-2" strokeWidth={1.25} aria-hidden="true" />
        <span className="font-medium text-foreground">{dragging ? "Release to add your files" : "Drop your files here"}</span>
        <span>or browse this device</span>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="secondary-action" onClick={() => fileInput.current?.click()}>
          <FilePlus2 className="size-4" aria-hidden="true" />Files
        </button>
        <button type="button" className="secondary-action" onClick={() => folderInput.current?.click()}>
          <FolderOpen className="size-4" aria-hidden="true" />Folder
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Video, audio, and .srt, .vtt, .ass or .ssa captions.</p>

      <form
        className="mt-5 border-t border-hairline pt-5"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && url.trim()) onUrl(url.trim());
        }}
      >
        <label htmlFor={`${id}-url`} className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
          <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Or open a link
        </label>
        <div className="flex min-w-0 gap-2">
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            aria-describedby={`${id}-help`}
            className="source-input flex-1"
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="primary-action shrink-0 !px-3"
            aria-label={busy ? "Opening link" : "Open link"}
            title="Open link"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowUpRight className="size-4" aria-hidden="true" />}
          </button>
        </div>
        <p id={`${id}-help`} className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Direct media or public Drive, OneDrive, Dropbox and SharePoint links.
        </p>
        <p role="status" className="sr-only">{busy ? "Opening your link. Please wait." : ""}</p>
      </form>

      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">{error}</p>}
      <p className="source-privacy">
        <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-chart-2" aria-hidden="true" />
        Local files play on this device. No upload required.
      </p>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onFiles(files);
          event.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onFiles(files);
          event.target.value = "";
        }}
      />
    </section>
  );
}
