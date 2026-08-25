import { useRef, useState, type DragEvent } from "react";
import { FileVideo, FolderOpen, Loader2, UploadCloud } from "lucide-react";

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
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "panel-machined min-w-0 p-4 transition-colors sm:p-5",
        dragging && "border-primary",
      )}
    >
      <h2 className="label-machined mb-4 text-foreground">Intake module</h2>

      <div className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) onUrl(url.trim());
          }}
        >
          <label
            htmlFor="intake-url"
            className="readout mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            Remote url · file or folder · drive, onedrive, dropbox
          </label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <input
              id="intake-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://host.example/movie.mp4 or a shared folder link"
              className="readout min-w-0 flex-1 rounded-sm border border-hairline bg-inset px-3 py-2 text-xs text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || url.trim() === ""}
              className="label-machined inline-flex items-center justify-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
              Load
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="group flex w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-hairline py-5 transition-colors hover:bg-inset sm:py-7"
        >
          <UploadCloud
            className="size-6 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden
          />
          <span className="readout text-[10px] uppercase tracking-widest text-muted-foreground">
            Drag &amp; drop local source
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="readout inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-hairline px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <FileVideo className="size-3.5" aria-hidden />
            Files
          </button>
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className="readout inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-hairline px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <FolderOpen className="size-3.5" aria-hidden />
            Folder
          </button>
        </div>

        {error && (
          <p className="rounded-sm border border-destructive/50 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
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
    </div>
  );
}
