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
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className="cinema-intake panel-machined min-w-0 rounded-2xl p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Add media</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Start with files from this device, including caption files.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div
          onDragEnter={handleDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "rounded-2xl border border-dashed border-hairline bg-inset/40 p-3 transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="group flex min-h-36 w-full flex-col items-center justify-center rounded-xl px-4 py-6 text-center transition-colors hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-hairline bg-background text-primary transition-transform group-hover:-translate-y-0.5">
              <UploadCloud className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium text-foreground">
              {dragging ? "Drop files to add them" : "Browse files"}
            </span>
            <span className="mt-1 text-[13px] text-muted-foreground">
              Or drag and drop files here
            </span>
          </button>

          <div className="mt-2 flex justify-center border-t border-hairline pt-3">
            <button
              type="button"
              onClick={() => folderInput.current?.click()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-hairline bg-background px-4 text-[13px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FolderOpen className="size-4 text-primary" aria-hidden />
              Choose a folder
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-hairline" />
          <span className="text-[13px] text-muted-foreground">Alternate source</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) onUrl(url.trim());
          }}
        >
          <label htmlFor="intake-url" className="mb-2 block text-[13px] font-medium text-foreground">
            Media or shared folder URL
          </label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <input
              id="intake-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/media"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-hairline bg-inset px-3.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={busy || url.trim() === ""}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Loading" : "Load URL"}
            </button>
          </div>
        </form>

        <div className="sr-only" role="status" aria-live="polite">
          {busy ? "Loading source" : ""}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[13px] leading-relaxed text-destructive"
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
        // @ts-expect-error non-standard but supported in all major browsers
        webkitdirectory="true"
        directory="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onFiles(files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
