import { useRef, useState, type DragEvent } from "react";
import { FileVideo, FolderOpen, HardDrive, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

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
  const [url, setUrl] = useState("");
  const [dragDepth, setDragDepth] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dragging = dragDepth > 0;

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragDepth(0);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <section
      id="add-media"
      aria-labelledby="add-media-heading"
      className="min-w-0 rounded-2xl border border-hairline bg-panel p-4 shadow-sm sm:p-5"
    >
      <h2
        id="add-media-heading"
        className="mb-4 text-sm font-medium text-foreground"
      >
        Add media
      </h2>

      <div className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragDepth((d) => d + 1);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragDepth((d) => Math.max(0, d - 1));
          }}
          onDrop={handleDrop}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline bg-inset/40 py-6 text-center transition-colors sm:py-8",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <button
            id="intake-files"
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl px-4 py-2 text-sm text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <HardDrive
              className="size-6 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden
            />
            <span className="text-sm font-medium">
              Drop files here, or choose files
            </span>
            <span className="text-sm text-muted-foreground">
              Local files stay on this device.
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-hairline px-3 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <FileVideo className="size-4" aria-hidden />
            Choose files
          </button>
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-hairline px-3 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <FolderOpen className="size-4" aria-hidden />
            Choose a folder
          </button>
        </div>

        <div className="h-px bg-hairline" role="presentation" />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && url.trim()) onUrl(url.trim());
          }}
          className="flex flex-col gap-1.5"
        >
          <label htmlFor="intake-url" className="text-sm text-muted-foreground">
            Add from a link
          </label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <input
              id="intake-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://host.example/movie.mp4"
              aria-describedby="intake-url-help"
              aria-invalid={error ? true : undefined}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-hairline bg-inset px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || url.trim() === ""}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {busy ? "Opening…" : "Add"}
            </button>
          </div>
          <p id="intake-url-help" className="text-sm text-muted-foreground">
            Works with a direct file link or a shared folder link from Drive,
            OneDrive, or Dropbox. The link must be publicly viewable.
          </p>
        </form>

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm leading-relaxed text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // @ts-expect-error non-standard but supported in all major browsers
        webkitdirectory="true"
        directory="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </section>
  );
}
