import { useId, useRef, useState, type DragEvent } from "react";
import { ArrowRight, ArrowUpRight, FileVideo, FolderOpen, Link2, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function SourceIntake({ onFiles, onUrl, busy, error }: {
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
  const id = useId();
  const urlId = `${id}-url`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  return (
    <section
      id="media-intake"
      tabIndex={-1}
      aria-labelledby={`${id}-heading`}
      aria-busy={busy}
      className={cn("onyx-intake panel-machined", dragging && "onyx-intake-dragging")}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        if (!busy) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <header className="onyx-panel-heading">
        <div><p className="onyx-eyebrow">START HERE</p><h2 id={`${id}-heading`}>Bring your own.</h2></div>
        <span className="onyx-panel-symbol" aria-hidden="true"><ArrowUpRight size={20} /></span>
      </header>
      <p className="onyx-panel-description">One file or a whole collection. Make yourself at home.</p>

      <button type="button" className="onyx-dropzone" disabled={busy} onClick={() => fileInput.current?.click()}>
        <span className="onyx-drop-icon" aria-hidden="true"><Plus size={24} strokeWidth={1.4} /></span>
        <span className="onyx-drop-title">{dragging ? "Let it land here" : "Drop your media here"}</span>
        <span className="onyx-drop-hint">or browse files on your device</span>
        <span className="onyx-drop-formats">VIDEO <span aria-hidden="true">/</span> AUDIO <span aria-hidden="true">/</span> CAPTIONS</span>
      </button>
      <div className="onyx-intake-actions">
        <button type="button" className="onyx-button onyx-button-primary" disabled={busy} onClick={() => fileInput.current?.click()}><FileVideo size={16} aria-hidden="true" /> Open files</button>
        <button type="button" className="onyx-button" disabled={busy} onClick={() => folderInput.current?.click()}><FolderOpen size={16} aria-hidden="true" /> Folder</button>
      </div>
      <div className="onyx-divider"><span>or open a link</span></div>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy && url.trim()) onUrl(url.trim()); }}>
        <label htmlFor={urlId} className="onyx-field-label">Media or shared folder URL</label>
        <div className="onyx-url-field">
          <Link2 size={16} aria-hidden="true" />
          <input
            id={urlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste a link..."
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !url.trim()} aria-label={busy ? "Opening media link" : "Open media link"} title="Open link">
            {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </div>
        <p id={hintId} className="onyx-field-hint">Direct links, Drive, OneDrive, and Dropbox.</p>
      </form>
      {busy && <p className="onyx-inline-status" role="status">Opening your media...</p>}
      {error && <p id={errorId} className="onyx-error" role="alert">{error}</p>}
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        if (!busy && files.length) onFiles(files);
        event.target.value = "";
      }} />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // @ts-expect-error webkitdirectory is supported by browsers but absent from React's input attributes.
        webkitdirectory="true"
        directory="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (!busy && files.length) onFiles(files);
          event.target.value = "";
        }}
      />
    </section>
  );
}
