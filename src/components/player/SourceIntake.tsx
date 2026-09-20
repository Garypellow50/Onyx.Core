import { useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { FileVideo, FolderOpen, Loader2, UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";

/** Non-standard but universally supported directory-picker attributes. */
const folderInputAttrs = {
  webkitdirectory: "true",
  directory: "true",
} as React.InputHTMLAttributes<HTMLInputElement>;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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
  const [validation, setValidation] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const errorId = useId();

  const shownError = validation ?? error;

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounter.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) onFiles(files);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = url.trim();
    if (trimmed === "") {
      setValidation("Enter a link first.");
      return;
    }
    if (!isHttpUrl(trimmed)) {
      setValidation("Use a web link that starts with http:// or https://.");
      return;
    }
    setValidation(null);
    onUrl(trimmed);
  }

  function pickFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length) onFiles(list);
  }

  return (
    <div
      id="source-intake"
      className="source-intake flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Add source
        </p>
        <h2 className="mt-0.5 text-sm font-medium text-foreground">Local files or a link</h2>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <FileVideo className="size-4" aria-hidden />
          Open files
        </button>
        <button
          type="button"
          onClick={() => folderInput.current?.click()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <FolderOpen className="size-4" aria-hidden />
          Open folder
        </button>
      </div>

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-center transition-colors",
          dragging && "border-primary bg-accent",
        )}
      >
        <UploadCloud className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">Drag video or audio files here</p>
        <p className="text-[11px] text-muted-foreground/80">
          Local files stay on this device and are never uploaded.
        </p>
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Or a link
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="intake-url" className="text-xs font-medium text-foreground">
          Remote URL
        </label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <input
            id="intake-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (validation) setValidation(null);
            }}
            placeholder="https://host.example/movie.mp4"
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? errorId : undefined}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || url.trim() === ""}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {busy ? "Loading\u2026" : "Load"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Direct file links, or a shared folder link from Google Drive, OneDrive, or Dropbox.
        </p>
      </form>

      <p id={errorId} role="alert" aria-live="assertive" className={cn(!shownError && "sr-only")}>
        {shownError ? (
          <span className="block rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
            {shownError}
          </span>
        ) : null}
      </p>

      <input
        id="onyx-file-input"
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          pickFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...folderInputAttrs}
        onChange={(e) => {
          pickFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
